import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { molliePaymentsEnabled, requireMolliePayments } from "./mollie-runtime";

const TWO_HOURS_MS = 2 * 60 * 60 * 1_000;
const TWENTY_TWO_HOURS_MS = 22 * 60 * 60 * 1_000;
const PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1_000;
const BATCH_LIMIT = 250;

type PendingOrder = Readonly<{
  order_uuid: string;
  order_id: string;
  order_number: string;
  user_uuid: string | null;
  created_at: Date | string;
}>;

export type PendingPaymentLifecycleResult = Readonly<{
  reservationsExtended: number;
  scanned: number;
  reminder2hQueued: number;
  reminder22hQueued: number;
  cancelled: number;
  deferred: number;
}>;

function emptyResult(): PendingPaymentLifecycleResult {
  return { reservationsExtended: 0, scanned: 0, reminder2hQueued: 0, reminder22hQueued: 0, cancelled: 0, deferred: 0 };
}

function orderAgeMs(order: PendingOrder, now: number): number {
  const createdAt = order.created_at instanceof Date ? order.created_at.getTime() : new Date(order.created_at).getTime();
  return Number.isFinite(createdAt) ? Math.max(0, now - createdAt) : 0;
}

async function queueReminder(client: PoolClient, order: PendingOrder, kind: "2h" | "22h", now: number): Promise<boolean> {
  if (!order.user_uuid) return false;
  const urgent = kind === "22h";
  const title = urgent
    ? `Τελευταία υπενθύμιση πληρωμής · ${order.order_number}`
    : `Η πληρωμή της παραγγελίας ${order.order_number} εκκρεμεί`;
  const body = urgent
    ? `Η παραγγελία ${order.order_number} παραμένει απλήρωτη και η 24ωρη προθεσμία λήγει σε περίπου 2 ώρες. Συνέχισε την πληρωμή από τον λογαριασμό σου για να παραμείνει ενεργή.`
    : `Η παραγγελία ${order.order_number} παραμένει απλήρωτη. Την κρατάμε ενεργή για έως 24 ώρες από τη δημιουργία της. Μπορείς να συνεχίσεις την πληρωμή από τον λογαριασμό σου.`;
  const eventType = urgent ? "order.payment_reminder_22h" : "order.payment_reminder_2h";
  const dedupeKey = `order:${order.order_id}:payment-reminder:${kind}`;
  const payload = {
    orderId: order.order_id,
    orderNumber: order.order_number,
    paymentWindowHours: 24,
    reminderAfterHours: urgent ? 22 : 2,
    ctaPath: `/account/orders/${order.order_id}`,
    ctaLabel: "Συνέχιση πληρωμής",
    preheader: urgent ? "Απομένουν περίπου 2 ώρες πριν από την αυτόματη ακύρωση." : "Η παραγγελία σου περιμένει την ολοκλήρωση της πληρωμής."
  };
  const inserted = await client.query(`
    INSERT INTO notifications(
      id,public_id,user_id,vendor_id,channel,purpose,event_type,template_version,locale,
      title,body,payload,status,dedupe_key,created_at,next_attempt_at
    ) VALUES($1,$2,$3,NULL,'email','transactional',$4,'pending-payment-v1','el',$5,$6,$7::jsonb,'queued',$8,$9,$9)
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING id
  `, [
    randomUUID(), `notification_${randomUUID().replaceAll("-", "")}`, order.user_uuid, eventType,
    title, body, JSON.stringify(payload), dedupeKey, new Date(now)
  ]);
  return Boolean(inserted.rowCount);
}

async function hasPayableReservation(client: PoolClient, orderUuid: string, now: number): Promise<boolean> {
  const result = await client.query(`
    SELECT COUNT(DISTINCT ol.id)::int AS line_count,
           COUNT(DISTINCT ol.id) FILTER (
             WHERE sr.status='active' AND sr.expires_at>$2
           )::int AS active_reserved_line_count
    FROM order_lines ol
    LEFT JOIN stock_reservations sr ON sr.order_line_id=ol.id
    WHERE ol.order_id=$1
  `, [orderUuid, new Date(now)]);
  const row = result.rows[0];
  const lines = Number(row?.line_count ?? 0);
  return lines > 0 && Number(row?.active_reserved_line_count ?? 0) === lines;
}

async function cancelPendingOrder(client: PoolClient, order: PendingOrder, now: number): Promise<boolean> {
  await client.query("BEGIN");
  try {
    const locked = await client.query(`
      SELECT id FROM customer_orders
      WHERE id=$1 AND status='pending_payment' AND created_at <= $2
      FOR UPDATE
    `, [order.order_uuid, new Date(now - PAYMENT_WINDOW_MS)]);
    if (!locked.rowCount) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query(`
      UPDATE stock_reservations
      SET status='released',released_at=COALESCE(released_at,$2)
      WHERE order_line_id IN (SELECT id FROM order_lines WHERE order_id=$1) AND status='active'
    `, [order.order_uuid, new Date(now)]);
    await client.query(`UPDATE order_lines SET status='cancelled' WHERE order_id=$1 AND status IN ('awaiting_vendor','accepted')`, [order.order_uuid]);
    await client.query(`UPDATE fulfilment_orders SET status='cancelled',updated_at=$2 WHERE order_id=$1 AND status NOT IN ('delivered','cancelled')`, [order.order_uuid, new Date(now)]);
    await client.query(`
      UPDATE payments SET status='cancelled',updated_at=$2
      WHERE order_id=$1 AND captured_minor=0 AND status IN ('created','requires_action','authorised','failed','cancelled')
    `, [order.order_uuid, new Date(now)]);
    await client.query(`
      UPDATE customer_orders
      SET status='cancelled',cancelled_at=$2,cancellation_reason='payment_window_expired',updated_at=$2
      WHERE id=$1 AND status='pending_payment'
    `, [order.order_uuid, new Date(now)]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function runPendingPaymentLifecycle(now = Date.now()): Promise<PendingPaymentLifecycleResult> {
  if (!productionDatabaseConfigured()) return emptyResult();
  const runtime = getProductionPostgresRuntime();

  // Checkout historically created a 15-minute reservation. The minute-level lifecycle extends
  // every still-valid pending-payment reservation to the explicit 24-hour payment deadline.
  // We deliberately do not revive an already expired/released reservation because that stock
  // may already have become available to another customer.
  const extended = await runtime.nativePool.query(`
    UPDATE stock_reservations sr
    SET expires_at=GREATEST(sr.expires_at,o.created_at + interval '24 hours')
    FROM order_lines ol,customer_orders o
    WHERE sr.order_line_id=ol.id AND ol.order_id=o.id
      AND o.status='pending_payment'
      AND o.created_at > $1
      AND sr.status='active' AND sr.expires_at>$2
      AND sr.expires_at < o.created_at + interval '24 hours'
  `, [new Date(now - PAYMENT_WINDOW_MS), new Date(now)]);

  const candidates = await runtime.nativePool.query<PendingOrder>(`
    SELECT o.id::text AS order_uuid,o.public_id AS order_id,
           COALESCE(o.order_number,o.public_id) AS order_number,o.user_id::text AS user_uuid,o.created_at
    FROM customer_orders o
    WHERE o.status='pending_payment' AND o.created_at <= $1
    ORDER BY o.created_at,o.id
    LIMIT $2
  `, [new Date(now - TWO_HOURS_MS), BATCH_LIMIT]);

  let reminder2hQueued = 0;
  let reminder22hQueued = 0;
  let cancelled = 0;
  let deferred = 0;
  const client = await runtime.nativePool.connect();
  try {
    for (const order of candidates.rows) {
      const age = orderAgeMs(order, now);
      if (age >= PAYMENT_WINDOW_MS) {
        try {
          if (molliePaymentsEnabled()) {
            await requireMolliePayments().prepareOrderCancellation({ orderId: order.order_id, reason: "payment_window_expired", now });
          } else {
            const payment = await client.query(`SELECT provider,provider_payment_id,provider_transaction_id FROM payments WHERE order_id=$1 LIMIT 1`, [order.order_uuid]);
            const row = payment.rows[0];
            if (row?.provider === "mollie" && (row.provider_payment_id || row.provider_transaction_id)) {
              deferred += 1;
              continue;
            }
          }
          if (await cancelPendingOrder(client, order, now)) cancelled += 1;
        } catch (error) {
          deferred += 1;
          console.error(JSON.stringify({ level: "error", event: "pending_payment.cancellation_deferred", orderId: order.order_id, message: error instanceof Error ? error.message : String(error) }));
        }
        continue;
      }

      if (!(await hasPayableReservation(client, order.order_uuid, now))) continue;
      if (age >= TWENTY_TWO_HOURS_MS) {
        if (await queueReminder(client, order, "22h", now)) reminder22hQueued += 1;
      } else if (age >= TWO_HOURS_MS) {
        if (await queueReminder(client, order, "2h", now)) reminder2hQueued += 1;
      }
    }
  } finally {
    client.release();
  }

  return {
    reservationsExtended: extended.rowCount ?? 0,
    scanned: candidates.rowCount ?? 0,
    reminder2hQueued,
    reminder22hQueued,
    cancelled,
    deferred
  };
}
