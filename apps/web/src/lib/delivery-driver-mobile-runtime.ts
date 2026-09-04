import type { DeliveryDriverPrincipal } from "./delivery-driver-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const DEFAULT_SHIFT_MS = 12 * 60 * 60_000;

function runtime() {
  if (!productionDatabaseConfigured()) throw new Error("Delivery driver mobile runtime requires the production database");
  return getProductionPostgresRuntime();
}

export type DeliveryDriverMobileMeta = Readonly<{
  clockedInToday: boolean;
  orderNumbers: Readonly<Record<string, string>>;
}>;

export async function getDeliveryDriverMobileMeta(principal: DeliveryDriverPrincipal): Promise<DeliveryDriverMobileMeta> {
  const db = runtime();
  const [driver, orders] = await Promise.all([
    db.nativePool.query<{ clocked_in_today: boolean }>(`
      SELECT COALESCE(
        (shift_started_at AT TIME ZONE 'Europe/Athens')::date = (now() AT TIME ZONE 'Europe/Athens')::date,
        false
      ) AS clocked_in_today
      FROM delivery_drivers
      WHERE id=$1 AND status='active'
      LIMIT 1
    `, [principal.driverId]),
    db.nativePool.query<{ job_id: string; order_number: string }>(`
      SELECT DISTINCT j.public_id AS job_id, o.order_number
      FROM delivery_jobs j
      JOIN customer_orders o ON o.id=j.order_id
      WHERE (
        j.driver_id=$1 AND j.status IN ('assigned','in_progress','ready','queued')
      ) OR EXISTS (
        SELECT 1
        FROM delivery_assignment_offers ao
        WHERE ao.job_id=j.id
          AND ao.driver_id=$1
          AND ao.state='offered'
          AND ao.expires_at>now()
      )
    `, [principal.driverId]),
  ]);
  return {
    clockedInToday: driver.rows[0]?.clocked_in_today === true,
    orderNumbers: Object.fromEntries(orders.rows.map((row) => [row.job_id, row.order_number])),
  };
}

export async function clockInDeliveryDriverForToday(principal: DeliveryDriverPrincipal, now = Date.now()) {
  const db = runtime();
  const client = await db.nativePool.connect();
  const at = new Date(now);
  const endsAt = new Date(now + DEFAULT_SHIFT_MS);
  try {
    await client.query("BEGIN");

    // A stale open shift can survive from a previous day (for example after a
    // migrated/test driver never clocked out). The timekeeping layer reuses any
    // open shift, so without closing it here it would immediately overwrite
    // today's shift_started_at and keep the mobile app on the clock-in screen.
    // Bound the automatic close to the normal 12-hour shift window so a stale
    // record cannot inflate worked-time reporting for several days.
    await client.query(`
      UPDATE delivery_driver_breaks b
      SET ended_at=GREATEST(
            b.started_at,
            LEAST($2::timestamptz, s.started_at + interval '12 hours')
          ),
          updated_at=$2
      FROM delivery_driver_shifts s
      WHERE b.shift_id=s.id
        AND s.driver_id=$1
        AND s.ended_at IS NULL
        AND b.ended_at IS NULL
        AND (s.started_at AT TIME ZONE 'Europe/Athens')::date
              <> ($2::timestamptz AT TIME ZONE 'Europe/Athens')::date
    `, [principal.driverId, at]);

    await client.query(`
      UPDATE delivery_driver_shifts
      SET ended_at=LEAST($2::timestamptz, started_at + interval '12 hours'),
          end_source='system',
          updated_at=$2
      WHERE driver_id=$1
        AND ended_at IS NULL
        AND (started_at AT TIME ZONE 'Europe/Athens')::date
              <> ($2::timestamptz AT TIME ZONE 'Europe/Athens')::date
    `, [principal.driverId, at]);

    await client.query(`
      UPDATE delivery_drivers
      SET operational_status=CASE WHEN EXISTS(
            SELECT 1 FROM delivery_jobs j
            WHERE j.driver_id=delivery_drivers.id AND j.status IN ('assigned','in_progress')
          ) THEN 'busy' ELSE 'available' END,
          accepting_jobs=true,
          shift_started_at=CASE
            WHEN shift_started_at IS NULL
              OR (shift_started_at AT TIME ZONE 'Europe/Athens')::date <> ($2::timestamptz AT TIME ZONE 'Europe/Athens')::date
            THEN $2
            ELSE shift_started_at
          END,
          shift_ends_at=CASE
            WHEN shift_started_at IS NULL
              OR (shift_started_at AT TIME ZONE 'Europe/Athens')::date <> ($2::timestamptz AT TIME ZONE 'Europe/Athens')::date
              OR shift_ends_at IS NULL
              OR shift_ends_at <= $2
            THEN $3
            ELSE shift_ends_at
          END,
          updated_at=$2
      WHERE id=$1 AND status='active'
    `, [principal.driverId, at, endsAt]);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return getDeliveryDriverMobileMeta(principal);
}
