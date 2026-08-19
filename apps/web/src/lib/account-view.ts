import {
  CustomerRecommendationService,
  defaultCustomerRetentionSnapshot,
  formatMoney,
  type CustomerOrder,
  type SessionPrincipal
} from "@buy-local-sparta/core";
import { createCustomerNotification, customerStateSnapshot } from "./customer-state-runtime";
import { customerOrder, customerOrders, cancelCustomerCommerceOrder } from "./customer-commerce-runtime";
import { customerReturnsSnapshot, requestCustomerReturn as createCustomerReturnCase, type CustomerReturnReason, type CustomerReturnRemedy, type CustomerReturnsSnapshot } from "./customer-returns-service";
import { getCanonicalAvailability, getPublicCatalogProducts, getPublicVendor } from "./catalog-view";
import { customerPickupCredentials, repairCustomerOrderLifecycle, type CustomerPickupCredential } from "./order-lifecycle";

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
    return product ? [{ canonicalVariantId: product.id, categoryCode: product.categoryCode, viewedAt: item.viewedAt }] : [];
  });
  const availabilityEntries = await Promise.all(catalog.map(async (product) => [product.id, (await getCanonicalAvailability(product.id))?.available ?? false] as const));
  const availabilityMap = new Map(availabilityEntries);
  const recommendations = new CustomerRecommendationService().recommend({
    enabled: state.preferences.recommendationsEnabled,
    products: catalog.map((product) => ({ canonicalVariantId: product.id, categoryCode: product.categoryCode, available: availabilityMap.get(product.id) ?? false, adviceAvailable: true })),
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
    status: customerOrderStatusLabel(order),
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
  let order = await customerOrder(principal, orderId);
  if (!order) throw new Error("ORDER_NOT_FOUND");

  // Self-heal lifecycle side effects for older production orders created before the
  // notification / pickup bridge was enabled. All operations are idempotent.
  await repairCustomerOrderLifecycle(principal, orderId);
  order = await customerOrder(principal, orderId) ?? order;

  const physicalHandoverStarted = order.fulfilments.some((fulfilment) => ["ready_for_handover", "handed_over", "shipped", "delivered"].includes(fulfilment.status));
  const hasFulfilledQuantity = order.lines.some((line) => line.fulfilledQuantity > line.refundedQuantity || line.status === "fulfilled");
  const canCancel = !["cancelled", "fulfilled", "completed", "refunded"].includes(order.status) && !physicalHandoverStarted && !hasFulfilledQuantity;
  const vendorIds = [...new Set([...order.lines.map((line) => line.vendorId), ...order.fulfilments.map((fulfilment) => fulfilment.vendorId)])];
  const [vendorEntries, pickups, returns] = await Promise.all([
    Promise.all(vendorIds.map(async (id) => [id, (await getPublicVendor(id))?.name ?? id] as const)),
    customerPickupCredentials(principal, orderId),
    customerReturnsSnapshot(principal, orderId)
  ]);
  const vendorNames = new Map(vendorEntries);
  return orderDetailProjection(order, principal.csrfToken, canCancel, vendorNames, pickups, returns);
}

export async function cancelCustomerOrder(principal: SessionPrincipal, input: { orderId: string; reason: string; now?: number }) {
  const now = input.now ?? Date.now();
  const updated = await cancelCustomerCommerceOrder(principal, { orderId: input.orderId, reason: input.reason, now });
  await createCustomerNotification({ userId: principal.userId, eventType: "order.cancelled", title: "Η παραγγελία ακυρώθηκε", body: `Παραγγελία ${updated.id}`, payload: { orderId: updated.id }, dedupeKey: `web-order:${updated.id}:cancelled`, now });
  return accountOrderDetail(principal, updated.id);
}

export async function requestCustomerReturn(principal: SessionPrincipal, input: {
  orderId: string;
  orderLineId: string;
  quantity: number;
  reason: CustomerReturnReason;
  requestedRemedy: CustomerReturnRemedy;
  note?: string;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const created = await createCustomerReturnCase(principal, { ...input, now });
  await createCustomerNotification({
    userId: principal.userId,
    eventType: "return.requested",
    title: "Λάβαμε το αίτημα επιστροφής",
    body: `Αίτημα ${created.returnNumber} · θα ενημερωθείτε μόλις ολοκληρωθεί ο έλεγχος.`,
    payload: { orderId: input.orderId, returnId: created.returnId, returnNumber: created.returnNumber },
    dedupeKey: `return:${created.returnId}:requested`,
    now
  });
  return accountOrderDetail(principal, input.orderId);
}

function orderDetailProjection(order: CustomerOrder, csrfToken: string, canCancel: boolean, vendorNames: ReadonlyMap<string, string>, pickups: readonly CustomerPickupCredential[], returns: CustomerReturnsSnapshot) {
  return {
    id: order.id,
    status: customerOrderStatusLabel(order),
    sourceStatus: order.status,
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
    lines: order.lines.map((line) => ({
      id: line.id,
      canonicalVariantId: line.canonicalVariantId,
      title: line.titleSnapshot,
      quantity: line.quantity,
      fulfilledQuantity: line.fulfilledQuantity,
      refundedQuantity: line.refundedQuantity,
      returnableQuantity: returns.returnableByLine[line.id] ?? Math.max(0, line.fulfilledQuantity - line.refundedQuantity),
      status: line.status,
      retailUnitPrice: formatMoney(line.retailUnitPrice),
      vendorId: line.vendorId,
      vendorName: vendorNames.get(line.vendorId) ?? line.vendorId
    })),
    fulfilments: order.fulfilments.filter((fulfilment) => fulfilment.status !== "rejected").map((fulfilment) => ({ id: fulfilment.id, status: fulfilment.status, vendorId: fulfilment.vendorId, vendorName: vendorNames.get(fulfilment.vendorId) ?? fulfilment.vendorId, deliveryCharge: formatMoney(fulfilment.deliveryCharge), lineIds: fulfilment.lineIds })),
    pickups,
    returns: returns.cases
  };
}

function customerOrderStatusLabel(order: CustomerOrder): string {
  if (order.status === "cancelled") return "Ακυρωμένη";
  if (order.status === "refunded") return "Επιστράφηκαν τα χρήματα";
  if (order.status === "partially_refunded") return "Μερική επιστροφή χρημάτων";
  if (order.status === "pending_payment") return "Αναμονή πληρωμής";

  const fulfilments = order.fulfilments.filter((item) => item.status !== "rejected" && item.status !== "cancelled");
  if (fulfilments.length) {
    const statuses = fulfilments.map((item) => item.status);
    if (statuses.every((status) => ["handed_over", "delivered"].includes(status))) return order.fulfilmentMode === "pickup" ? "Παραλήφθηκε" : "Ολοκληρώθηκε";
    if (statuses.some((status) => status === "ready_for_handover")) return order.fulfilmentMode === "pickup" ? "Έτοιμη για παραλαβή" : "Έτοιμη για παράδοση";
    if (statuses.some((status) => ["accepted", "picking", "packed"].includes(status))) return "Ετοιμάζεται από το κατάστημα";
    if (statuses.some((status) => status === "shipped")) return "Σε αποστολή";
    if (statuses.some((status) => status === "awaiting_acceptance")) return "Αναμονή αποδοχής από το κατάστημα";
  }

  if (["fulfilled", "completed"].includes(order.status)) return "Ολοκληρώθηκε";
  if (order.status === "confirmed") return "Επιβεβαιωμένη";
  if (order.status === "requires_customer_action") return "Χρειάζεται ενέργεια";
  if (order.status === "partially_fulfilled") return "Μερικώς ολοκληρωμένη";
  return order.status.replaceAll("_", " ");
}
