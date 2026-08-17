import {
  AuditLog,
  FairnessGovernanceService,
  InMemoryAuthService,
  InMemoryRateLimiter,
  OperationalHealthService,
  SecurityEventService,
  VendorRegistry,
  can,
  formatMoney,
  type Permission,
  type Role,
  type SessionPrincipal,
  type VendorOnboardingState
} from "@buy-local-sparta/core";
import { offers, runtime as commerceRuntime, variants, vendors } from "./demo-runtime";
import { getVendorOperationsRuntime, synchronizeOperationalEvents } from "./vendor-operations-runtime";

export const ADMIN_SESSION_COOKIE = "bls_admin_session";

const globalKey = "__buyLocalSpartaAdminRuntime" as const;
type AdminRuntime = ReturnType<typeof createAdminRuntime>;
const globals = globalThis as typeof globalThis & { [globalKey]?: AdminRuntime };

function authSecret(): string {
  const configured = process.env.BLS_AUTH_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("BLS_AUTH_SECRET (minimum 32 characters) is required for production admin sessions");
  return "buy-local-sparta-development-admin-auth-secret-not-production";
}

function createAdminRuntime() {
  if (process.env.NODE_ENV === "production" && process.env.BLS_ALLOW_EPHEMERAL_ADMIN_RUNTIME !== "true") {
    throw new Error("Production Admin requires PostgreSQL-backed identity/audit/governance persistence; ephemeral in-memory admin runtime is disabled");
  }
  const auth = new InMemoryAuthService({ secret: authSecret(), sessionTtlMs: 6 * 60 * 60 * 1000 });
  const rateLimiter = new InMemoryRateLimiter();
  const vendorRegistry = new VendorRegistry();
  const fairnessGovernance = new FairnessGovernanceService();
  const audit = new AuditLog();
  const securityEvents = new SecurityEventService();
  const health = new OperationalHealthService();
  const now = Date.now();
  const demoEnabled = process.env.BLS_ENABLE_DEMO_ACCOUNTS === "true" || process.env.NODE_ENV !== "production";

  if (demoEnabled) {
    auth.register({ email: "admin@demo.local", password: "AdminStrong!123", roles: ["super_admin"], emailVerified: true, now });
    auth.register({ email: "finance@demo.local", password: "FinanceStrong!123", roles: ["platform_finance"], emailVerified: true, now });
  }

  const applicantA = vendorRegistry.startApplication({
    ownerUserId: "seed-owner-little-dreamers", marketId: "sparta", legalName: "Little Dreamers Demo IKE", tradingName: "Little Dreamers Demo",
    taxNumber: "099999991", contactEmail: "applicant1@demo.local", phone: "2731000001", address: "Lykourgou 107", postcode: "23100",
    primaryCategory: "toys-hobbies-games", shopStory: "Seed application used only to exercise production Admin onboarding controls.", requestedPlanCode: "founding_early_bird", now: now - 86_400_000
  });
  vendorRegistry.submit(applicantA.id, applicantA.ownerUserId, now - 85_000_000);

  const applicantB = vendorRegistry.startApplication({
    ownerUserId: "seed-owner-home", marketId: "sparta", legalName: "Sparta Home Demo OE", tradingName: "Sparta Home Demo",
    taxNumber: "099999992", contactEmail: "applicant2@demo.local", phone: "2731000002", address: "Leonidou 20", postcode: "23100",
    primaryCategory: "lighting-decor", shopStory: "Second seed application used to prove state-gated onboarding.", requestedPlanCode: "free_listing", now: now - 172_800_000
  });
  vendorRegistry.submit(applicantB.id, applicantB.ownerUserId, now - 171_000_000);
  vendorRegistry.adminTransition({ applicationId: applicantB.id, to: "catalog_onboarding", actorId: "seed:platform", reason: "Seed verification passed", now: now - 170_000_000 });

  fairnessGovernance.submitAppeal({
    marketId: "sparta", vendorId: vendors[0]?.id ?? "vendor-demo-arkadia-tech", canonicalVariantId: variants[0]?.id,
    submittedBy: "seed:vendor", reason: "Please review recent qualified exposure distribution for this product.", now: now - 3_600_000
  });

  health.register({ name: "catalog", critical: true, check: () => getVendorOperationsRuntime().catalog.canonicals({ marketId: "sparta", activeOnly: true }).length ? undefined : ({ state: "unhealthy", message: "No active catalog products" }) });
  health.register({ name: "commerce", critical: true, check: () => commerceRuntime.inventory ? undefined : ({ state: "unhealthy", message: "Commerce runtime unavailable" }) });
  health.register({ name: "vendor_onboarding", critical: false, check: () => vendorRegistry.all().some((item) => item.state === "verification_pending") ? ({ state: "degraded", message: "Vendor verification queue requires attention" }) : undefined });
  health.register({ name: "finance", critical: false, check: () => getVendorOperationsRuntime().procurement.all().some((item) => item.status === "disputed") ? ({ state: "degraded", message: "Disputed procurements require review" }) : undefined });

  return { auth, rateLimiter, vendorRegistry, fairnessGovernance, audit, securityEvents, health };
}

export function getAdminRuntime(): AdminRuntime {
  return globals[globalKey] ?? (globals[globalKey] = createAdminRuntime());
}

export function isPlatformRole(role: Role): boolean {
  return ["super_admin", "vendor_operations", "catalog_qa", "customer_support", "platform_finance", "content_seo", "compliance", "logistics", "auditor"].includes(role);
}

export function hasAdminPermission(principal: SessionPrincipal, permission: Permission): boolean {
  return principal.roles.some((role) => isPlatformRole(role) && can(role, permission));
}

export function assertAdminPermission(principal: SessionPrincipal, permission: Permission): void {
  if (!hasAdminPermission(principal, permission)) throw new Error(`Admin permission required: ${permission}`);
}

export async function adminDashboard(principal: SessionPrincipal) {
  const admin = getAdminRuntime();
  const ops = getVendorOperationsRuntime();
  synchronizeOperationalEvents();
  const now = Date.now();
  const applications = admin.vendorRegistry.all();
  const submissions = ops.catalog.submissions();
  const media = ops.media.all();
  const compliance = ops.trust.documents();
  const procurements = ops.procurement.all();
  const health = await admin.health.readiness(now);
  const market = ops.analytics.marketReport({ marketId: "sparta", from: now - 30 * 24 * 60 * 60 * 1000, to: now + 1 });
  return {
    account: { email: principal.email, roles: principal.roles },
    csrfToken: principal.csrfToken,
    metrics: {
      vendorApplications: applications.length,
      vendorVerificationQueue: applications.filter((item) => ["verification_pending", "restricted"].includes(item.state)).length,
      catalogReviewQueue: submissions.filter((item) => ["needs_review", "linked"].includes(item.status)).length,
      pendingMedia: media.filter((item) => item.scanStatus === "pending" || item.rightsStatus === "pending" || item.moderationStatus === "pending").length,
      pendingCompliance: compliance.filter((item) => item.status === "pending").length,
      payableProcurements: procurements.filter((item) => item.status === "payable").length,
      fairnessAppeals: admin.fairnessGovernance.appeals().filter((item) => ["open", "under_review"].includes(item.status)).length,
      orders: commerceRuntime.commerce.orders().length
    },
    analytics: {
      searches: market.searches,
      searchSuccessRate: market.searchSuccessRate,
      uniqueSearchCtr: market.searchClickThroughRate,
      grossMerchandiseValue: formatMoney({ minor: market.gmvMinor, currency: "EUR" }),
      orders: market.authorisedOrders,
      averageOrderValue: formatMoney({ minor: market.averageOrderValueMinor, currency: "EUR" })
    },
    health,
    recentAudit: admin.audit.events().slice(-10).reverse(),
    security: admin.securityEvents.summary(now - 24 * 60 * 60 * 1000)
  };
}

export function adminVendorsWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "vendor.manage");
  const applications = [...getAdminRuntime().vendorRegistry.all()].sort((a, b) => b.updatedAt - a.updatedAt);
  return { csrfToken: principal.csrfToken, applications };
}

export function transitionVendorApplication(principal: SessionPrincipal, input: { applicationId: string; to: VendorOnboardingState; reason: string }) {
  assertAdminPermission(principal, "vendor.manage");
  const admin = getAdminRuntime();
  const before = admin.vendorRegistry.get(input.applicationId);
  if (!before) throw new Error("Vendor application not found");
  const updated = admin.vendorRegistry.adminTransition({ applicationId: input.applicationId, to: input.to, actorId: principal.userId, reason: input.reason, now: Date.now() });
  admin.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: `vendor.application_${input.to}`, entityType: "vendor_application", entityId: input.applicationId, reason: input.reason, before, after: updated, createdAt: Date.now() });
  return updated;
}

export function adminMatchingWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "catalog.read");
  const { catalog } = getVendorOperationsRuntime();
  return {
    csrfToken: principal.csrfToken,
    submissions: [...catalog.submissions()].sort((a, b) => b.updatedAt - a.updatedAt).map((item) => ({
      id: item.id, vendorId: item.vendorId, title: item.identity.title, categoryCode: item.categoryCode, status: item.status,
      canonicalVariantId: item.canonicalVariantId, supplierPrice: formatMoney(item.supplierUnitPrice), updatedAt: item.updatedAt,
      candidates: catalog.candidates({ submissionId: item.id }).map((candidate) => ({ id: candidate.id, canonicalVariantId: candidate.candidateCanonicalVariantId, status: candidate.status, confidence: candidate.result.confidence, level: candidate.result.level, reasons: candidate.result.reasons }))
    }))
  };
}

export function adminCatalogAction(principal: SessionPrincipal, input: { kind: "approve_match" | "reject_match" | "approve_offer" | "reject_offer"; id: string; reason: string }) {
  assertAdminPermission(principal, "catalog.write");
  const admin = getAdminRuntime();
  const catalog = getVendorOperationsRuntime().catalog;
  const now = Date.now();
  let result;
  if (input.kind === "approve_match") result = catalog.approveMatch({ candidateId: input.id, actorId: principal.userId, reason: input.reason, now });
  else if (input.kind === "reject_match") result = catalog.rejectMatch({ candidateId: input.id, actorId: principal.userId, reason: input.reason, now });
  else if (input.kind === "approve_offer") result = catalog.approveOffer({ submissionId: input.id, actorId: principal.userId, reason: input.reason, now });
  else result = catalog.rejectOffer({ submissionId: input.id, actorId: principal.userId, reason: input.reason, now });
  admin.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: `catalog.${input.kind}`, entityType: "catalog_submission", entityId: input.id, reason: input.reason, after: result, createdAt: now });
  return result;
}

export function adminCreateCanonical(principal: SessionPrincipal, input: { submissionId: string; platformPriceMinor: number; titleEl?: string; reason: string }) {
  assertAdminPermission(principal, "catalog.write");
  const now = Date.now();
  const result = getVendorOperationsRuntime().catalog.createCanonicalFromSubmission({ submissionId: input.submissionId, actorId: principal.userId, platformPriceMinor: input.platformPriceMinor, titleEl: input.titleEl, reason: input.reason, now });
  getAdminRuntime().audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "catalog.canonical_created", entityType: "canonical_product", entityId: result.id, reason: input.reason, after: result, createdAt: now });
  return result;
}

export function adminTrustWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "catalog.read");
  const ops = getVendorOperationsRuntime();
  return { csrfToken: principal.csrfToken, assets: [...ops.media.all()].sort((a, b) => b.createdAt - a.createdAt), documents: [...ops.trust.documents()].sort((a, b) => b.createdAt - a.createdAt) };
}

export function adminMediaAction(principal: SessionPrincipal, input: { assetId: string; action: "scan_clean" | "scan_infected" | "approve" | "reject"; reason?: string }) {
  assertAdminPermission(principal, "catalog.write");
  const ops = getVendorOperationsRuntime();
  const now = Date.now();
  const before = ops.media.get(input.assetId);
  if (!before) throw new Error("Media asset not found");
  let result;
  if (input.action === "scan_clean") result = ops.media.recordScan({ assetId: input.assetId, result: "clean", now });
  else if (input.action === "scan_infected") result = ops.media.recordScan({ assetId: input.assetId, result: "infected", reason: input.reason, now });
  else if (input.action === "approve") result = ops.media.review({ assetId: input.assetId, actorId: principal.userId, rightsStatus: "approved", moderationStatus: "approved", now });
  else result = ops.media.review({ assetId: input.assetId, actorId: principal.userId, rightsStatus: "rejected", moderationStatus: "rejected", reason: input.reason || "Rejected by platform review", now });
  getAdminRuntime().audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: `media.${input.action}`, entityType: "product_media", entityId: input.assetId, reason: input.reason, before, after: result, createdAt: now });
  return result;
}

export function adminComplianceAction(principal: SessionPrincipal, input: { documentId: string; decision: "verified" | "rejected"; reason?: string }) {
  assertAdminPermission(principal, "catalog.write");
  const now = Date.now();
  const result = getVendorOperationsRuntime().trust.reviewComplianceDocument({ documentId: input.documentId, actorId: principal.userId, decision: input.decision, reason: input.reason, now });
  getAdminRuntime().audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: `compliance.${input.decision}`, entityType: "compliance_document", entityId: input.documentId, reason: input.reason, after: result, createdAt: now });
  return result;
}

export function adminFinanceWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "finance.read");
  synchronizeOperationalEvents();
  const ops = getVendorOperationsRuntime();
  return {
    csrfToken: principal.csrfToken,
    procurements: [...ops.procurement.all()].sort((a, b) => b.updatedAt - a.updatedAt).map((item) => ({ ...item, grossLabel: formatMoney(item.gross), payableLabel: formatMoney(item.payable) })),
    settlements: [...ops.settlements.all()].sort((a, b) => b.createdAt - a.createdAt).map((item) => ({ ...item, totalPayableLabel: formatMoney(item.totalPayable) }))
  };
}

export function adminApprovePayable(principal: SessionPrincipal, procurementId: string) {
  assertAdminPermission(principal, "finance.write");
  const now = Date.now();
  const result = getVendorOperationsRuntime().procurement.approvePayable(procurementId, now);
  getAdminRuntime().audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "finance.procurement_payable", entityType: "procurement", entityId: procurementId, after: result, createdAt: now });
  return result;
}

export function adminSettlementAction(principal: SessionPrincipal, input: { kind: "create" | "submit" | "approve" | "pay"; batchId?: string; procurementIds?: string[]; payoutReference?: string }) {
  assertAdminPermission(principal, "finance.write");
  const ops = getVendorOperationsRuntime();
  const now = Date.now();
  let result;
  if (input.kind === "create") result = ops.settlements.createDraft({ marketId: "sparta", procurementIds: input.procurementIds ?? [], periodStart: now - 30 * 24 * 60 * 60 * 1000, periodEnd: now, createdBy: principal.userId, now });
  else if (input.kind === "submit") result = ops.settlements.submitForApproval({ batchId: input.batchId ?? "", actorId: principal.userId, now });
  else if (input.kind === "approve") result = ops.settlements.approve({ batchId: input.batchId ?? "", checkerId: principal.userId, now });
  else result = ops.settlements.markPaid({ batchId: input.batchId ?? "", actorId: principal.userId, payoutReference: input.payoutReference ?? "", now });
  getAdminRuntime().audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: `finance.settlement_${input.kind}`, entityType: "settlement_batch", entityId: result.id, after: result, createdAt: now });
  return result;
}

export function adminFairnessWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "fairness.read");
  const admin = getAdminRuntime();
  const snapshots = variants.map((variant) => {
    const fairnessSnapshot = commerceRuntime.fairness.snapshot({ marketId: "sparta", canonicalVariantId: variant.id });
    const vendorIds = new Set([...Object.keys(fairnessSnapshot.deficits), ...Object.keys(fairnessSnapshot.exposures)]);
    return {
      id: variant.id,
      title: variant.title,
      snapshot: [...vendorIds].map((vendorId) => ({
        vendorId,
        deficit: fairnessSnapshot.deficits[vendorId] ?? 0,
        qualifiedExposures: fairnessSnapshot.exposures[vendorId] ?? 0
      }))
    };
  });
  return { csrfToken: principal.csrfToken, snapshots, appeals: admin.fairnessGovernance.appeals(), anomalies: admin.fairnessGovernance.anomalies(), recentAssignments: commerceRuntime.fairness.events().slice(-100).reverse() };
}

export function adminReviewFairnessAppeal(principal: SessionPrincipal, input: { appealId: string; status: "under_review" | "resolved" | "rejected"; resolution?: string }) {
  assertAdminPermission(principal, "fairness.manage");
  const now = Date.now();
  const result = getAdminRuntime().fairnessGovernance.reviewAppeal({ appealId: input.appealId, actorId: principal.userId, status: input.status, resolution: input.resolution, now });
  getAdminRuntime().audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: `fairness.appeal_${input.status}`, entityType: "fairness_appeal", entityId: input.appealId, reason: input.resolution, after: result, createdAt: now });
  return result;
}

export async function adminOperationsWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "admin.audit.read");
  const admin = getAdminRuntime();
  const now = Date.now();
  return { csrfToken: principal.csrfToken, health: await admin.health.readiness(now), security: { summary: admin.securityEvents.summary(now - 24 * 60 * 60 * 1000), events: admin.securityEvents.recent({ since: now - 7 * 24 * 60 * 60 * 1000, limit: 100 }) }, audit: admin.audit.events().slice(-200).reverse() };
}
