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
import { customerFiscalDocumentForOrder } from "./customer-fiscal-runtime";
import { customerPickupCredentials, repairCustomerOrderLifecycle, type CustomerPickupCredential } from "./order-lifecycle";
import { marketplaceReferenceMap } from "./public-reference-service";
import { requireCustomerOrderReference } from "./customer-order-reference";
import { customerOrderLineActionToken, requireCustomerOrderLineInternalId } from "./customer-order-line-action-token";

function browserNotificationPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const { orderId: _internalOrderId, returnId: _internalReturnId, requestId: _internalAskLocalRequestId, privateOfferId: _internalPrivateOfferId, ...safe } = payload;
  return safe;
}

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
  const orderReferences = await marketplaceReferenceMap("order", ordersRaw.map((order) => order.id));
  const orders = ordersRaw.map((order) => {
    const referenceNumber = orderReferences.get(order.id) ?? order.id;
    return {
      id: referenceNumber,
      referenceNumber,
      status: customerOrderStatusLabel(order),
      total: formatMoney(order.total),
      createdAt: order.createdAt,
      fulfilmentMode: order.fulfilmentMode,
      lines: order.lines.map((line) => ({ id: customerOrderLineActionToken(principal.userId, order.id, line.id), title: line.titleSnapshot, quantity: line.quantity, status: line.status }))
    };
  });
  return {
    account: { userId: principal.userId, email: principal.email },
    csrfToken: principal.csrfToken,
    savedProducts,
    savedSearches: state.savedSearches,
    notifications: state.notifications.map((item) => ({ ...item, payload: browserNotificationPayload(item.payload) })),
    unreadNotifications: state.unreadNotifications,
    recentlyViewed,
    preferences: state.preferences,
    recommendations,
    privacyRequests: state.privacyRequests,
    retention: defaultCustomerRetentionSnapshot(now),
    orders
  };
}

export async function accountOrderDetail(principal: SessionPrincipal, orderIdentifier: string) {
  const resolved = await requireCustomerOrderReference(principal, orderIdentifier);
  const orderId = resolved.internalId;
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
  const [vendorEntries, pickups, invoice, returns] = await Promise.all([
    Promise.all(vendorIds.map(async (id) => [id, (await getPublicVendor(id))?.name ?? id] as const)),
    customerPickupCredentials(principal, orderId),
    customerFiscalDocumentForOrder(orderId),
    customerReturnsSnapshot(principal, orderId)
  ]);
  const vendorNames = new Map(vendorEntries);
  return orderDetailProjection(order, principal.userId, resolved.referenceNumber, principal.csrfToken, canCancel, vendorNames, pickups, returns, invoice ? {
    documentNumber: invoice.documentNumber,
    type: invoice.type,
    mark: invoice.mark,
    uid: invoice.uid,
    qrUrl: invoice.qrUrl,
    issuedAt: invoice.issuedAt,
    downloadUrl: `/api/account/orders/${encodeURIComponent(resolved.referenceNumber)}/invoice`
  } : undefined);
}

export async function cancelCustomerOrder(principal: SessionPrincipal, input: { orderId: string; reason: string; now?: number }) {
  const now = input.now ?? Date.now();
  const resolved = await requireCustomerOrderReference(principal, input.orderId);
  const updated = await cancelCustomerCommerceOrder(principal, { orderId: resolved.internalId, reason: input.reason, now });
  await createCustomerNotification({ userId: principal.userId, eventType: "order.cancelled", title: "Η παραγγελία ακυρώθηκε", body: `Παραγγελία ${resolved.referenceNumber}`, payload: { orderReference: resolved.referenceNumber }, dedupeKey: `web-order:${updated.id}:cancelled`, now });
  return accountOrderDetail(principal, resolved.referenceNumber);
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
  const resolved = await requireCustomerOrderReference(principal, input.orderId);
  const line = await requireCustomerOrderLineInternalId(principal, resolved.internalId, input.orderLineId);
  const created = await createCustomerReturnCase(principal, { ...input, orderId: resolved.internalId, orderLineId: line.internalId, now });
  await createCustomerNotification({
    userId: principal.userId,
    eventType: "return.requested",
    title: "Λάβαμε το αίτημα επιστροφής",
    body: `Αίτημα ${created.returnNumber} · θα ενημερωθείτε μόλις ολοκληρωθεί ο έλεγχος.`,
    payload: { orderReference: resolved.referenceNumber, returnNumber: created.returnNumber, returnReference: created.returnNumber },
    dedupeKey: `return:${created.returnId}:requested`,
    now
  });
  return accountOrderDetail(principal, resolved.referenceNumber);
}

function orderDetailProjection(
  order: CustomerOrder,
  userId: string,
  referenceNumber: string,
  csrfToken: string,
  canCancel: boolean,
  vendorNames: ReadonlyMap<string, string>,
  pickups: readonly CustomerPickupCredential[],
  returns: CustomerReturnsSnapshot,
  invoice?: { documentNumber: string; type: string; mark: string; uid?: string; qrUrl?: string; issuedAt: number; downloadUrl: string }
) {
  const lineTokens = new Map(order.lines.map((line) => [line.id, customerOrderLineActionToken(userId, order.id, line.id)] as const));
  const browserReturns = returns.cases.map((item) => ({
    ...item,
    lines: item.lines.flatMap((entry) => {
      const token = lineTokens.get(entry.orderLineId);
      return token ? [{ ...entry, orderLineId: token }] : [];
    })
  }));
  return {
    id: referenceNumber,
    referenceNumber,
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
    invoice,
    lines: order.lines.map((line) => ({
      id: lineTokens.get(line.id)!,
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
    fulfilments: order.fulfilments.filter((fulfilment) => fulfilment.status !== "rejected").map((fulfilment, index) => ({
      id: `part-${index + 1}`,
      status: fulfilment.status,
      vendorId: fulfilment.vendorId,
      vendorName: vendorNames.get(fulfilment.vendorId) ?? fulfilment.vendorId,
      deliveryCharge: formatMoney(fulfilment.deliveryCharge),
      lineIds: fulfilment.lineIds.flatMap((lineId) => {
        const token = lineTokens.get(lineId);
        return token ? [token] : [];
      })
    })),
    pickups,
    returns: browserReturns
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
