import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminDashboard, adminOperationsWorkspace, adminTaxWorkspace, adminVendorsWorkspace, hasAdminPermission } from "../admin-runtime";
import { adminCatalogueOverviewWorkspace } from "../admin-catalogue-overview-runtime";
import { adminMaintenanceWorkspace, adminOrdersReturnsWorkspace } from "../admin-governance-runtime";
import { adminSeoWorkspace } from "../admin-seo-runtime";
import { buildAdminAssistantContext, suggestedQuestionsForDomain } from "./context";
import { recordAssistantToolAudit } from "./repository";
import type { AdminAssistantClientContext, AdminAssistantFinding, AdminAssistantRecentAction, AdminAssistantSnapshot } from "./types";

const terminalOrders = new Set(["cancelled", "completed", "fulfilled", "refunded"]);
const healthyStates = new Set(["ready", "healthy", "ok", "disabled"]);

function finding(input: AdminAssistantFinding): AdminAssistantFinding { return input; }
function summaryFrom(contextLabel: string, facts: readonly string[], findings: readonly AdminAssistantFinding[]): string {
  const critical = findings.filter((item) => item.severity === "critical").length;
  const warnings = findings.filter((item) => item.severity === "warning").length;
  if (critical) return `${contextLabel}: ${critical} critical finding${critical === 1 ? "" : "s"} requires attention. ${facts[0] ?? ""}`.trim();
  if (warnings) return `${contextLabel}: ${warnings} warning${warnings === 1 ? "" : "s"} worth reviewing. ${facts[0] ?? ""}`.trim();
  return `${contextLabel}: no critical issue was found by the checks available for this context. ${facts[0] ?? ""}`.trim();
}

async function observed<T>(principal: SessionPrincipal, toolName: string, parameters: Record<string, unknown>, run: () => Promise<T>): Promise<T | undefined> {
  const startedAt = Date.now();
  try {
    const result = await run();
    await recordAssistantToolAudit(principal, { toolName, parameters, resultState: "ok", durationMs: Date.now() - startedAt }).catch(() => undefined);
    return result;
  } catch (cause) {
    await recordAssistantToolAudit(principal, { toolName, parameters, resultState: "error", error: cause instanceof Error ? cause.message : "tool_failed", durationMs: Date.now() - startedAt }).catch(() => undefined);
    return undefined;
  }
}

async function recentAdminActions(principal: SessionPrincipal): Promise<readonly AdminAssistantRecentAction[]> {
  if (!hasAdminPermission(principal, "admin.audit.read")) return [];
  const operations = await observed(principal, "getRecentAdminEvents", { limit: 8 }, () => adminOperationsWorkspace(principal));
  if (!operations) return [];
  return operations.audit
    .filter((entry) => {
      const actor = (entry as unknown as { actorId?: string }).actorId;
      return !actor || actor === principal.userId;
    })
    .slice(0, 8)
    .map((entry) => ({ action: entry.action, entityType: entry.entityType, entityId: entry.entityId, createdAt: (entry as unknown as { createdAt?: number }).createdAt }));
}

export async function buildAdminAssistantSnapshot(principal: SessionPrincipal, client: AdminAssistantClientContext): Promise<AdminAssistantSnapshot> {
  const context = buildAdminAssistantContext(principal, client);
  const facts: string[] = [];
  const findings: AdminAssistantFinding[] = [];

  if (context.domain === "dashboard") {
    const data = await observed(principal, "getAdminBriefing", { route: context.route }, () => adminDashboard(principal));
    if (data) {
      facts.push(`${data.metrics.orders} orders are present in the current dashboard snapshot.`);
      if (!data.health.ok && hasAdminPermission(principal, "admin.audit.read")) findings.push(finding({ id: "dashboard-platform-health", severity: "critical", category: "system", title: "Platform health needs investigation", detail: "The Admin dashboard reports a non-healthy platform state.", evidence: ["dashboard.health.ok = false"], recommendation: "Open System Health & Audit and identify the failing dependency before live operational changes.", href: "/admin/operations" }));
      if (hasAdminPermission(principal, "vendor.manage") && data.metrics.vendorVerificationQueue > 0) findings.push(finding({ id: "dashboard-vendor-queue", severity: "warning", category: "vendor", title: `${data.metrics.vendorVerificationQueue} partner verification item(s) need attention`, detail: "The current dashboard has partner verification work waiting for an Admin decision.", evidence: [`vendorVerificationQueue = ${data.metrics.vendorVerificationQueue}`], recommendation: "Review the partner pipeline before activating additional vendors.", href: "/admin/partners/pipeline", affectedCount: data.metrics.vendorVerificationQueue }));
      if (hasAdminPermission(principal, "catalog.read") && data.metrics.catalogReviewQueue > 0) findings.push(finding({ id: "dashboard-catalog-review", severity: "warning", category: "catalog", title: `${data.metrics.catalogReviewQueue} catalogue review item(s) are queued`, detail: "Canonical matching or offer review remains unresolved.", evidence: [`catalogReviewQueue = ${data.metrics.catalogReviewQueue}`], recommendation: "Resolve high-impact matching decisions before expanding source ingestion.", href: "/admin/matching", affectedCount: data.metrics.catalogReviewQueue }));
      if (hasAdminPermission(principal, "finance.read") && data.metrics.payableProcurements > 0) findings.push(finding({ id: "dashboard-payables", severity: "warning", category: "financial", title: `${data.metrics.payableProcurements} payable procurement(s) require finance follow-up`, detail: "Supplier procurement records are ready for the governed finance workflow.", evidence: [`payableProcurements = ${data.metrics.payableProcurements}`], recommendation: "Review payables and settlement readiness in Finance.", href: "/admin/finance", affectedCount: data.metrics.payableProcurements }));
    }
  }

  if (context.domain === "catalogue" && hasAdminPermission(principal, "catalog.read")) {
    const data = await observed(principal, "getCatalogueHealth", { route: context.route }, () => adminCatalogueOverviewWorkspace(principal));
    if (data) {
      facts.push(`${data.metrics.totalProducts.toLocaleString("el-GR")} canonical products and ${data.metrics.totalCategories.toLocaleString("el-GR")} taxonomy nodes are visible to the catalogue overview.`);
      facts.push(`Semantic attribute coverage is ${data.attributes.semanticCoveragePct}% using the existing deterministic catalogue calculation.`);
      if (data.attributes.unmappedObservations > 0) {
        const top = data.unmappedAttributes[0];
        findings.push(finding({ id: "catalogue-unmapped", severity: "warning", category: "data_quality", title: `${data.attributes.unmappedObservations.toLocaleString("el-GR")} source attribute observations remain unmapped`, detail: top ? `Highest-impact visible source key: ${top.sourceAttributeKey} from ${top.sourceName}, observed ${top.observationCount.toLocaleString("el-GR")} time(s) across ${top.productCount.toLocaleString("el-GR")} product(s).` : "Source observations remain outside canonical attribute mappings.", evidence: [`unmappedObservations = ${data.attributes.unmappedObservations}`, `approvedMappingRules = ${data.attributes.approvedMappingRules}`], recommendation: "Prioritize the highest-observation mappings first, then review unit/value exceptions before approving a global rule.", href: "/admin/catalogue-intake/attributes", affectedCount: data.attributes.unmappedObservations }));
      }
      if (data.metrics.emptyCategories > 0) findings.push(finding({ id: "catalogue-empty-branches", severity: "opportunity", category: "catalog", title: `${data.metrics.emptyCategories} taxonomy branch(es) contain no products`, detail: "Empty branches add navigation/governance overhead without current catalogue coverage.", evidence: [`emptyCategories = ${data.metrics.emptyCategories}`], recommendation: "Review whether each branch is intentionally pre-created, inactive, or should be consolidated.", href: "/admin/categories", affectedCount: data.metrics.emptyCategories }));
    }
  }

  if (context.domain === "orders" && hasAdminPermission(principal, "fulfilment.read")) {
    const data = await observed(principal, "getOrderSummary", { route: context.route }, () => adminOrdersReturnsWorkspace(principal));
    if (data) {
      const open = data.orders.filter((order) => !terminalOrders.has(order.status)).length;
      const activeReturns = data.returns.filter((item) => !["rejected", "refunded", "closed"].includes(item.status)).length;
      const refundReady = data.returns.filter((item) => item.status === "remedy_approved" && item.approvedRemedy === "refund").length;
      facts.push(`${open} order(s) are non-terminal; ${activeReturns} return workflow(s) are active.`);
      if (refundReady > 0) findings.push(finding({ id: "orders-refund-ready", severity: "warning", category: "order", title: `${refundReady} return(s) are approved for refund`, detail: "These cases have reached the governed refund-ready stage; execution still belongs to the existing returns/payment workflow.", evidence: [`refundReady = ${refundReady}`], recommendation: "Review the affected return cases and payment state before executing refunds.", href: "/admin/orders?view=returns", affectedCount: refundReady }));
      if (context.entityId) {
        const exact = data.orders.find((order) => order.id === context.entityId);
        if (exact) facts.unshift(`Current order ${context.entityId} is ${exact.status}, uses ${exact.fulfilmentMode}, and contains ${exact.lines.length} line(s).`);
      }
    }
  }

  if (context.domain === "partners" && hasAdminPermission(principal, "vendor.manage")) {
    const data = await observed(principal, "getVendorSummary", { route: context.route }, () => adminVendorsWorkspace(principal));
    if (data) {
      const preLive = new Set(["application_started", "verification_pending", "catalog_onboarding", "test_ready"]);
      const queue = data.applications.filter((item) => preLive.has(item.state)).length;
      facts.push(`${data.applications.length} partner application record(s) are available; ${queue} are in pre-live workflow states.`);
      if (queue > 0) findings.push(finding({ id: "partners-prelive", severity: "warning", category: "vendor", title: `${queue} partner application(s) still need pre-live work`, detail: "Application, verification, catalogue onboarding or test-readiness work remains open.", evidence: [`preLiveApplications = ${queue}`], recommendation: "Continue the governed partner pipeline before treating these vendors as commercially ready.", href: "/admin/partners/pipeline", affectedCount: queue }));
    }
  }

  if (context.domain === "tax" && hasAdminPermission(principal, "finance.read")) {
    const data = await observed(principal, "getTaxDocumentStatus", { route: context.route }, () => adminTaxWorkspace(principal));
    if (data) {
      const errors = data.documents.filter((document) => Boolean(document.lastError)).length;
      const manualReviewWithoutMark = data.documents.filter((document) => document.transmissionStatus === "manual_review" && Boolean(document.documentNumber) && !document.aadeMark).length;
      const ready = data.documents.filter((document) => document.transmissionStatus === "ready").length;
      facts.push(`${data.documents.length} fiscal document(s) are in the current tax workspace; ${ready} are ready for transmission and ${errors} have recorded transmission errors.`);
      if (errors > 0) findings.push(finding({ id: "tax-errors", severity: "critical", category: "tax", title: `${errors} fiscal document(s) have a recorded error`, detail: "KONTA MOY has local fiscal records whose latest transmission attempt contains an error.", evidence: [`documentsWithLastError = ${errors}`], recommendation: "Inspect the document and existing AADE workflow before retrying; do not infer tax success from payment state.", href: "/admin/tax#tax-documents", affectedCount: errors }));
      if (manualReviewWithoutMark > 0) findings.push(finding({ id: "tax-manual-review", severity: "warning", category: "tax", title: `${manualReviewWithoutMark} numbered fiscal document(s) need MARK reconciliation`, detail: "These documents are in manual_review with a document number but no local AADE MARK.", evidence: [`manualReviewWithoutMark = ${manualReviewWithoutMark}`], recommendation: "Use the existing read-only AADE reconciliation flow before considering retransmission.", href: "/admin/tax#tax-reconciliation", affectedCount: manualReviewWithoutMark }));
    }
  }

  if (context.domain === "seo" && hasAdminPermission(principal, "content.read")) {
    const data = await observed(principal, "getSeoHealth", { route: context.route }, () => adminSeoWorkspace(principal));
    if (data) {
      const critical = data.diagnostics.filter((item) => item.severity === "critical");
      const warnings = data.diagnostics.filter((item) => item.severity === "warning");
      const heldProducts = data.metrics.products - data.metrics.productIndexEligible;
      facts.push(`${data.metrics.productIndexEligible} of ${data.metrics.products} public canonical products are currently index-eligible; ${heldProducts} are held by existing quality/admission gates.`);
      for (const item of [...critical, ...warnings].slice(0, 5)) findings.push(finding({ id: `seo-${item.id}`, severity: item.severity === "critical" ? "critical" : "warning", category: "seo", title: item.title, detail: item.detail, evidence: [typeof item.count === "number" ? `count = ${item.count}` : `diagnostic = ${item.id}`], recommendation: "Open SEO Issues for URL-level remediation and recheck evidence.", href: "/admin/seo/issues", affectedCount: item.count }));
    }
  }

  if (context.domain === "platform" && hasAdminPermission(principal, "admin.audit.read")) {
    const [operations, maintenance] = await Promise.all([
      observed(principal, "getSystemHealth", { route: context.route }, () => adminOperationsWorkspace(principal)),
      observed(principal, "getBackgroundJobHealth", { route: context.route }, () => adminMaintenanceWorkspace(principal))
    ]);
    if (operations) {
      const attention = operations.health.checks.filter((check) => !healthyStates.has(String(check.state).toLowerCase()));
      const critical = attention.filter((check) => check.critical);
      facts.push(`${operations.health.checks.length} platform dependency check(s) are visible; ${attention.length} currently need attention.`);
      if (critical.length) findings.push(finding({ id: "platform-critical-health", severity: "critical", category: "system", title: `${critical.length} critical dependency check(s) are not healthy`, detail: critical.slice(0, 3).map((check) => `${check.name}: ${check.state}`).join(" · "), evidence: critical.map((check) => `${check.name} = ${check.state}`).slice(0, 5), recommendation: "Investigate the failing dependency before treating live commerce as healthy.", href: "/admin/operations", affectedCount: critical.length }));
    }
    if (maintenance) {
      const failingJobs = maintenance.jobNames.filter((job) => (job.state?.consecutiveFailures ?? 0) > 0);
      if (failingJobs.length) findings.push(finding({ id: "platform-job-failures", severity: "warning", category: "system", title: `${failingJobs.length} background job(s) have consecutive failures`, detail: failingJobs.slice(0, 4).map((job) => `${job.name ?? "job"}: ${job.state?.consecutiveFailures ?? 0}`).join(" · "), evidence: failingJobs.slice(0, 5).map((job) => `${job.name ?? "job"} failures = ${job.state?.consecutiveFailures ?? 0}`), recommendation: "Inspect the maintenance/runtime job workspace and resolve repeated failures before manually rerunning downstream work.", href: "/admin/maintenance", affectedCount: failingJobs.length }));
    }
  }

  if (context.domain === "gift_cards") facts.push("This V1 assistant recognizes the Gift Cards context, but does not infer redemption health without a dedicated deterministic gift-card diagnostic.");
  if (context.domain === "generic" && facts.length === 0) facts.push("This page is context-aware, but no dedicated deterministic domain diagnostic has been registered for it yet.");

  const recentActions = await recentAdminActions(principal);
  const sorted = findings.sort((a, b) => ({ critical: 0, warning: 1, opportunity: 2, info: 3 }[a.severity] - { critical: 0, warning: 1, opportunity: 2, info: 3 }[b.severity]).slice(0, 5);
  return { context, summary: summaryFrom(context.contextLabel, facts, sorted), facts: facts.slice(0, 6), findings: sorted, recentActions, suggestedQuestions: suggestedQuestionsForDomain(context.domain), generatedAt: Date.now() };
}
