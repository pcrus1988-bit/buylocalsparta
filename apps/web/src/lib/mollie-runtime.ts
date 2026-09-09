import { MolliePaymentsClient, mollieConfigFromEnv, mollieEnvironment } from "@buy-local-sparta/mollie-payments";
import { getProductionPostgresRuntime } from "./postgres-runtime";

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

export async function reconcileMolliePaymentSafely(input: {
  paymentId: string;
  source: "redirect" | "webhook" | "manual";
  now?: number;
}): Promise<{ orderId: string; orderNumber: string; paymentStatus: string; orderStatus: string; paymentId: string; amountMinor: number }> {
  if (process.env.DATABASE_URL?.trim()) {
    const existing = await getProductionPostgresRuntime().nativePool.query<{
      order_id: string;
      order_number: string | null;
      order_status: string;
      payment_status: string;
      provider_payment_id: string | null;
      provider_verified_at: Date | null;
      total_minor: string | number;
      gift_card_minor: string | number;
    }>(`SELECT o.public_id AS order_id,o.order_number,o.status::text AS order_status,p.status::text AS payment_status,
              p.provider_payment_id,p.provider_verified_at,o.total_minor,
              COALESCE((SELECT SUM(-gcl.amount_minor) FROM gift_card_ledger gcl WHERE gcl.order_public_id=o.public_id AND gcl.entry_type='redeem'),0) AS gift_card_minor
         FROM payments p JOIN customer_orders o ON o.id=p.order_id
        WHERE p.provider='mollie' AND (p.provider_payment_id=$1 OR p.provider_transaction_id=$1) LIMIT 1`, [input.paymentId]);
    const row = existing.rows[0];
    const paymentAlreadyVerified = row
      && row.provider_payment_id === input.paymentId
      && row.provider_verified_at
      && ["captured", "partially_refunded", "refunded", "chargeback"].includes(row.payment_status);
    const orderAlreadyProgressed = row
      && !["draft", "pending_payment", "authorised"].includes(row.order_status);
    if (paymentAlreadyVerified && orderAlreadyProgressed) {
      const amountMinor = Number(row.total_minor) - Number(row.gift_card_minor);
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Stored Mollie payable total is invalid");
      return {
        orderId: row.order_id,
        orderNumber: row.order_number?.trim() || row.order_id,
        paymentStatus: row.payment_status,
        orderStatus: row.order_status,
        paymentId: input.paymentId,
        amountMinor
      };
    }
  }
  return requireMolliePayments().reconcilePayment(input);
}

export async function verifiedMollieProcessorMethod(paymentId: string): Promise<"CARD"> {
  const payment = await new MolliePaymentsClient(mollieConfigFromEnv()).retrievePayment(paymentId);
  if (payment.status !== "paid") throw new Error("Mollie payment is not in a paid state");
  if (payment.amountCurrency !== "EUR") throw new Error("Only EUR Mollie payments can be fiscalized automatically");
  if (payment.method === "creditcard") return "CARD";
  throw new Error(`Mollie payment method ${payment.method ?? "unknown"} has no approved automatic fiscal mapping`);
}
