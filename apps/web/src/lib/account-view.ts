import {
  CustomerRecommendationService,
  defaultCustomerRetentionSnapshot,
  formatMoney,
  type CustomerOrder,
  type SessionPrincipal
} from "@buy-local-sparta/core";
import { createCustomerNotification, customerStateSnapshot } from "./customer-state-runtime";
import { customerOrder, customerOrders, cancelCustomerCommerceOrder } from "./customer-commerce-runtime";
import { getCanonicalAvailability, getCanonicalProductSummary, getPublicCatalogProducts, getPublicVendor } from "./catalog-view";

export async function accountDashboard(principal: SessionPrincipal, now = Date.now()) {
  const [state, catalog, ordersRaw] = await Promise.all([
    customerStateSnapshot(principal.userId, now),
    getPublicCatalogProducts(),
    customerOrders(principal)
  ]);
  const catalogMap = new Map(catalog.map((product) => [product.id, product]));
  const savedProducts = await Promise.all(state.savedProducts.map(async (saved) => {
    const product = catalogMap.get(saved.canonicalVariantId);
    if (!product) return { ...saved, unavailable: true as const };
    const availability = await getCanonicalAvailability(product.id);
    return { ...saved, title: product.title, price: product.price, available: availability?.available ?? false, alert: state.savedProductAlerts.find((item) => item.canonicalVariantId === product.id) ?? null };
  }));
  const recentlyViewed = state.recentlyViewed.flatMap((view) => {
    const product = catalogMap.get(view.canonicalVariantId);
    return product ? [{ ...view, title: product.title, price: product.price }] : [];
  });
  const recommendationSignals = (ids: readonly { canonicalVariantId: string; viewedAt?: number }[]) => ids.flatMap((item) => {
    const product = catalogMap.get(item.canonicalVariantId);
    return product ? [{ canonicalVariantId: product.id, categoryCode: product.categoryCode, brand: brandFor(product.id), viewedAt: item.viewedAt }] : [];
  });
  const availabilityEntries = await Promise.all(catalog.map(async (product) => [product.id, (await getCanonicalAvailability(product.id))?.available ?? false] as const));
  const availabilityMap = new Map(availabilityEntries);
  const recommendations = new CustomerRecommendationService().recommend({
    enabled: state.preferences.recommendationsEnabled,
    products: catalog.map((product) => ({ canonicalVariantId: product.id, categoryCode: product.categoryCode, brand: brandFor(product.id), available: availabilityMap.get(product.id) ?? false, adviceAvailable: true })),
    saved: recommendationSignals(savedProducts),
    recentlyViewed: recommendationSignals(recentlyViewed),
    locale: "el",
    limit: 6
  }).map((item) => {
    const product = catalogMap.get(item.canonicalVariantId)!;
    return { ...item, title: product.title, price: product.price };
  });
  const orders = ordersRaw.map((order) => ({
    id: order.id,
    status: order.status,
    total: formatMoney(order.total),
    createdAt: order.createdAt,
    fulfilmentMode: order.fulfilmentMode,
    lines: order.lines.map((line) => ({ id: line.id, title: line.titleSnapshot, quantity: line.quantity, status: line.status }))
  }));
  return {
    account: { userId: principal.userId, email: principal.email },
    csrfToken: principal.csrfToken,
    savedProducts,
    savedSearches: state.savedSearches,
    notifications: state.notifications,
    unreadNotifications: state.unreadNotifications,
    recentlyViewed,
    preferences: state.preferences,
    recommendations,
    privacyRequests: state.privacyRequests,
    retention: defaultCustomerRetentionSnapshot(now),
    orders
  };
}

export async function accountOrderDetail(principal: SessionPrincipal, orderId: string) {
  const order = await customerOrder(principal, orderId);
  if (!order) throw new Error("ORDER_NOT_FOUND");
  const physicalHandoverStarted = order.fulfilments.some((fulfilment) => ["ready_for_handover", "shipped", "delivered"].includes(fulfilment.status));
  const hasFulfilledQuantity = order.lines.some((line) => line.fulfilledQuantity > line.refundedQuantity || line.status === "fulfilled");
  const canCancel = !["cancelled", "fulfilled", "completed", "refunded"].includes(order.status) && !physicalHandoverStarted && !hasFulfilledQuantity;
  const vendorIds = [...new Set([...order.lines.map((line) => line.vendorId), ...order.fulfilments.map((fulfilment) => fulfilment.vendorId)])];
  const vendorEntries = await Promise.all(vendorIds.map(async (id) => [id, (await getPublicVendor(id))?.name ?? id] as const));
  const vendorNames = new Map(vendorEntries);
  return orderDetailProjection(order, principal.csrfToken, canCancel, vendorNames);
}

export async function cancelCustomerOrder(principal: SessionPrincipal, input: { orderId: string; reason: string; now?: number }) {
  const now = input.now ?? Date.now();
  const updated = await cancelCustomerCommerceOrder(principal, { orderId: input.orderId, reason: input.reason, now });
  await createCustomerNotification({ userId: principal.userId, eventType: "order.cancelled", title: "Η παραγγελία ακυρώθηκε", body: `Παραγγελία ${updated.id}`, payload: { orderId: updated.id }, dedupeKey: `web-order:${updated.id}:cancelled`, now });
  return accountOrderDetail(principal, updated.id);
}

function orderDetailProjection(order: CustomerOrder, csrfToken: string, canCancel: boolean, vendorNames: ReadonlyMap<string, string>) {
  return {
    id: order.id,
    status: order.status,
    createdAt: order.createdAt,
    postcode: order.postcode,
    fulfilmentMode: order.fulfilmentMode,
    merchandiseSubtotal: formatMoney(order.merchandiseSubtotal),
    deliveryCharge: formatMoney(order.deliveryCharge),
    discount: formatMoney(order.discount),
    total: formatMoney(order.total),
    cancellationReason: order.cancellationReason,
    cancelledAt: order.cancelledAt,
    canCancel,
    csrfToken,
    lines: order.lines.map((line) => ({ id: line.id, canonicalVariantId: line.canonicalVariantId, title: line.titleSnapshot, quantity: line.quantity, status: line.status, retailUnitPrice: formatMoney(line.retailUnitPrice), vendorId: line.vendorId, vendorName: vendorNames.get(line.vendorId) ?? line.vendorId })),
    fulfilments: order.fulfilments.filter((fulfilment) => fulfilment.status !== "rejected").map((fulfilment) => ({ id: fulfilment.id, status: fulfilment.status, vendorId: fulfilment.vendorId, vendorName: vendorNames.get(fulfilment.vendorId) ?? fulfilment.vendorId, deliveryCharge: formatMoney(fulfilment.deliveryCharge), lineIds: fulfilment.lineIds }))
  };
}

function brandFor(variantId: string): string | undefined {
  if (variantId === "airpods") return "Apple";
  if (variantId === "lamp") return "Local Home";
  if (variantId === "notebook") return "Local Paper";
  return undefined;
}
