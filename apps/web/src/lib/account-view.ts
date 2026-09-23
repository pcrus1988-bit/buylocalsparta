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
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import {
  customerBrowserNotification,
  customerBrowserPreferences,
  customerBrowserPrivacyRequest,
  customerBrowserRecentlyViewed,
  customerBrowserSavedProductAlert,
  customerBrowserSavedSearch
} from "./customer-account-browser-view";

async function orderProductSlugMap(canonicalVariantIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const ids = [...new Set(canonicalVariantIds.map((value) => value.trim()).filter(Boolean))];
  if (ids.length === 0 || !productionDatabaseConfigured()) return new Map();
  try {
    const result = await getProductionPostgresRuntime().nativePool.query<{ id: string; slug: string }>(`
      SELECT cv.public_id AS id,cv.slug
      FROM canonical_variants cv
      JOIN markets m ON m.id=cv.market_id
      WHERE cv.public_id=ANY($1::text[])
        AND m.code='sparta'
        AND COALESCE(cv.commerce_channel,'normal')='normal'
    `, [ids]);
    return new Map(result.rows.map((row) => [String(row.id), String(row.slug)] as const));
  } catch (error) {
    console.error(JSON.stringify({
      level: "warn",
      event: "account.order_product_slug_lookup_degraded",
      canonicalVariantCount: ids.length,
      message: error instanceof Error ? error.message : String(error)
    }));
    return new Map();
  }
}


type CustomerOrderCommercialSnapshot = Readonly<{
  taxMinor: number;
  giftCards: readonly Readonly<{ number: string; codeSuffix: string; amountMinor: number }>[];
  fulfilments: ReadonlyMap<string, Readonly<{
    manualSupplier: boolean;
    carrier?: string;
    trackingNumber?: string;
    shipmentStatus?: string;
    deliveryNote?: string;
  }>>;
}>;

async function customerOrderCommercialSnapshot(principal: SessionPrincipal, orderId: string): Promise<CustomerOrderCommercialSnapshot> {
  if (!productionDatabaseConfigured()) return { taxMinor: 0, giftCards: [], fulfilments: new Map() };
  const db = getProductionPostgresRuntime().nativePool;
  try {
    const [header, giftCards, fulfilments] = await Promise.all([
      db.query<{ tax_minor: string | number }>(`
        SELECT o.tax_minor
        FROM customer_orders o JOIN users u ON u.id=o.user_id
        WHERE o.public_id=$1 AND u.public_id=$2
        LIMIT 1
      `, [orderId, principal.userId]),
      db.query<{ number: string; code_suffix: string; amount_minor: string | number }>(`
        SELECT gc.public_id AS number,gc.code_suffix,ABS(gcl.amount_minor) AS amount_minor
        FROM gift_card_ledger gcl
        JOIN gift_cards gc ON gc.id=gcl.gift_card_id
        JOIN customer_orders o ON o.public_id=gcl.order_public_id
        JOIN users u ON u.id=o.user_id
        WHERE o.public_id=$1 AND u.public_id=$2 AND gcl.entry_type='redeem'
        ORDER BY gcl.created_at
      `, [orderId, principal.userId]),
      db.query<{
        fulfilment_id: string;
        manual_supplier: boolean;
        carrier: string | null;
        tracking_number: string | null;
        shipment_status: string | null;
        delivery_note: string | null;
      }>(`
        SELECT fo.public_id AS fulfilment_id,
          EXISTS (
            SELECT 1
            FROM fulfilment_order_lines fol2
            JOIN order_lines ol2 ON ol2.id=fol2.order_line_id
            JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=ol2.assigned_offer_id
            JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
            WHERE fol2.fulfilment_order_id=fo.id
              AND ds.active=true
              AND ds.provider_kind IN ('brandsgateway_shopwoo','symphonya')
              AND (ds.order_forwarding_enabled=false OR ds.tracking_sync_enabled=false)
          ) AS manual_supplier,
          shipment.carrier,shipment.tracking_number,shipment.status AS shipment_status,
          shipment.proof->>'manualDeliveryNote' AS delivery_note
        FROM fulfilment_orders fo
        JOIN customer_orders o ON o.id=fo.order_id
        JOIN users u ON u.id=o.user_id
        LEFT JOIN LATERAL (
          SELECT s.carrier,s.tracking_number,s.status,s.proof
          FROM shipments s
          WHERE s.fulfilment_order_id=fo.id AND s.status<>'cancelled'
          ORDER BY s.updated_at DESC
          LIMIT 1
        ) shipment ON true
        WHERE o.public_id=$1 AND u.public_id=$2
        ORDER BY fo.created_at
      `, [orderId, principal.userId])
    ]);
    const taxMinor = Number(header.rows[0]?.tax_minor ?? 0);
    return {
      taxMinor: Number.isSafeInteger(taxMinor) ? taxMinor : 0,
      giftCards: giftCards.rows.map((row) => ({
        number: String(row.number),
        codeSuffix: String(row.code_suffix),
        amountMinor: Math.abs(Number(row.amount_minor) || 0)
      })),
      fulfilments: new Map(fulfilments.rows.map((row) => [String(row.fulfilment_id), {
        manualSupplier: Boolean(row.manual_supplier),
        carrier: row.carrier?.trim() || undefined,
        trackingNumber: row.tracking_number?.trim() || undefined,
        shipmentStatus: row.shipment_status?.trim() || undefined,
        deliveryNote: row.delivery_note?.trim() || undefined
      }] as const))
    };
  } catch (error) {
    console.error(JSON.stringify({
      level: "warn",
      event: "account.order_commercial_snapshot_degraded",
      orderId,
      message: error instanceof Error ? error.message : String(error)
    }));
    return { taxMinor: 0, giftCards: [], fulfilments: new Map() };
  }
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
    const alert = state.savedProductAlerts.find((item) => item.canonicalVariantId === saved.canonicalVariantId);
    if (!product) return {
      canonicalVariantId: saved.canonicalVariantId,
      unavailable: true as const,
      alert: alert ? customerBrowserSavedProductAlert(alert) : null
    };
    const availability = await getCanonicalAvailability(product.id);
    return {
      canonicalVariantId: saved.canonicalVariantId,
      slug: product.slug,
      title: product.title,
      price: product.price,
      available: availability?.available ?? false,
      alert: alert ? customerBrowserSavedProductAlert(alert) : null
    };
  }));
  const recentlyViewed = state.recentlyViewed.flatMap((view) => {
    const product = catalogMap.get(view.canonicalVariantId);
    return product ? [{ ...customerBrowserRecentlyViewed(view), slug: product.slug, title: product.title, price: product.price }] : [];
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
    return { ...item, slug: product.slug, title: product.title, price: product.price };
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
    account: { email: principal.email },
    csrfToken: principal.csrfToken,
    savedProducts,
    savedSearches: state.savedSearches.map(customerBrowserSavedSearch),
    notifications: state.notifications.map(customerBrowserNotification),
    unreadNotifications: state.unreadNotifications,
    recentlyViewed,
    preferences: customerBrowserPreferences(state.preferences),
    recommendations,
    privacyRequests: state.privacyRequests.map(customerBrowserPrivacyRequest),
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
  const [vendorEntries, pickups, invoice, returns, productSlugs, commercial] = await Promise.all([
    Promise.all(vendorIds.map(async (id) => [id, (await getPublicVendor(id))?.name ?? id] as const)),
    customerPickupCredentials(principal, orderId),
    customerFiscalDocumentForOrder(orderId),
    customerReturnsSnapshot(principal, orderId),
    orderProductSlugMap(order.lines.map((line) => line.canonicalVariantId)),
    customerOrderCommercialSnapshot(principal, orderId)
  ]);
  const vendorNames = new Map(vendorEntries);
  return orderDetailProjection(order, principal.userId, resolved.referenceNumber, principal.csrfToken, canCancel, vendorNames, productSlugs, pickups, returns, commercial, invoice ? {
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
  productSlugs: ReadonlyMap<string, string>,
  pickups: readonly CustomerPickupCredential[],
  returns: CustomerReturnsSnapshot,
  commercial: CustomerOrderCommercialSnapshot,
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
    vat: formatMoney({ minor: commercial.taxMinor, currency: "EUR" }),
    giftCards: commercial.giftCards.map((card) => ({
      number: card.number,
      codeSuffix: card.codeSuffix,
      amount: formatMoney({ minor: card.amountMinor, currency: "EUR" })
    })),
    total: formatMoney(order.total),
    cancellationReason: order.cancellationReason,
    cancelledAt: order.cancelledAt,
    canCancel,
    csrfToken,
    invoice,
    analytics: {
      currency: order.total.currency,
      value: order.total.minor / 100,
      tax: commercial.taxMinor / 100,
      shipping: order.deliveryCharge.minor / 100,
      discount: order.discount.minor / 100,
      items: order.lines.map((line) => ({
        item_id: line.canonicalVariantId,
        item_name: line.titleSnapshot,
        price: line.retailUnitPrice.minor / 100,
        quantity: line.quantity,
        vendor_id: line.vendorId
      }))
    },
    lines: order.lines.map((line) => ({
      id: lineTokens.get(line.id)!,
      canonicalVariantId: line.canonicalVariantId,
      productSlug: productSlugs.get(line.canonicalVariantId),
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
    fulfilments: order.fulfilments.filter((fulfilment) => fulfilment.status !== "rejected").map((fulfilment, index) => {
      const shipment = commercial.fulfilments.get(fulfilment.id);
      return {
        id: `part-${index + 1}`,
        sourceId: fulfilment.id,
        status: fulfilment.status,
        vendorId: fulfilment.vendorId,
        vendorName: vendorNames.get(fulfilment.vendorId) ?? fulfilment.vendorId,
        deliveryCharge: formatMoney(fulfilment.deliveryCharge),
        manualSupplier: shipment?.manualSupplier ?? false,
        carrier: shipment?.carrier,
        trackingNumber: shipment?.trackingNumber,
        shipmentStatus: shipment?.shipmentStatus,
        deliveryNote: shipment?.deliveryNote,
        lineIds: fulfilment.lineIds.flatMap((lineId) => {
          const token = lineTokens.get(lineId);
          return token ? [token] : [];
        })
      };
    }),
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
    const statuses: string[] = fulfilments.map((item) => item.status);

    if (order.fulfilmentMode === "local_delivery") {
      if (statuses.every((status) => status === "delivered")) return "Ολοκληρώθηκε";
      if (statuses.some((status) => status === "handed_over")) {
        if (statuses.every((status) => ["handed_over", "delivered"].includes(status))) return "Καθ’ οδόν προς εσένα";
        return "Συλλογή από καταστήματα";
      }
      if (statuses.some((status) => status === "ready_for_handover")) return "Περιμένει παραλαβή από οδηγό";
      if (statuses.some((status) => ["accepted", "picking", "packed"].includes(status))) return "Ετοιμάζεται από το κατάστημα";
      if (statuses.some((status) => status === "awaiting_acceptance")) return "Αναμονή αποδοχής από το κατάστημα";
    } else if (order.fulfilmentMode === "pickup") {
      if (statuses.every((status) => ["handed_over", "delivered"].includes(status))) return "Παραλήφθηκε";
      if (statuses.some((status) => status === "ready_for_handover")) return "Έτοιμη για παραλαβή";
      if (statuses.some((status) => ["accepted", "picking", "packed"].includes(status))) return "Ετοιμάζεται από το κατάστημα";
      if (statuses.some((status) => status === "awaiting_acceptance")) return "Αναμονή αποδοχής από το κατάστημα";
    } else {
      if (statuses.every((status) => status === "delivered")) return "Ολοκληρώθηκε";
      if (statuses.some((status) => status === "shipped")) return "Σε αποστολή";
      if (statuses.some((status) => status === "handed_over")) return "Παραδόθηκε στον μεταφορέα";
      if (statuses.some((status) => status === "ready_for_handover")) return "Έτοιμη για αποστολή";
      if (statuses.some((status) => ["accepted", "picking", "packed"].includes(status))) return "Ετοιμάζεται από το κατάστημα";
      if (statuses.some((status) => status === "awaiting_acceptance")) return "Αναμονή αποδοχής από το κατάστημα";
    }
  }

  if (["fulfilled", "completed"].includes(order.status)) return "Ολοκληρώθηκε";
  if (order.status === "confirmed") return "Επιβεβαιωμένη";
  if (order.status === "requires_customer_action") return "Χρειάζεται ενέργεια";
  if (order.status === "partially_fulfilled") return "Μερικώς ολοκληρωμένη";
  return order.status.replaceAll("_", " ");
}
