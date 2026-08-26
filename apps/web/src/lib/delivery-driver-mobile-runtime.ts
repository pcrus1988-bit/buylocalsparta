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
  const at = new Date(now);
  const endsAt = new Date(now + DEFAULT_SHIFT_MS);
  await runtime().nativePool.query(`
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
  return getDeliveryDriverMobileMeta(principal);
}
