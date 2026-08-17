import {
  AdviceService,
  AnalyticsService,
  CatalogManagementService,
  InMemoryObjectStorage,
  Ledger,
  NotificationService,
  ProcurementService,
  ProductMediaService,
  ProductTrustService,
  ReturnService,
  SettlementService,
  formatMoney,
  money,
  previewVendorProductCsv,
  type SessionPrincipal
} from "@buy-local-sparta/core";
import { offers, runtime as commerceRuntime, variants, vendors } from "./demo-runtime";

const globalKey = "__buyLocalSpartaVendorOperationsRuntime" as const;
type OperationsRuntime = ReturnType<typeof createOperationsRuntime>;
const globals = globalThis as typeof globalThis & { [globalKey]?: OperationsRuntime };

function createOperationsRuntime() {
  const catalog = new CatalogManagementService();
  const storage = new InMemoryObjectStorage();
  const media = new ProductMediaService(storage);
  const trust = new ProductTrustService({ catalog, media });
  const advice = new AdviceService(commerceRuntime.fairness);
  const analytics = new AnalyticsService();
  const notifications = new NotificationService();
  const ledger = new Ledger();
  const procurement = new ProcurementService(ledger);
  const settlements = new SettlementService(procurement);
  const returns = new ReturnService({ commerce: commerceRuntime.commerce, inventory: commerceRuntime.inventory, procurement, ledger });
  const now = Date.now();

  for (const variant of variants) {
    catalog.registerCanonical({
      id: variant.id,
      marketId: variant.marketId,
      categoryCode: variant.categoryCode ?? "uncategorized",
      identity: { id: variant.id, title: variant.title, condition: "new", attributes: {} },
      titleEl: variant.title,
      platformPrice: variant.platformPrice,
      taxRateBps: variant.taxRateBps,
      adviceAvailable: true,
      active: true,
      suppressed: false,
      recalled: false,
      createdAt: now,
      updatedAt: now
    });
  }

  // Mirror already-live demo supplier offers into the catalog workflow so the vendor
  // sees an auditable approved source-product record without exposing competitors.
  for (const variant of variants) {
    for (const liveOffer of offers[variant.id] ?? []) {
      const balance = commerceRuntime.inventory.balance(liveOffer.offerId);
      const draft = catalog.createDraft({
        marketId: variant.marketId,
        vendorId: liveOffer.vendorId,
        locationId: liveOffer.locationId,
        vendorSku: liveOffer.offerId,
        categoryCode: variant.categoryCode ?? "uncategorized",
        title: variant.title,
        condition: "new",
        supplierUnitPriceMinor: liveOffer.supplierUnitPrice.minor,
        supplierTaxRateBps: variant.taxRateBps,
        stockOnHand: balance.onHand,
        safetyStock: balance.safetyStock,
        fulfilmentModes: ["pickup"],
        adviceAvailable: true,
        source: "api",
        now
      });
      let submitted = catalog.submit({ submissionId: draft.id, vendorId: liveOffer.vendorId, now: now + 1 });
      if (!submitted.canonicalVariantId) {
        const candidate = catalog.candidates({ submissionId: draft.id }).find((item) => item.status === "pending" || item.status === "auto_linked");
        if (candidate) submitted = catalog.approveMatch({ candidateId: candidate.id, actorId: "bootstrap:platform", reason: "Existing approved live offer migration", now: now + 2 });
      }
      if (submitted.canonicalVariantId) catalog.approveOffer({ submissionId: draft.id, actorId: "bootstrap:platform", reason: "Existing approved live offer migration", now: now + 3 });
    }
  }

  return { catalog, storage, media, trust, advice, analytics, notifications, ledger, procurement, settlements, returns };
}

export function getVendorOperationsRuntime(): OperationsRuntime {
  if (process.env.NODE_ENV === "production" && process.env.BLS_ALLOW_EPHEMERAL_VENDOR_RUNTIME !== "true") {
    throw new Error("Production vendor operations require PostgreSQL-backed catalog/advice/finance/media persistence; ephemeral in-memory vendor runtime is disabled");
  }
  return globals[globalKey] ?? (globals[globalKey] = createOperationsRuntime());
}

/**
 * Single production-web admission rule for public commerce surfaces.
 * A canonical product under recall/compliance suppression (or explicitly inactive)
 * must not be rendered as sellable, recommended as available, or admitted to checkout.
 */
export function canonicalIsPubliclyAllowed(canonicalVariantId: string): boolean {
  const canonical = getVendorOperationsRuntime().catalog.canonical(canonicalVariantId);
  return Boolean(canonical && canonical.active && !canonical.suppressed && !canonical.recalled);
}

export function vendorCatalogWorkspace(principal: SessionPrincipal) {
  const vendorId = requiredVendorId(principal);
  const { catalog } = getVendorOperationsRuntime();
  const submissions = [...catalog.submissions({ vendorId })].sort((a, b) => b.updatedAt - a.updatedAt).map((item) => ({
    id: item.id,
    vendorSku: item.vendorSku,
    title: item.identity.title,
    categoryCode: item.categoryCode,
    status: item.status,
    canonicalVariantId: item.canonicalVariantId,
    supplierPrice: formatMoney(item.supplierUnitPrice),
    stockOnHand: item.stockOnHand,
    fulfilmentModes: item.fulfilmentModes,
    adviceAvailable: item.adviceAvailable,
    rejectionReason: item.rejectionReason,
    updatedAt: item.updatedAt,
    candidates: catalog.candidates({ submissionId: item.id }).map((candidate) => ({
      id: candidate.id,
      canonicalVariantId: candidate.candidateCanonicalVariantId,
      canonicalTitle: catalog.canonical(candidate.candidateCanonicalVariantId)?.titleEl ?? candidate.candidateCanonicalVariantId,
      level: candidate.result.level,
      confidence: candidate.result.confidence,
      status: candidate.status
    }))
  }));
  return {
    csrfToken: principal.csrfToken,
    vendorId,
    submissions,
    csvTemplate: "vendor_sku,category_code,title,brand,model,gtin,supplier_price_minor,stock_on_hand,safety_stock,fulfilment_modes,advice_available,attributes"
  };
}

export function createVendorProductDraft(principal: SessionPrincipal, input: {
  title: string; categoryCode: string; vendorSku?: string; brand?: string; model?: string; gtin?: string;
  supplierUnitPriceMinor: number; stockOnHand: number; safetyStock?: number; adviceAvailable?: boolean;
}) {
  const vendorId = requiredVendorId(principal);
  return getVendorOperationsRuntime().catalog.createDraft({
    marketId: "sparta",
    vendorId,
    locationId: `loc-${vendorId}`,
    vendorSku: input.vendorSku,
    categoryCode: input.categoryCode,
    title: input.title,
    brand: input.brand,
    model: input.model,
    gtin: input.gtin,
    condition: "new",
    supplierUnitPriceMinor: input.supplierUnitPriceMinor,
    stockOnHand: input.stockOnHand,
    safetyStock: input.safetyStock ?? 0,
    fulfilmentModes: ["pickup"],
    adviceAvailable: input.adviceAvailable ?? true,
    source: "manual",
    now: Date.now()
  });
}

export function submitVendorProduct(principal: SessionPrincipal, submissionId: string) {
  const vendorId = requiredVendorId(principal);
  return getVendorOperationsRuntime().catalog.submit({ submissionId, vendorId, now: Date.now() });
}

export function previewOrCommitVendorCsv(principal: SessionPrincipal, csv: string, confirm: boolean) {
  const vendorId = requiredVendorId(principal);
  const preview = previewVendorProductCsv(csv);
  if (!confirm || preview.errors.length) return { preview, created: 0 };
  const catalog = getVendorOperationsRuntime().catalog;
  for (const row of preview.rows) {
    catalog.createDraft({
      marketId: "sparta", vendorId, locationId: `loc-${vendorId}`, vendorSku: row.vendorSku,
      categoryCode: row.categoryCode, title: row.title, brand: row.brand, model: row.model, mpn: row.mpn, gtin: row.gtin,
      condition: row.condition, attributes: row.attributes, supplierUnitPriceMinor: row.supplierUnitPriceMinor,
      supplierTaxRateBps: row.supplierTaxRateBps, stockOnHand: row.stockOnHand, safetyStock: row.safetyStock,
      fulfilmentModes: row.fulfilmentModes, adviceAvailable: row.adviceAvailable, source: "csv", sourcePayload: { rowNumber: row.rowNumber }, now: Date.now()
    });
  }
  return { preview, created: preview.rows.length };
}

export function vendorTrustWorkspace(principal: SessionPrincipal) {
  const vendorId = requiredVendorId(principal);
  const ops = getVendorOperationsRuntime();
  const allowedProducts = variants.filter((variant) => vendorOwnsCanonical(vendorId, variant.id)).map((variant) => ({ id: variant.id, title: variant.title }));
  return {
    csrfToken: principal.csrfToken,
    products: allowedProducts,
    assets: [...ops.media.vendorAssets(vendorId)].sort((a, b) => b.createdAt - a.createdAt).map((asset) => ({
      id: asset.id, canonicalVariantId: asset.canonicalVariantId, filename: asset.originalFilename, kind: asset.kind,
      byteSize: asset.byteSize, scanStatus: asset.scanStatus, rightsStatus: asset.rightsStatus, moderationStatus: asset.moderationStatus,
      rejectionReason: asset.rejectionReason, createdAt: asset.createdAt
    })),
    documents: [...ops.trust.documents({ vendorId })].sort((a, b) => b.createdAt - a.createdAt).map((document) => ({
      id: document.id, canonicalVariantId: document.canonicalVariantId, type: document.type, issuer: document.issuer,
      identifier: document.identifier, mediaAssetId: document.mediaAssetId, status: document.status, validTo: document.validTo,
      rejectionReason: document.rejectionReason, createdAt: document.createdAt
    }))
  };
}

export async function uploadVendorMedia(principal: SessionPrincipal, input: {
  canonicalVariantId: string; kind: "image" | "video" | "document"; filename: string; contentType: string; bytes: Uint8Array; altText?: string; rightsOwner: string;
}) {
  const vendorId = requiredVendorId(principal);
  if (!vendorOwnsCanonical(vendorId, input.canonicalVariantId)) throw new Error("Vendor media access denied for canonical product");
  const media = getVendorOperationsRuntime().media;
  const intent = media.createUploadIntent({ canonicalVariantId: input.canonicalVariantId, vendorId, kind: input.kind, originalFilename: input.filename, altText: input.altText, rightsOwner: input.rightsOwner, now: Date.now() });
  return media.uploadAndFinalize({ intentToken: intent.token, contentType: input.contentType, bytes: input.bytes, expectedVendorId: vendorId, now: Date.now() });
}

export function submitVendorCompliance(principal: SessionPrincipal, input: { canonicalVariantId: string; type: string; issuer?: string; identifier?: string; mediaAssetId?: string; validTo?: number }) {
  const vendorId = requiredVendorId(principal);
  if (!vendorOwnsCanonical(vendorId, input.canonicalVariantId)) throw new Error("Vendor compliance access denied for canonical product");
  const ops = getVendorOperationsRuntime();
  if (input.mediaAssetId) {
    const asset = ops.media.get(input.mediaAssetId);
    if (!asset || asset.vendorId !== vendorId) throw new Error("Compliance evidence belongs to another vendor");
  }
  return ops.trust.submitComplianceDocument({ ...input, vendorId, now: Date.now() });
}

export function vendorAdviceWorkspace(principal: SessionPrincipal) {
  const vendorId = requiredVendorId(principal);
  const ops = getVendorOperationsRuntime();
  return {
    csrfToken: principal.csrfToken,
    conversations: [...ops.advice.conversationsForVendor(vendorId)].sort((a, b) => b.updatedAt - a.updatedAt).map((conversation) => ({
      ...conversation,
      messages: ops.advice.messages(conversation.id).map((message) => ({ id: message.id, senderType: message.senderType, body: message.body, createdAt: message.createdAt }))
    })),
    appointments: [...ops.advice.appointmentsForVendor(vendorId)].sort((a, b) => b.startsAt - a.startsAt),
    counteroffers: [...ops.advice.counteroffersForVendor(vendorId)].sort((a, b) => b.createdAt - a.createdAt),
    privateOffers: [...ops.advice.privateOffersForVendor(vendorId)].sort((a, b) => b.createdAt - a.createdAt).map((offer) => ({ ...offer, price: formatMoney(offer.price) })),
    notifications: ops.notifications.listForVendor(vendorId).filter((item) => item.channel === "in_app").slice(0, 30)
  };
}

export function vendorSendAdviceMessage(principal: SessionPrincipal, conversationId: string, body: string) {
  const vendorId = requiredVendorId(principal);
  const ops = getVendorOperationsRuntime();
  const conversation = ops.advice.conversation(conversationId);
  if (!conversation || conversation.vendorId !== vendorId) throw new Error("Vendor advice access denied");
  return ops.advice.sendMessage({ conversationId, senderType: "vendor", senderId: principal.userId, body, now: Date.now() });
}

export function vendorAppointmentAction(principal: SessionPrincipal, appointmentId: string, action: "complete" | "cancel") {
  const vendorId = requiredVendorId(principal);
  const ops = getVendorOperationsRuntime();
  const appointment = ops.advice.appointment(appointmentId);
  if (!appointment || appointment.vendorId !== vendorId) throw new Error("Vendor appointment access denied");
  return action === "cancel" ? ops.advice.cancelAppointment(appointmentId) : ops.advice.completeAppointment(appointmentId, Date.now());
}

export function vendorFinanceWorkspace(principal: SessionPrincipal) {
  const vendorId = requiredVendorId(principal);
  synchronizeOperationalEvents();
  const ops = getVendorOperationsRuntime();
  const procurements = [...ops.procurement.recordsForVendor(vendorId)].sort((a, b) => b.updatedAt - a.updatedAt).map((record) => ({
    id: record.id, orderId: record.orderId, orderLineId: record.orderLineId, status: record.status, invoiceNumber: record.invoiceNumber,
    gross: formatMoney(record.gross), serviceFeeGross: formatMoney(record.serviceFeeGross), shippingReimbursement: formatMoney(record.shippingReimbursement),
    payable: formatMoney(record.payable), payoutReference: record.payoutReference, updatedAt: record.updatedAt
  }));
  const settlements = [...ops.settlements.forVendor(vendorId)].sort((a, b) => b.createdAt - a.createdAt).map((batch) => ({
    id: batch.id, batchNumber: batch.batchNumber, status: batch.status, totalPayable: formatMoney(batch.totalPayable),
    periodStart: batch.periodStart, periodEnd: batch.periodEnd, paidAt: batch.paidAt, payoutReference: batch.payoutReference,
    lines: batch.lines.map((line) => ({ procurementId: line.procurementId, payable: formatMoney(line.payable), status: line.reconciliationStatus }))
  }));
  return { csrfToken: principal.csrfToken, procurements, settlements };
}

export function submitVendorInvoice(principal: SessionPrincipal, input: { procurementId: string; invoiceNumber: string; invoiceGrossMinor: number }) {
  const vendorId = requiredVendorId(principal);
  synchronizeOperationalEvents();
  const procurement = getVendorOperationsRuntime().procurement;
  const record = procurement.record(input.procurementId);
  if (record.vendorId !== vendorId) throw new Error("Vendor finance access denied");
  if (!Number.isSafeInteger(input.invoiceGrossMinor) || input.invoiceGrossMinor < 0) throw new Error("Invoice gross must use non-negative integer minor units");
  return procurement.matchInvoice({ procurementId: input.procurementId, invoiceNumber: input.invoiceNumber, invoiceGross: money(input.invoiceGrossMinor), now: Date.now() });
}

export function vendorAnalyticsWorkspace(principal: SessionPrincipal) {
  const vendorId = requiredVendorId(principal);
  synchronizeOperationalEvents();
  const now = Date.now();
  const report = getVendorOperationsRuntime().analytics.vendorReport({ marketId: "sparta", vendorId, from: now - 30 * 24 * 60 * 60 * 1000, to: now + 1 });
  return {
    period: "30d",
    qualifiedImpressions: report.qualifiedImpressions,
    productViews: report.productViews,
    cartAdds: report.cartAdds,
    attributedOrders: report.attributedOrders,
    attributedUnits: report.attributedUnits,
    attributedRetailSales: formatMoney(money(report.attributedRetailSalesMinor)),
    adviceStarts: report.adviceStarts,
    appointmentsBooked: report.appointmentsBooked,
    counterofferRequests: report.counterofferRequests,
    counterofferOffers: report.counterofferOffers,
    counterofferAccepted: report.counterofferAccepted
  };
}

export function vendorReturnsWorkspace(principal: SessionPrincipal) {
  const vendorId = requiredVendorId(principal);
  synchronizeOperationalEvents();
  const ops = getVendorOperationsRuntime();
  return {
    csrfToken: principal.csrfToken,
    returns: [...ops.returns.listForVendor(vendorId)].sort((a, b) => b.requestedAt - a.requestedAt).map((item) => ({
      id: item.id, orderId: item.orderId, orderLineId: item.orderLineId, canonicalVariantId: item.canonicalVariantId,
      quantity: item.quantity, reason: item.reason, requestedRemedy: item.requestedRemedy, status: item.status,
      requestedAt: item.requestedAt, authorization: item.authorization, replacement: item.replacement, repair: item.repair
    }))
  };
}

export function vendorReturnOperationalAction(principal: SessionPrincipal, input: { returnId: string; kind: "replacement" | "repair"; action: string; reference?: string }) {
  const vendorId = requiredVendorId(principal);
  const returns = getVendorOperationsRuntime().returns;
  const item = returns.get(input.returnId);
  if (!item || item.vendorId !== vendorId) throw new Error("Vendor return access denied");
  const now = Date.now();
  if (input.kind === "replacement") {
    if (!(["accept", "ready", "ship", "deliver", "reject"] as string[]).includes(input.action)) throw new Error("Unsupported replacement action");
    return returns.replacementAction({ returnId: input.returnId, vendorId, actorId: principal.userId, action: input.action as "accept" | "ready" | "ship" | "deliver" | "reject", reference: input.reference, now });
  }
  if (!(["start", "await_part", "ready", "return_to_customer", "fail"] as string[]).includes(input.action)) throw new Error("Unsupported repair action");
  return returns.repairAction({ returnId: input.returnId, vendorId, actorId: principal.userId, action: input.action as "start" | "await_part" | "ready" | "return_to_customer" | "fail", reference: input.reference, now });
}

export function synchronizeOperationalEvents() {
  const ops = getVendorOperationsRuntime();
  const now = Date.now();
  for (const order of commerceRuntime.commerce.orders()) {
    ops.procurement.accrueFulfilledLines(order, now);
    for (const line of order.lines) {
      ops.analytics.record({
        eventName: "order.vendor_attributed", marketId: "sparta", vendorId: line.vendorId, canonicalVariantId: line.canonicalVariantId,
        orderId: order.id, valueMinor: line.retailUnitPrice.minor * line.quantity, quantity: line.quantity, now: order.createdAt,
        dedupeKey: `web-vendor-order:${order.id}:${line.id}`
      });
    }
    for (const fulfilment of order.fulfilments) {
      ops.notifications.create({
        vendorId: fulfilment.vendorId, eventType: `fulfilment.${fulfilment.status}`, title: "Ενημέρωση παραγγελίας",
        body: `Η ανάθεση ${fulfilment.id} για την παραγγελία ${order.id} είναι ${fulfilment.status}.`, payload: { orderId: order.id, fulfilmentId: fulfilment.id },
        dedupeKey: `vendor-fulfilment:${fulfilment.id}:${fulfilment.status}`, now
      });
    }
  }
}

export function markVendorNotificationRead(principal: SessionPrincipal, notificationId: string) {
  const vendorId = requiredVendorId(principal);
  return getVendorOperationsRuntime().notifications.markRead({ id: notificationId, vendorId, now: Date.now() });
}

function vendorOwnsCanonical(vendorId: string, canonicalVariantId: string): boolean {
  return (offers[canonicalVariantId] ?? []).some((offer) => offer.vendorId === vendorId)
    || getVendorOperationsRuntime().catalog.submissions({ vendorId }).some((submission) => submission.canonicalVariantId === canonicalVariantId);
}

function requiredVendorId(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  if (!vendors.some((vendor) => vendor.id === principal.vendorId)) throw new Error("Vendor profile not found");
  return principal.vendorId;
}
