import { randomUUID } from "node:crypto";
import type { DeliveryDriverPrincipal } from "./delivery-driver-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

function runtime() {
  if (!productionDatabaseConfigured()) throw new Error("Delivery operations require the production database");
  return getProductionPostgresRuntime();
}

export async function assertCustomerDeliveryLegActive(principal: DeliveryDriverPrincipal, token: string) {
  const parts = token.trim().split(".");
  if (parts.length !== 5 || parts[0] !== "kmd1" || parts[1] !== "delivery" || !/^delivery_job_[a-f0-9]{32}$/.test(parts[2] ?? "")) {
    return;
  }

  const active = await runtime().nativePool.query(`
    SELECT 1
    FROM delivery_jobs j
    JOIN delivery_stops s ON s.job_id = j.id AND s.stop_kind = 'customer_dropoff'
    WHERE j.public_id = $1
      AND j.driver_id = $2
      AND j.status = 'in_progress'
      AND s.status = 'ready'
    LIMIT 1
  `, [parts[2], principal.driverId]);

  if (!active.rowCount) {
    throw new Error("Πάτησε πρώτα «Ξεκίνησα προς πελάτη» για να ενεργοποιηθεί η τελική παράδοση.");
  }
}

export async function driverStartCustomerDeliveryLeg(
  principal: DeliveryDriverPrincipal,
  input: { jobId: string; now?: number },
) {
  const now = input.now ?? Date.now();
  const client = await runtime().nativePool.connect();

  try {
    await client.query("BEGIN");

    const jobResult = await client.query<{
      job_uuid: string;
      job_id: string;
      order_uuid: string;
      order_id: string;
      job_type: string;
      status: string;
    }>(`
      SELECT
        j.id::text AS job_uuid,
        j.public_id AS job_id,
        o.id::text AS order_uuid,
        o.public_id AS order_id,
        j.job_type,
        j.status
      FROM delivery_jobs j
      JOIN customer_orders o ON o.id = j.order_id
      WHERE j.public_id = $1
        AND j.driver_id = $2
      LIMIT 1
      FOR UPDATE OF j
    `, [input.jobId, principal.driverId]);

    const job = jobResult.rows[0];
    if (!job || !["assigned", "in_progress", "ready"].includes(job.status)) {
      throw new Error("Η εργασία δεν είναι ενεργή ή δεν σου έχει ανατεθεί.");
    }
    if (job.job_type !== "outbound") {
      throw new Error("Η ενέργεια αφορά μόνο παράδοση προς πελάτη.");
    }

    const incompletePickup = await client.query(`
      SELECT 1
      FROM delivery_stops
      WHERE job_id = $1
        AND stop_kind = 'vendor_pickup'
        AND status <> 'completed'
      LIMIT 1
    `, [job.job_uuid]);
    if (incompletePickup.rowCount) {
      throw new Error("Ολοκλήρωσε πρώτα όλες τις παραλαβές από τα καταστήματα.");
    }

    const stopResult = await client.query<{
      stop_uuid: string;
      stop_id: string;
      status: string;
      sequence_no: number;
    }>(`
      SELECT
        id::text AS stop_uuid,
        public_id AS stop_id,
        status,
        sequence_no
      FROM delivery_stops
      WHERE job_id = $1
        AND stop_kind = 'customer_dropoff'
        AND status NOT IN ('completed', 'skipped', 'failed')
      ORDER BY sequence_no
      LIMIT 1
      FOR UPDATE
    `, [job.job_uuid]);

    const stop = stopResult.rows[0];
    if (!stop) throw new Error("Δεν υπάρχει ενεργό σημείο παράδοσης πελάτη.");

    const earlierStop = await client.query(`
      SELECT 1
      FROM delivery_stops
      WHERE job_id = $1
        AND sequence_no < $2
        AND status NOT IN ('completed', 'skipped')
      LIMIT 1
    `, [job.job_uuid, stop.sequence_no]);
    if (earlierStop.rowCount) {
      throw new Error("Υπάρχει προηγούμενο σημείο της διαδρομής που δεν έχει ολοκληρωθεί.");
    }

    if (stop.status !== "ready") {
      await client.query(`
        UPDATE delivery_stops
        SET status = 'ready', updated_at = $2
        WHERE id = $1
      `, [stop.stop_uuid, new Date(now)]);

      const message = `Ο οδηγός ξεκίνησε προς τον πελάτη για την παραγγελία ${job.order_id}.`;
      await client.query(`
        INSERT INTO delivery_events(
          id, public_id, job_id, stop_id, event_type, actor_type, actor_public_id,
          customer_visible, message, metadata, occurred_at
        ) VALUES($1,$2,$3,$4,'delivery.customer_leg_started','driver',$5,true,$6,$7::jsonb,$8)
      `, [
        randomUUID(),
        `delivery_event_${randomUUID().replaceAll("-", "")}`,
        job.job_uuid,
        stop.stop_uuid,
        principal.driverPublicId,
        message,
        JSON.stringify({ deliveryJobId: job.job_id, deliveryStopId: stop.stop_id }),
        new Date(now),
      ]);

      await client.query(`
        INSERT INTO order_timeline_events(
          id, public_id, order_id, event_type, actor_type, actor_public_id,
          customer_visible, message, metadata, created_at
        ) VALUES($1,$2,$3,'delivery.customer_leg_started','driver',$4,true,$5,$6::jsonb,$7)
      `, [
        randomUUID(),
        `ote_${randomUUID().replaceAll("-", "")}`,
        job.order_uuid,
        principal.driverPublicId,
        message,
        JSON.stringify({ deliveryJobId: job.job_id, deliveryStopId: stop.stop_id }),
        new Date(now),
      ]);
    }

    await client.query(`
      UPDATE delivery_jobs
      SET
        status = 'in_progress',
        live_tracking_enabled = true,
        started_at = COALESCE(started_at, $2),
        updated_at = $2
      WHERE id = $1
    `, [job.job_uuid, new Date(now)]);

    await client.query("COMMIT");
    return { ok: true, jobId: job.job_id, stopId: stop.stop_id, alreadyStarted: stop.status === "ready" };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
