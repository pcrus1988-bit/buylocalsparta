import { VivaPaymentsClient, vivaConfigFromEnv } from "@buy-local-sparta/viva-payments";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export function vivaPaymentsEnabled(): boolean { return process.env.VIVA_PAYMENTS_ENABLED === "true"; }

export function vivaPaymentsReady(): boolean {
  if (!vivaPaymentsEnabled() || !process.env.DATABASE_URL?.trim()) return false;
  if (process.env.NODE_ENV === "production" && process.env.VIVA_ENVIRONMENT !== "live" && process.env.BLS_ALLOW_VIVA_DEMO_PREVIEW !== "true") return false;
  try { return Boolean(getProductionPostgresRuntime().vivaPayments); } catch { return false; }
}

export async function vivaPaymentsProviderReadiness(): Promise<{
  enabled: boolean;
  ready: boolean;
  environment: string;
  smartCheckoutScope?: boolean;
  webhookKeyAvailable?: boolean;
  message?: string;
}> {
  const enabled = vivaPaymentsEnabled();
  const environment = process.env.VIVA_ENVIRONMENT ?? "disabled";
  if (!enabled) return { enabled: false, ready: true, environment: "disabled" };
  if (!process.env.DATABASE_URL?.trim()) return { enabled: true, ready: false, environment, message: "Viva payments require PostgreSQL runtime" };
  if (process.env.NODE_ENV === "production" && environment !== "live" && process.env.BLS_ALLOW_VIVA_DEMO_PREVIEW !== "true") {
    return { enabled: true, ready: false, environment, message: "Production Viva payments require VIVA_ENVIRONMENT=live" };
  }
  try {
    if (!getProductionPostgresRuntime().vivaPayments) throw new Error("Viva payments are not configured");
    const provider = await new VivaPaymentsClient(vivaConfigFromEnv()).readiness();
    return {
      enabled: true,
      ready: provider.ok,
      environment: provider.environment,
      smartCheckoutScope: provider.smartCheckoutScope,
      webhookKeyAvailable: provider.webhookKeyAvailable
    };
  } catch (error) {
    return { enabled: true, ready: false, environment, message: error instanceof Error ? error.message : "Viva readiness failed" };
  }
}

export function requireVivaPayments() {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("Viva payments require PostgreSQL runtime");
  if (!vivaPaymentsEnabled()) throw new Error("Viva payments are not enabled");
  const service = getProductionPostgresRuntime().vivaPayments;
  if (!service) throw new Error("Viva payments are not configured");
  return service;
}

export async function reconcileVivaTransactionSafely(input: {
  transactionId: string;
  expectedOrderCode: string;
  source: "redirect" | "webhook" | "manual";
  now?: number;
}): Promise<{ orderId: string; paymentStatus: string; orderStatus: string; transactionId: string; amountMinor: number }> {
  if (process.env.DATABASE_URL?.trim()) {
    const existing = await getProductionPostgresRuntime().nativePool.query<{
      order_id: string;
      order_status: string;
      payment_status: string;
      provider_transaction_id: string | null;
      provider_verified_at: Date | null;
      total_minor: string | number;
    }>(`SELECT o.public_id AS order_id,o.status::text AS order_status,p.status::text AS payment_status,
              p.provider_transaction_id,p.provider_verified_at,o.total_minor
         FROM payments p JOIN customer_orders o ON o.id=p.order_id
        WHERE p.provider='viva' AND p.provider_order_code=$1 LIMIT 1`, [input.expectedOrderCode]);
    const row = existing.rows[0];
    const paymentAlreadyVerified = row
      && row.provider_transaction_id === input.transactionId
      && row.provider_verified_at
      && ["captured", "partially_refunded", "refunded", "chargeback"].includes(row.payment_status);
    const orderAlreadyProgressed = row
      && !["draft", "pending_payment", "authorised"].includes(row.order_status);
    if (paymentAlreadyVerified && orderAlreadyProgressed) {
      const amountMinor = Number(row.total_minor);
      if (!Number.isSafeInteger(amountMinor)) throw new Error("Stored Viva order total is invalid");
      return {
        orderId: row.order_id,
        paymentStatus: row.payment_status,
        orderStatus: row.order_status,
        transactionId: input.transactionId,
        amountMinor
      };
    }
  }
  return requireVivaPayments().reconcileTransaction(input);
}

export async function verifiedVivaProcessorMethod(transactionId: string): Promise<"CARD" | "IRIS"> {
  const transaction = await new VivaPaymentsClient(vivaConfigFromEnv()).retrieveTransaction(transactionId);
  if (!["F", "C"].includes(transaction.statusId)) throw new Error("Viva transaction is not in a captured/successful state");
  if (transaction.currencyCode !== 978) throw new Error("Only EUR Viva transactions can be fiscalized automatically");
  if (transaction.bankId === "NET_IRIS" || transaction.transactionTypeId === 60) return "IRIS";
  if ([0, 1, 5, 6].includes(transaction.transactionTypeId ?? -1)) return "CARD";
  throw new Error(`Unsupported Viva payment method for automatic fiscalization${transaction.transactionTypeId == null ? "" : ` (transaction type ${transaction.transactionTypeId})`}`);
}
