import type { SessionPrincipal } from "@buy-local-sparta/core";
import { finalizeCapturedCustomerPayment } from "./customer-payment-finalization";
import { finalizePaidDropshipFulfilment } from "./dropship-paid-fulfilment";
import { requireCustomerOrderReference } from "./customer-order-reference";
import { molliePaymentsEnabled, reconcileMolliePaymentSafely } from "./mollie-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

type ReconciliationSource = "redirect" | "manual";

export type CustomerMollieReconciliation = Readonly<{
  orderId: string;
  referenceNumber: string;
  reconciled: boolean;
  paymentStatus?: string;
  orderStatus?: string;
}>;

/**
 * Recover a customer Mollie order by asking Mollie for the authoritative payment state.
 *
 * This is deliberately gated by customer ownership and the local pending/authorised state.
 * It never marks an order as paid based on the browser return alone. The provider payment id
 * is read from our database and Mollie must verify the order identity, currency and amount
 * before reconcileMolliePaymentSafely can advance the order.
 */
export async function reconcileCustomerMollieOrder(
  principal: SessionPrincipal,
  identifier: string,
  source: ReconciliationSource,
  now = Date.now()
): Promise<CustomerMollieReconciliation> {
  const resolved = await requireCustomerOrderReference(principal, identifier);
  const base = {
    orderId: resolved.internalId,
    referenceNumber: resolved.referenceNumber,
    reconciled: false
  } as const;

  if (!productionDatabaseConfigured() || !molliePaymentsEnabled()) return base;

  const runtime = getProductionPostgresRuntime();
  const stored = await runtime.nativePool.query<{
    provider_payment_id: string | null;
    provider_transaction_id: string | null;
    order_status: string;
  }>(`
    SELECT p.provider_payment_id,p.provider_transaction_id,o.status::text AS order_status
      FROM payments p
      JOIN customer_orders o ON o.id=p.order_id
     WHERE o.public_id=$1
       AND p.provider='mollie'
     ORDER BY p.created_at DESC
     LIMIT 1
  `, [resolved.internalId]);

  const row = stored.rows[0];
  if (!row || !["pending_payment", "authorised"].includes(row.order_status)) return base;

  const paymentId = row.provider_payment_id?.trim() || row.provider_transaction_id?.trim();
  if (!paymentId) return base;

  const reconciliation = await reconcileMolliePaymentSafely({ paymentId, source, now });
  if (reconciliation.orderId !== resolved.internalId) throw new Error("MOLLIE_ORDER_MISMATCH");

  if (
    ["captured", "partially_refunded", "refunded"].includes(reconciliation.paymentStatus)
    && reconciliation.orderStatus !== "cancelled"
  ) {
    await finalizeCapturedCustomerPayment(reconciliation.orderId, now);
    await finalizePaidDropshipFulfilment(reconciliation.orderId, now);
  }

  return {
    orderId: resolved.internalId,
    referenceNumber: resolved.referenceNumber,
    reconciled: true,
    paymentStatus: reconciliation.paymentStatus,
    orderStatus: reconciliation.orderStatus
  };
}
