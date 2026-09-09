import { randomUUID } from "node:crypto";
import { MolliePaymentsClient, mollieConfigFromEnv, mollieEnvironment } from "@buy-local-sparta/mollie-payments";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1_000;
const TERMINAL_RETRYABLE_PROVIDER_STATUSES = new Set(["failed", "canceled", "expired"]);

type StoredMolliePayment = Readonly<{
  payment_uuid: string;
  order_id: string;
  order_number: string | null;
  order_status: string;
  order_created_at: Date | string;
  customer_id: string | null;
  payment_status: string;
  provider_payment_id: string | null;
  provider_transaction_id: string | null;
  provider_verified_at: Date | null;
  captured_minor: string | number;
  total_minor: string | number;
  gift_card_minor: string | number;
  is_historical?: boolean;
}>;

export function molliePaymentsEnabled(): boolean {
  return process.env.MOLLIE_PAYMENTS_ENABLED === "true";
}

export function molliePaymentsReady(): boolean {
  if (!molliePaymentsEnabled() || !process.env.DATABASE_URL?.trim()) return false;
  try { return Boolean(getProductionPostgresRuntime().molliePayments); } catch { return false; }
}

export async function molliePaymentsProviderReadiness(): Promise<{
  enabled: boolean;
  ready: boolean;
  environment: string;
  message?: string;
}> {
  const enabled = molliePaymentsEnabled();
  if (!enabled) return { enabled: false, ready: true, environment: "disabled" };
  if (!process.env.DATABASE_URL?.trim()) return { enabled: true, ready: false, environment: "unknown", message: "Mollie payments require PostgreSQL runtime" };
  try {
    const config = mollieConfigFromEnv();
    if (!getProductionPostgresRuntime().molliePayments) throw new Error("Mollie payments are not configured");
    const provider = await new MolliePaymentsClient(config).readiness();
    return { enabled: true, ready: provider.ok, environment: provider.environment };
  } catch (error) {
    let environment = "unknown";
    try { environment = mollieEnvironment(mollieConfigFromEnv()); } catch { /* configuration error is returned below */ }
    const message = error instanceof Error ? error.message : "Mollie readiness failed";
    console.error(JSON.stringify({ level: "error", event: "mollie.readiness_failed", environment, message }));
    return { enabled: true, ready: false, environment, message };
  }
}

export function requireMolliePayments() {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("Mollie payments require PostgreSQL runtime");
  if (!molliePaymentsEnabled()) throw new Error("Mollie payments are not enabled");
  const service = getProductionPostgresRuntime().molliePayments;
  if (!service) throw new Error("Mollie payments are not configured");
  return service;
}

function amountMinor(row: StoredMolliePayment): number {
  const value = Number(row.total_minor) - Number(row.gift_card_minor);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Stored Mollie payable total is invalid");
  return value;
}

function createdAtMs(row: StoredMolliePayment): number {
  const value = row.order_created_at instanceof Date ? row.order_created_at.getTime() : new Date(row.order_created_at).getTime();
  if (!Number.isFinite(value)) throw new Error("Stored Mollie order creation time is invalid");
  return value;
}

function assertProviderIdentity(provider: Awaited<ReturnType<MolliePaymentsClient["retrievePayment"]>>, row: StoredMolliePayment): void {
  const expectedAmount = amountMinor(row);
  if (provider.orderId !== row.order_id) throw new Error("Mollie payment/order id mismatch");
  if (provider.amountCurrency !== "EUR" || provider.amountMinor !== expectedAmount) throw new Error("Mollie payment amount mismatch");
}

async function recordTerminalAttemptWithoutCancelling(
  row: StoredMolliePayment,
  provider: Awaited<ReturnType<MolliePaymentsClient["retrievePayment"]>>,
  source: "redirect" | "webhook" | "manual",
  now: number
) {
  const runtime = getProductionPostgresRuntime();
  const localStatus = provider.status === "failed" ? "failed" : "cancelled";
  await runtime.nativePool.query("BEGIN");
  try {
    const current = await runtime.nativePool.query(`
      UPDATE payments
      SET status=$3::payment_status,provider_verified_at=$4,
          provider_payload=provider_payload||$5::jsonb,updated_at=$4
      WHERE id=$1::uuid AND (provider_payment_id=$2 OR provider_transaction_id=$2) AND captured_minor=0
      RETURNING id
    `, [
      row.payment_uuid,
      provider.paymentId,
      localStatus,
      new Date(now),
      JSON.stringify({ lastProviderStatus: provider.status, lastVerifiedSource: source, terminalRetryAllowedUntil: new Date(createdAtMs(row) + PAYMENT_WINDOW_MS).toISOString() })
    ]);
    if (current.rowCount) {
      await runtime.nativePool.query(`
        INSERT INTO payment_events(id,public_id,payment_id,provider,provider_event_id,event_type,signature_valid,payload,processed_at,created_at)
        VALUES($1,$2,$3::uuid,'mollie',$4,$5,true,$6::jsonb,$7,$7)
        ON CONFLICT(provider,provider_event_id) DO NOTHING
      `, [
        randomUUID(),
        `payment_event_${randomUUID().replaceAll("-", "")}`,
        row.payment_uuid,
        `payment:${provider.paymentId}:${provider.status}:${provider.amountRefundedMinor}`,
        `payment_${provider.status}`,
        JSON.stringify({ paymentId: provider.paymentId, orderId: row.order_id, orderNumber: row.order_number?.trim() || row.order_id, status: provider.status, amountMinor: provider.amountMinor, amountRefundedMinor: provider.amountRefundedMinor, method: provider.method ?? null, source }),
        new Date(now)
      ]);
    }
    await runtime.nativePool.query("COMMIT");
  } catch (error) {
    await runtime.nativePool.query("ROLLBACK");
    throw error;
  }
  return {
    orderId: row.order_id,
    orderNumber: row.order_number?.trim() || row.order_id,
    paymentStatus: localStatus,
    orderStatus: "pending_payment",
    paymentId: provider.paymentId,
    amountMinor: amountMinor(row)
  };
}

export async function prepareMolliePaymentRetry(input: { orderId: string; customerId: string; now?: number }): Promise<boolean> {
  const now = input.now ?? Date.now();
  const runtime = getProductionPostgresRuntime();
  const found = await runtime.nativePool.query<StoredMolliePayment>(`
    SELECT p.id::text AS payment_uuid,o.public_id AS order_id,o.order_number,o.status::text AS order_status,o.created_at AS order_created_at,
           u.public_id AS customer_id,p.status::text AS payment_status,p.provider_payment_id,p.provider_transaction_id,p.provider_verified_at,
           p.captured_minor,o.total_minor,
           COALESCE((SELECT SUM(-gcl.amount_minor) FROM gift_card_ledger gcl WHERE gcl.order_public_id=o.public_id AND gcl.entry_type='redeem'),0) AS gift_card_minor
      FROM payments p JOIN customer_orders o ON o.id=p.order_id LEFT JOIN users u ON u.id=o.user_id
     WHERE p.provider='mollie' AND o.public_id=$1 LIMIT 1
  `, [input.orderId]);
  const row = found.rows[0];
  if (!row || row.order_status !== "pending_payment" || row.customer_id !== input.customerId) return false;
  if (createdAtMs(row) + PAYMENT_WINDOW_MS <= now) throw new Error("PAYMENT_WINDOW_EXPIRED");
  if (Number(row.captured_minor) > 0) return false;
  const paymentId = row.provider_payment_id ?? row.provider_transaction_id;
  if (!paymentId) return false;

  const provider = await new MolliePaymentsClient(mollieConfigFromEnv()).retrievePayment(paymentId);
  assertProviderIdentity(provider, row);
  if (!TERMINAL_RETRYABLE_PROVIDER_STATUSES.has(provider.status)) return false;

  const client = await runtime.nativePool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<StoredMolliePayment>(`
      SELECT p.id::text AS payment_uuid,o.public_id AS order_id,o.order_number,o.status::text AS order_status,o.created_at AS order_created_at,
             u.public_id AS customer_id,p.status::text AS payment_status,p.provider_payment_id,p.provider_transaction_id,p.provider_verified_at,
             p.captured_minor,o.total_minor,
             COALESCE((SELECT SUM(-gcl.amount_minor) FROM gift_card_ledger gcl WHERE gcl.order_public_id=o.public_id AND gcl.entry_type='redeem'),0) AS gift_card_minor
        FROM payments p JOIN customer_orders o ON o.id=p.order_id LEFT JOIN users u ON u.id=o.user_id
       WHERE p.id=$1::uuid FOR UPDATE OF p,o
    `, [row.payment_uuid]);
    const current = locked.rows[0];
    const currentPaymentId = current?.provider_payment_id ?? current?.provider_transaction_id;
    if (!current || current.order_status !== "pending_payment" || current.customer_id !== input.customerId || currentPaymentId !== paymentId || Number(current.captured_minor) > 0 || createdAtMs(current) + PAYMENT_WINDOW_MS <= now) {
      await client.query("ROLLBACK");
      return false;
    }

    const previousStatus = provider.status === "failed" ? "failed" : "cancelled";
    await client.query(`
      UPDATE payments
      SET status='created',provider_payment_id=NULL,provider_transaction_id=NULL,provider_correlation_id=NULL,provider_verified_at=$3,
          provider_payload=jsonb_set(
            provider_payload||jsonb_build_object(
              'paymentCreationState','retry_ready',
              'lastProviderStatus',$4::text,
              'lastTerminalPaymentId',$2::text,
              'lastTerminalPaymentStatus',$5::text,
              'paymentRetryPreparedAt',$3::text
            ),
            '{historicalPaymentIds}',
            COALESCE(provider_payload->'historicalPaymentIds','[]'::jsonb)||to_jsonb($2::text),
            true
          ),updated_at=$3
      WHERE id=$1::uuid
    `, [row.payment_uuid, paymentId, new Date(now), provider.status, previousStatus]);
    await client.query(`
      INSERT INTO payment_events(id,public_id,payment_id,provider,provider_event_id,event_type,signature_valid,payload,processed_at,created_at)
      VALUES($1,$2,$3::uuid,'mollie',$4,$5,true,$6::jsonb,$7,$7)
      ON CONFLICT(provider,provider_event_id) DO NOTHING
    `, [
      randomUUID(),
      `payment_event_${randomUUID().replaceAll("-", "")}`,
      row.payment_uuid,
      `payment:${paymentId}:${provider.status}:${provider.amountRefundedMinor}`,
      `payment_${provider.status}`,
      JSON.stringify({ paymentId, orderId: row.order_id, orderNumber: row.order_number?.trim() || row.order_id, status: provider.status, amountMinor: provider.amountMinor, amountRefundedMinor: provider.amountRefundedMinor, method: provider.method ?? null, source: "payment_retry_preflight" }),
      new Date(now)
    ]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function reconcileMolliePaymentSafely(input: {
  paymentId: string;
  source: "redirect" | "webhook" | "manual";
  now?: number;
}): Promise<{ orderId: string; orderNumber: string; paymentStatus: string; orderStatus: string; paymentId: string; amountMinor: number }> {
  const now = input.now ?? Date.now();
  if (process.env.DATABASE_URL?.trim()) {
    const existing = await getProductionPostgresRuntime().nativePool.query<StoredMolliePayment>(`
      SELECT p.id::text AS payment_uuid,o.public_id AS order_id,o.order_number,o.status::text AS order_status,o.created_at AS order_created_at,
             u.public_id AS customer_id,p.status::text AS payment_status,p.provider_payment_id,p.provider_transaction_id,p.provider_verified_at,
             p.captured_minor,o.total_minor,
             COALESCE((SELECT SUM(-gcl.amount_minor) FROM gift_card_ledger gcl WHERE gcl.order_public_id=o.public_id AND gcl.entry_type='redeem'),0) AS gift_card_minor,
             ((p.provider_payment_id IS DISTINCT FROM $1 AND p.provider_transaction_id IS DISTINCT FROM $1)
               AND COALESCE(p.provider_payload->'historicalPaymentIds','[]'::jsonb) ? $1) AS is_historical
        FROM payments p JOIN customer_orders o ON o.id=p.order_id LEFT JOIN users u ON u.id=o.user_id
       WHERE p.provider='mollie'
         AND (p.provider_payment_id=$1 OR p.provider_transaction_id=$1 OR COALESCE(p.provider_payload->'historicalPaymentIds','[]'::jsonb) ? $1)
       LIMIT 1
    `, [input.paymentId]);
    const row = existing.rows[0];
    if (row?.is_historical) {
      return {
        orderId: row.order_id,
        orderNumber: row.order_number?.trim() || row.order_id,
        paymentStatus: row.payment_status,
        orderStatus: row.order_status,
        paymentId: input.paymentId,
        amountMinor: amountMinor(row)
      };
    }

    const paymentAlreadyVerified = row
      && row.provider_payment_id === input.paymentId
      && row.provider_verified_at
      && ["captured", "partially_refunded", "refunded", "chargeback"].includes(row.payment_status);
    const orderAlreadyProgressed = row
      && !["draft", "pending_payment", "authorised"].includes(row.order_status);
    if (paymentAlreadyVerified && orderAlreadyProgressed) {
      return {
        orderId: row.order_id,
        orderNumber: row.order_number?.trim() || row.order_id,
        paymentStatus: row.payment_status,
        orderStatus: row.order_status,
        paymentId: input.paymentId,
        amountMinor: amountMinor(row)
      };
    }

    if (row && row.order_status === "pending_payment" && createdAtMs(row) + PAYMENT_WINDOW_MS > now) {
      const provider = await new MolliePaymentsClient(mollieConfigFromEnv()).retrievePayment(input.paymentId);
      assertProviderIdentity(provider, row);
      if (TERMINAL_RETRYABLE_PROVIDER_STATUSES.has(provider.status)) {
        return recordTerminalAttemptWithoutCancelling(row, provider, input.source, now);
      }
    }
  }
  return requireMolliePayments().reconcilePayment({ ...input, now });
}

export async function verifiedMollieProcessorMethod(paymentId: string): Promise<"CARD"> {
  const payment = await new MolliePaymentsClient(mollieConfigFromEnv()).retrievePayment(paymentId);
  if (payment.status !== "paid") throw new Error("Mollie payment is not in a paid state");
  if (payment.amountCurrency !== "EUR") throw new Error("Only EUR Mollie payments can be fiscalized automatically");
  if (payment.method === "creditcard") return "CARD";
  throw new Error(`Mollie payment method ${payment.method ?? "unknown"} has no approved automatic fiscal mapping`);
}
