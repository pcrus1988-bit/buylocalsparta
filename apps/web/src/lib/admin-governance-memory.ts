import {
  CategoryGovernanceService,
  ContentService,
  InMemoryScheduledJobStore,
  LocalSearchEngine,
  RecallOperationsService,
  ReviewService,
  ScheduledJobRunner,
  SearchIndexingService,
  defaultCustomerRetentionSnapshot,
  formatMoney,
  money,
  type CategoryCommerceMode,
  type ContentPageType,
  type PrivacyRequestStatus,
  type ReturnDisposition,
  type ReturnRemedy,
  type ReviewStatus,
  type SessionPrincipal
} from "@buy-local-sparta/core";
import { platformPrivacyAction, platformPrivacyRequests } from "./customer-state-runtime";
import { assertAdminPermission, getAdminRuntime, hasAdminPermission } from "./admin-memory-runtime";
import { offers, runtime as commerceRuntime, variants, vendors } from "./demo-runtime";
import { getVendorOperationsRuntime, synchronizeOperationalEvents } from "./vendor-operations-runtime";

const globalKey = "__buyLocalSpartaAdminGovernanceRuntime" as const;
type GovernanceRuntime = ReturnType<typeof createGovernanceRuntime>;
const globals = globalThis as typeof globalThis & { [globalKey]?: GovernanceRuntime };

const DAY = 24 * 60 * 60 * 1000;

function createGovernanceRuntime() {
  if (process.env.NODE_ENV === "production" && process.env.BLS_ALLOW_EPHEMERAL_ADMIN_RUNTIME !== "true") {
    throw new Error("Production Admin governance requires PostgreSQL-backed content/review/privacy/job persistence; ephemeral runtime is disabled");
  }
  const ops = getVendorOperationsRuntime();
  const categories = new CategoryGovernanceService();
  seedCategoryGovernance(categories);
  const content = new ContentService();
  seedContent(content);
  const recalls = new RecallOperationsService({ commerce: commerceRuntime.commerce, returns: ops.returns });
  const reviews = new ReviewService({ commerce: commerceRuntime.commerce, advice: ops.advice });
  const search = new LocalSearchEngine();
  const searchIndexer = new SearchIndexingService({
    backend: search,
    resolver: (canonicalVariantId, now) => {
      const canonical = ops.catalog.canonical(canonicalVariantId);
      if (!canonical || !canonical.active || canonical.suppressed || canonical.recalled) return undefined;
      const approved = ops.catalog.submissions({ status: "approved" }).filter((submission) => submission.canonicalVariantId === canonical.id);
      const available = approved.some((submission) => submission.stockOnHand - submission.safetyStock > 0);
      return {
        id: canonical.id,
        type: "product" as const,
        marketId: canonical.marketId,
        title: canonical.titleEl,
        titleEl: canonical.titleEl,
        titleEn: canonical.titleEn,
        body: canonical.descriptionEl,
        brand: canonical.identity.brand,
        model: canonical.identity.model,
        identifiers: [canonical.identity.gtin, canonical.identity.mpn].filter(Boolean) as string[],
        categoryCodes: [canonical.categoryCode],
        synonyms: canonical.synonyms,
        available,
        pickupToday: approved.some((submission) => submission.fulfilmentModes.includes("pickup") && submission.stockOnHand - submission.safetyStock > 0),
        adviceAvailable: canonical.adviceAvailable ?? false,
        priceMinor: canonical.platformPrice.minor,
        attributes: canonical.identity.attributes,
        metadata: { indexedAt: now }
      };
    }
  });
  for (const canonical of ops.catalog.canonicals({ marketId: "sparta" })) {
    const approved = ops.catalog.submissions({ status: "approved" }).filter((submission) => submission.canonicalVariantId === canonical.id);
    if (canonical.active && !canonical.suppressed && !canonical.recalled) search.upsert({
      id: canonical.id,
      type: "product",
      marketId: canonical.marketId,
      title: canonical.titleEl,
      titleEl: canonical.titleEl,
      titleEn: canonical.titleEn,
      body: canonical.descriptionEl,
      brand: canonical.identity.brand,
      model: canonical.identity.model,
      categoryCodes: [canonical.categoryCode],
      available: approved.some((submission) => submission.stockOnHand - submission.safetyStock > 0),
      pickupToday: approved.some((submission) => submission.fulfilmentModes.includes("pickup") && submission.stockOnHand - submission.safetyStock > 0),
      adviceAvailable: canonical.adviceAvailable ?? false,
      priceMinor: canonical.platformPrice.minor,
      attributes: canonical.identity.attributes
    });
  }
  const scheduledJobStore = new InMemoryScheduledJobStore();
  const scheduledJobs = new ScheduledJobRunner({ store: scheduledJobStore, ownerId: "web-admin-preview-scheduler", leaseMs: 30_000 });
  scheduledJobs.register({ name: "compliance-document-expiry", intervalMs: 60 * 60 * 1000, run: (now) => { ops.trust.refreshExpiry(now); } });
  scheduledJobs.register({ name: "cms-publication", intervalMs: 60_000, run: (now) => { content.releaseScheduled(now); } });
  scheduledJobs.register({ name: "search-reconcile", intervalMs: 30 * 60 * 1000, run: async (now) => {
    for (const canonical of ops.catalog.canonicals({ marketId: "sparta" })) await searchIndexer.reindex(canonical.id, now);
  } });
  scheduledJobs.register({ name: "analytics-retention", intervalMs: DAY, run: (now) => { ops.analytics.purgeBefore(now - 13 * 31 * DAY); } });
  scheduledJobs.register({ name: "operational-sync", intervalMs: 5 * 60 * 1000, run: () => { synchronizeOperationalEvents(); } });
  return { categories, content, recalls, reviews, search, searchIndexer, scheduledJobStore, scheduledJobs, lastMaintenanceRun: undefined as undefined | { at: number; result: unknown } };
}

export function getAdminGovernanceRuntime(): GovernanceRuntime {
  return globals[globalKey] ?? (globals[globalKey] = createGovernanceRuntime());
}

export function adminOrdersReturnsWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "fulfilment.read");
  synchronizeOperationalEvents();
  const ops = getVendorOperationsRuntime();
  const orders = [...commerceRuntime.commerce.orders()].sort((a, b) => b.createdAt - a.createdAt).map((order) => ({
    id: order.id,
    customerId: order.customerId,
    status: order.status,
    createdAt: order.createdAt,
    fulfilmentMode: order.fulfilmentMode,
    total: formatMoney(order.total),
    lines: order.lines.map((line) => ({ id: line.id, title: line.titleSnapshot, vendorId: line.vendorId, quantity: line.quantity, fulfilledQuantity: line.fulfilledQuantity, refundedQuantity: line.refundedQuantity, status: line.status })),
    fulfilments: order.fulfilments.map((item) => ({ id: item.id, vendorId: item.vendorId, status: item.status, lineIds: item.lineIds })),
    returns: ops.returns.listForOrder(order.id).map((item) => ({ id: item.id, status: item.status, reason: item.reason, quantity: item.quantity, requestedRemedy: item.requestedRemedy }))
  }));
  const returns = [...ops.returns.all()].sort((a, b) => b.requestedAt - a.requestedAt).map((item) => ({
    id: item.id, orderId: item.orderId, customerId: item.customerId, vendorId: item.vendorId, canonicalVariantId: item.canonicalVariantId,
    quantity: item.quantity, reason: item.reason, source: item.source, status: item.status, requestedRemedy: item.requestedRemedy,
    approvedRemedy: item.approvedRemedy, eligibility: item.eligibility, authorization: item.authorization, disposition: item.disposition,
    requestedAt: item.requestedAt, audit: item.audit.slice(-6).reverse()
  }));
  return { csrfToken: principal.csrfToken, orders, returns };
}

export function adminCancelOrder(principal: SessionPrincipal, input: { orderId: string; reason: string }) {
  if (!hasAdminPermission(principal, "returns.manage") && !hasAdminPermission(principal, "fulfilment.write")) throw new Error("Admin permission required: returns.manage or fulfilment.write");
  if (input.reason.trim().length < 5) throw new Error("Cancellation requires a meaningful reason");
  const order = commerceRuntime.commerce.cancelOrder({ orderId: input.orderId, reason: input.reason.trim(), idempotencyKey: `admin-cancel:${input.orderId}`, now: Date.now() });
  getAdminRuntime().audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "order.cancelled_by_platform", entityType: "order", entityId: order.id, reason: input.reason.trim(), createdAt: Date.now() });
  return order;
}

export function adminReturnAction(principal: SessionPrincipal, input: { returnId: string; action: "approve" | "authorize" | "receive" | "inspect_sellable" | "inspect_blocked" | "approve_refund" | "refund" | "reject"; reason?: string }) {
  assertAdminPermission(principal, "returns.manage");
  const returns = getVendorOperationsRuntime().returns;
  const now = Date.now();
  let result;
  if (input.action === "approve") result = returns.approve({ returnId: input.returnId, actorId: principal.userId, inspectionRequired: true, note: input.reason, now });
  else if (input.action === "authorize") {
    const current = returns.get(input.returnId); if (!current) throw new Error("Return not found");
    result = returns.issueAuthorization({ returnId: input.returnId, actorId: principal.userId, destinationType: "platform_inspection", instructions: input.reason?.trim() || "Return the item using the authorized RMA for platform inspection.", returnCostPayer: "platform", now });
  } else if (input.action === "receive") result = returns.markReceived({ returnId: input.returnId, actorId: principal.userId, now });
  else if (input.action === "inspect_sellable" || input.action === "inspect_blocked") result = returns.inspect({ returnId: input.returnId, actorId: principal.userId, disposition: input.action === "inspect_sellable" ? "sellable" : "blocked", findings: input.reason, now });
  else if (input.action === "approve_refund") result = returns.approveRemedy({ returnId: input.returnId, actorId: principal.userId, remedy: "refund", now });
  else if (input.action === "refund") result = returns.executeRefund({ returnId: input.returnId, actorId: principal.userId, note: input.reason, now });
  else result = returns.reject({ returnId: input.returnId, actorId: principal.userId, reason: input.reason?.trim() || "Return rejected after platform review", now });
  getAdminRuntime().audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: `return.${input.action}`, entityType: "return", entityId: input.returnId, reason: input.reason, after: result, createdAt: now });
  return result;
}

export function adminReviewsWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "reviews.read");
  const service = getAdminGovernanceRuntime().reviews;
  return {
    csrfToken: principal.csrfToken,
    reviews: service.all().map((review) => ({ ...review, response: service.publicForVendor(review.vendorId).find((item) => item.id === review.id)?.response })),
    reports: service.reports()
  };
}

export function adminModerateReview(principal: SessionPrincipal, input: { reviewId: string; status: ReviewStatus; reason: string }) {
  assertAdminPermission(principal, "reviews.manage");
  const result = getAdminGovernanceRuntime().reviews.moderate({ reviewId: input.reviewId, actorId: principal.userId, status: input.status, reason: input.reason, now: Date.now() });
  getAdminRuntime().audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: `review.${input.status}`, entityType: "review", entityId: input.reviewId, reason: input.reason, after: result, createdAt: Date.now() });
  return result;
}

export function adminReviewReportAction(principal: SessionPrincipal, input: { reportId: string; status: "under_review" | "resolved" | "rejected"; resolution?: string }) {
  assertAdminPermission(principal, "reviews.manage");
  return getAdminGovernanceRuntime().reviews.reviewReport({ reportId: input.reportId, actorId: principal.userId, status: input.status, resolution: input.resolution, now: Date.now() });
}

export async function adminPrivacyWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "privacy.read");
  const requests = await platformPrivacyRequests(principal.userId);
  return { csrfToken: principal.csrfToken, requests, overdue: requests.filter((item) => ["submitted", "processing"].includes(item.status) && item.targetAt < Date.now()).length };
}

export async function adminPrivacyAction(principal: SessionPrincipal, input: { requestId: string; action: "start" | "complete" | "partial" }) {
  assertAdminPermission(principal, "privacy.manage");
  const now = Date.now();
  const result = await platformPrivacyAction({ actorUserId: principal.userId, requestId: input.requestId, action: input.action, now, retention: defaultCustomerRetentionSnapshot(now) });
  getAdminRuntime().audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: `privacy.${input.action}`, entityType: "privacy_request", entityId: input.requestId, after: result, createdAt: now });
  return result;
}

export function adminCategoryWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "catalog.read");
  const service = getAdminGovernanceRuntime().categories;
  return { csrfToken: principal.csrfToken, categories: [...service.categories()].sort((a, b) => a.labelEl.localeCompare(b.labelEl, "el")), attributes: [...service.attributeDefinitions()].sort((a, b) => a.code.localeCompare(b.code)) };
}

export function adminUpsertCategory(principal: SessionPrincipal, input: { categoryCode: string; labelEl: string; commerceMode: CategoryCommerceMode }) {
  assertAdminPermission(principal, "catalog.write");
  const service = getAdminGovernanceRuntime().categories;
  service.registerCategory({ categoryCode: input.categoryCode, labelEl: input.labelEl, commerceMode: input.commerceMode, adviceAllowed: input.commerceMode !== "directory_only", counterofferAllowed: !["directory_only", "vehicles"].includes(input.commerceMode) });
  const result = service.policy(input.categoryCode);
  getAdminRuntime().audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "category.policy_upserted", entityType: "category_policy", entityId: input.categoryCode, after: result, createdAt: Date.now() });
  return result;
}

export function adminContentWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "content.read");
  const content = getAdminGovernanceRuntime().content;
  return {
    csrfToken: principal.csrfToken,
    pages: content.pages({ marketId: "sparta" }),
    redirects: content.redirects("sparta"),
    stories: content.stories({ marketId: "sparta" }),
    collections: content.collections({ marketId: "sparta" })
  };
}

export function adminCreateContentPage(principal: SessionPrincipal, input: { slug: string; title: string; description: string; pageType?: ContentPageType }) {
  assertAdminPermission(principal, "content.write");
  const now = Date.now();
  const result = getAdminGovernanceRuntime().content.createPage({ marketId: "sparta", pageType: input.pageType ?? "standard", slug: input.slug, actorId: principal.userId, now, translations: [{ locale: "el", title: input.title, seo: { title: input.title, description: input.description }, blocks: [{ id: "intro", type: "rich_text", data: { text: input.description } }] }] });
  getAdminRuntime().audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "content.page_created", entityType: "cms_page", entityId: result.id, after: result, createdAt: now });
  return result;
}

export function adminContentAction(principal: SessionPrincipal, input: { pageId: string; action: "publish" | "archive" | "restore"; reason?: string }) {
  assertAdminPermission(principal, "content.write");
  const content = getAdminGovernanceRuntime().content;
  const now = Date.now();
  if (input.action === "publish") return content.publishPage({ pageId: input.pageId, actorId: principal.userId, now });
  if (input.action === "restore") return content.restorePage({ pageId: input.pageId, actorId: principal.userId, now });
  return content.archivePage({ pageId: input.pageId, actorId: principal.userId, reason: input.reason?.trim() || "Archived by content administrator", now });
}

export function adminRecallWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "returns.read");
  const ops = getVendorOperationsRuntime();
  const runtime = getAdminGovernanceRuntime();
  return { csrfToken: principal.csrfToken, products: ops.catalog.canonicals({ marketId: "sparta" }), notices: ops.trust.notices(), affected: runtime.recalls.all() };
}

export function adminOpenRecall(principal: SessionPrincipal, input: { canonicalVariantId: string; details: string; severity: "low" | "medium" | "high" | "critical" }) {
  assertAdminPermission(principal, "returns.manage");
  const ops = getVendorOperationsRuntime();
  const now = Date.now();
  const notice = ops.trust.openNotice({ canonicalVariantId: input.canonicalVariantId, type: "recall", severity: input.severity, details: input.details, actorId: principal.userId, now });
  const affected = getAdminGovernanceRuntime().recalls.activate({ noticeId: notice.id, canonicalVariantId: input.canonicalVariantId, now });
  getAdminRuntime().audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "product.recall_opened", entityType: "product_notice", entityId: notice.id, reason: input.details, after: { notice, affectedCount: affected.length }, createdAt: now });
  return { notice, affected };
}

export function adminResolveRecall(principal: SessionPrincipal, input: { noticeId: string; resolution: string; restoreProduct?: boolean }) {
  assertAdminPermission(principal, "returns.manage");
  const ops = getVendorOperationsRuntime();
  const now = Date.now();
  const notice = ops.trust.resolveNotice({ noticeId: input.noticeId, actorId: principal.userId, resolution: input.resolution, now });
  if (input.restoreProduct) ops.trust.restoreProduct({ canonicalVariantId: notice.canonicalVariantId, actorId: principal.userId, reason: input.resolution, now });
  return notice;
}

export function adminMarketAnalyticsWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "analytics.market.read");
  synchronizeOperationalEvents();
  const now = Date.now();
  const report = getVendorOperationsRuntime().analytics.marketReport({ marketId: "sparta", from: now - 30 * DAY, to: now + 1, topLimit: 20 });
  return {
    period: "30d",
    searches: report.searches,
    zeroResultSearches: report.zeroResultSearches,
    searchSuccessRate: report.searchSuccessRate,
    searchClickThroughRate: report.searchClickThroughRate,
    productImpressions: report.productImpressions,
    productViews: report.productViews,
    cartAdds: report.cartAdds,
    authorisedOrders: report.authorisedOrders,
    gmv: formatMoney(money(report.gmvMinor)),
    averageOrderValue: formatMoney(money(report.averageOrderValueMinor)),
    adviceStarts: report.adviceStarts,
    appointmentsBooked: report.appointmentsBooked,
    counterofferConversionRate: report.counterofferConversionRate,
    topQueries: report.topQueries,
    topZeroResultQueries: report.topZeroResultQueries,
    categoryDemand: report.categoryDemand
  };
}

export async function adminMaintenanceWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "admin.audit.read");
  const runtime = getAdminGovernanceRuntime();
  return {
    csrfToken: principal.csrfToken,
    indexedDocuments: runtime.search.documents(),
    jobNames: ["compliance-document-expiry", "cms-publication", "search-reconcile", "analytics-retention", "operational-sync"].map((name) => ({ name, state: runtime.scheduledJobStore.state(name) })),
    lastMaintenanceRun: runtime.lastMaintenanceRun
  };
}

export async function adminRunMaintenance(principal: SessionPrincipal) {
  assertAdminPermission(principal, "admin.audit.read");
  if (!hasAdminPermission(principal, "catalog.write") && !hasAdminPermission(principal, "vendor.manage")) throw new Error("Operational maintenance requires elevated platform permissions");
  const runtime = getAdminGovernanceRuntime();
  const at = Date.now();
  const result = await runtime.scheduledJobs.runDue(at, 20);
  runtime.lastMaintenanceRun = { at, result };
  getAdminRuntime().audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "operations.maintenance_run", entityType: "scheduled_jobs", entityId: "web-admin-preview-scheduler", after: result, createdAt: at });
  return result;
}

function seedCategoryGovernance(service: CategoryGovernanceService) {
  service.registerAttribute({ code: "colour", labelEl: "Χρώμα", labelEn: "Colour", dataType: "text", variantIdentity: true, filterable: true });
  service.registerAttribute({ code: "size", labelEl: "Μέγεθος", labelEn: "Size", dataType: "text", variantIdentity: true, filterable: true });
  const defaults: Array<[string, string, CategoryCommerceMode]> = [
    ["technology", "Τεχνολογία", "compatibility_sensitive"],
    ["home-lighting", "Φωτισμός & διακόσμηση", "standard"],
    ["stationery", "Βιβλία, χαρτικά & είδη γραφείου", "standard"],
    ["toys-hobbies-games", "Παιχνίδια, χόμπι & games", "standard"],
    ["lighting-decor", "Φωτισμός & διακόσμηση", "standard"],
    ["mobile-telecom-electronics", "Κινητά, τηλεπικοινωνίες & ηλεκτρονικά", "compatibility_sensitive"],
    ["orthopaedic-medical-hearing", "Ορθοπεδικά, ιατρικά & ακοής", "regulated_mixed"],
    ["vehicles-motorcycles-bicycles", "Οχήματα, μοτοσικλέτες & ποδήλατα", "vehicles"],
    ["tobacco-smoking-goods", "Καπνικά & είδη καπνίσματος", "directory_only"]
  ];
  for (const [categoryCode, labelEl, commerceMode] of defaults) service.registerCategory({ categoryCode, labelEl, commerceMode, adviceAllowed: commerceMode !== "directory_only", counterofferAllowed: !["directory_only", "vehicles"].includes(commerceMode) });
}

function seedContent(content: ContentService) {
  const now = Date.now();
  content.createPage({ marketId: "sparta", pageType: "standard", slug: "about-buy-local-sparta", actorId: "seed:content", now, translations: [{ locale: "el", title: "Για το Buy Local Sparta", seo: { title: "Για το Buy Local Sparta", description: "Η φιλοσοφία της τοπικής αγοράς της Σπάρτης." }, blocks: [{ id: "intro", type: "rich_text", data: { text: "Buy Local. Know Your Vendor. Get Real Advice." } }] }] });
}
