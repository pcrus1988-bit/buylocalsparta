import { createHash } from "node:crypto";
import type { CustomerOrder, FulfilmentMode, SessionPrincipal } from "@buy-local-sparta/core";
import type { PersistentCartSnapshot } from "@buy-local-sparta/postgres-runtime";
import { runtime as developmentRuntime } from "./demo-runtime";
import { canonicalIsPubliclyAllowed } from "./vendor-operations-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export function postgresCommerceEnabled(): boolean { return Boolean(process.env.DATABASE_URL?.trim()); }

export async function checkoutCustomer(input: {
  checkoutKey: string;
  visitorKey: string;
  customerId?: string;
  postcode: string;
  fulfilmentMode: FulfilmentMode;
  items: readonly { canonicalVariantId: string; quantity: number }[];
  shipping?: Readonly<{ provider?: "boxnow"; providerDestinationId?: string; providerDestinationLabel?: string; recipientName?: string; recipientEmail?: string; recipientPhone?: string }>;
  now: number;
}): Promise<CustomerOrder> {
  if (postgresCommerceEnabled()) {
    return getProductionPostgresRuntime().customerCommerce.checkout({
      ...input,
      developmentAuthorisePayment: process.env.NODE_ENV !== "production" && process.env.BLS_ALLOW_DEVELOPMENT_PAYMENT_ADAPTER === "true"
    });
  }
  for (const item of input.items) if (!canonicalIsPubliclyAllowed(item.canonicalVariantId)) throw new Error(`Product ${item.canonicalVariantId} is unavailable due to a platform safety or compliance hold`);
  const { shipping: _shipping, ...developmentInput } = input;
  return developmentRuntime.commerce.checkout(developmentInput);
}

export async function customerOrders(principal: SessionPrincipal): Promise<readonly CustomerOrder[]> {
  if (postgresCommerceEnabled()) return getProductionPostgresRuntime().customerCommerce.ordersForCustomer(principal.userId);
  return developmentRuntime.commerce.orders().filter((order) => order.customerId === principal.userId).sort((a, b) => b.createdAt - a.createdAt);
}

export async function customerOrder(principal: SessionPrincipal, orderId: string): Promise<CustomerOrder | undefined> {
  if (postgresCommerceEnabled()) return getProductionPostgresRuntime().customerCommerce.orderForCustomer(principal.userId, orderId);
  return developmentRuntime.commerce.orders().find((order) => order.id === orderId && order.customerId === principal.userId);
}

export async function cancelCustomerCommerceOrder(principal: SessionPrincipal, input: { orderId: string; reason: string; now: number }): Promise<CustomerOrder> {
  if (postgresCommerceEnabled()) {
    const runtime = getProductionPostgresRuntime();
    const order = await runtime.customerCommerce.orderForCustomer(principal.userId, input.orderId);
    if (!order) throw new Error("ORDER_NOT_FOUND");

    // A pending-payment order has not charged the customer. Cancel it locally first so
    // the payment row becomes `cancelled`; prepareOrderCancellation then performs only
    // its database check and cannot call Viva for an uncharged payment. If a capture
    // races with this cancellation, the captured balance is still detected and refunded.
    if (order.status === "pending_payment") {
      const cancelled = await runtime.customerCommerce.cancelCustomerOrder({ customerId: principal.userId, orderId: input.orderId, reason: input.reason, now: input.now });
      if (runtime.vivaPayments) await runtime.vivaPayments.prepareOrderCancellation({ orderId: input.orderId, reason: input.reason, now: input.now });
      return cancelled;
    }

    if (runtime.vivaPayments) await runtime.vivaPayments.prepareOrderCancellation({ orderId: input.orderId, reason: input.reason, now: input.now });
    return runtime.customerCommerce.cancelCustomerOrder({ customerId: principal.userId, orderId: input.orderId, reason: input.reason, now: input.now });
  }
  const order = developmentRuntime.commerce.orders().find((entry) => entry.id === input.orderId);
  if (!order || order.customerId !== principal.userId) throw new Error("ORDER_NOT_FOUND");
  return developmentRuntime.commerce.cancelOrder({ orderId: order.id, reason: input.reason, idempotencyKey: `web-customer-cancel:${order.id}`, now: input.now });
}

function visitorHash(visitorKey: string): string {
  return createHash("sha256").update(visitorKey).digest("hex");
}

export async function persistentCustomerCart(principal: SessionPrincipal, visitorKey?: string, postcode = "23100"): Promise<PersistentCartSnapshot | undefined> {
  if (!postgresCommerceEnabled()) return undefined;
  const runtime = getProductionPostgresRuntime();
  const cart = await runtime.customerCommerce.customerCart(principal.userId);
  if (!visitorKey || cart.items.length === 0) return cart;

  const items = await Promise.all(cart.items.map(async (item) => {
    // Cart is a continuation of the customer's product view. The fairness service reuses
    // an existing sticky assignment before considering any new allocation.
    await runtime.customerCommerce.publicAssignedCanonical({ canonicalVariantId: item.canonicalVariantId, visitorKey, postcode, reason: "product_view" });
    const result = await runtime.nativePool.query(`
      SELECT vo.customer_price_minor,
             GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked) AS available_to_sell
      FROM sticky_assignments sa
      JOIN canonical_variants cv ON cv.id=sa.canonical_variant_id
      JOIN vendor_offers vo ON vo.id=sa.offer_id
      JOIN inventory_balances ib ON ib.offer_id=vo.id
      WHERE cv.public_id=$1
        AND sa.visitor_hash=$2
        AND sa.postcode_scope=$3
        AND sa.released_at IS NULL
        AND sa.expires_at>now()
        AND vo.status='approved'
      ORDER BY sa.locked_at DESC
      LIMIT 1
    `, [item.canonicalVariantId, visitorHash(visitorKey), postcode]);
    if (!result.rowCount) return { ...item, available: false };
    const priceMinor = Number(result.rows[0]?.customer_price_minor);
    const availableToSell = Number(result.rows[0]?.available_to_sell ?? 0);
    if (!Number.isSafeInteger(priceMinor) || priceMinor < 0) throw new Error("Invalid assigned customer price");
    return { ...item, priceMinor, available: availableToSell >= item.quantity };
  }));
  return { ...cart, items };
}

export async function syncPersistentCustomerCart(principal: SessionPrincipal, items: readonly { canonicalVariantId: string; quantity: number }[], now = Date.now()): Promise<PersistentCartSnapshot | undefined> {
  if (!postgresCommerceEnabled()) return undefined;
  return getProductionPostgresRuntime().customerCommerce.syncCustomerCart({ customerId: principal.userId, items, now });
}
