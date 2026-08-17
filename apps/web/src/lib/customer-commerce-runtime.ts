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
    const runtime=getProductionPostgresRuntime();
    if(runtime.vivaPayments) await runtime.vivaPayments.prepareOrderCancellation({orderId:input.orderId,reason:input.reason,now:input.now});
    return runtime.customerCommerce.cancelCustomerOrder({ customerId: principal.userId, orderId: input.orderId, reason: input.reason, now: input.now });
  }
  const order = developmentRuntime.commerce.orders().find((entry) => entry.id === input.orderId);
  if (!order || order.customerId !== principal.userId) throw new Error("ORDER_NOT_FOUND");
  return developmentRuntime.commerce.cancelOrder({ orderId: order.id, reason: input.reason, idempotencyKey: `web-customer-cancel:${order.id}`, now: input.now });
}

export async function persistentCustomerCart(principal: SessionPrincipal): Promise<PersistentCartSnapshot | undefined> {
  if (!postgresCommerceEnabled()) return undefined;
  return getProductionPostgresRuntime().customerCommerce.customerCart(principal.userId);
}

export async function syncPersistentCustomerCart(principal: SessionPrincipal, items: readonly { canonicalVariantId: string; quantity: number }[], now = Date.now()): Promise<PersistentCartSnapshot | undefined> {
  if (!postgresCommerceEnabled()) return undefined;
  return getProductionPostgresRuntime().customerCommerce.syncCustomerCart({ customerId: principal.userId, items, now });
}
