import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminCatalogueOverviewWorkspace } from "../admin-catalogue-overview-runtime";
import { adminMaintenanceWorkspace, adminOrdersReturnsWorkspace } from "../admin-governance-runtime";
import { hasAdminPermission } from "../admin-runtime";
import { adminSeoWorkspace } from "../admin-seo-runtime";
import { adminVendorShopsWorkspace } from "../vendor-admin-controls";
import { prioritizeRecommendations, type RecommendationCandidate } from "./recommendations";
import { getAdminAssistantTaxCrossDomain } from "./tax-cross-domain";
import type { AdminAssistantEvidence, AdminAssistantFinding, AdminAssistantSnapshot } from "./types";

const terminalOrders = new Set(["cancelled", "completed", "fulfilled", "refunded"]);

function mergeFindings(base: readonly AdminAssistantFinding[], extra: readonly AdminAssistantFinding[]): readonly AdminAssistantFinding[] {
  const rank = { critical: 0, warning: 1, opportunity: 2, info: 3 } as const;
  const byId = new Map<string, AdminAssistantFinding>();
  for (const item of [...extra, ...base]) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 12);
}

export async function dashboardOperationalIntelligence(
  principal: SessionPrincipal,
  base: AdminAssistantSnapshot
): Promise<AdminAssistantSnapshot> {
  const [orders, tax, catalogue, vendors, seo, maintenance] = await Promise.all([
    hasAdminPermission(principal, "fulfilment.read") ? adminOrdersReturnsWorkspace(principal).catch(() => undefined) : undefined,
    hasAdminPermission(principal, "finance.read") ? getAdminAssistantTaxCrossDomain(principal).catch(() => undefined) : undefined,
    hasAdminPermission(principal, "catalog.read") ? adminCatalogueOverviewWorkspace(principal).catch(() => undefined) : undefined,
    hasAdminPermission(principal, "vendor.manage") ? adminVendorShopsWorkspace(principal).catch(() => undefined) : undefined,
    hasAdminPermission(principal, "content.read") ? adminSeoWorkspace(principal).catch(() => undefined) : undefined,
    hasAdminPermission(principal, "admin.audit.read") ? adminMaintenanceWorkspace(principal).catch(() => undefined) : undefined
  ]);

  const evidence: AdminAssistantEvidence[] = [...(base.evidence ?? [])];
  const findings: AdminAssistantFinding[] = [];
  const candidates: RecommendationCandidate[] = [];
  const add = (finding: AdminAssistantFinding, dimensions: RecommendationCandidate["dimensions"]) => {
    findings.push(finding);
    candidates.push({ finding, dimensions });
  };
  const todayFacts: string[] = [];

  if (orders) {
    const openOrders = orders.orders.filter((order) => !terminalOrders.has(order.status));
    const activeReturns = orders.returns.filter((item) => !["rejected", "refunded", "closed"].includes(item.status));
    const refundReady = activeReturns.filter((item) => item.status === "remedy_approved" && item.approvedRemedy === "refund");
    evidence.push({ id: "dashboard:orders", kind: "kontamou", label: "Orders & returns", detail: `${openOrders.length} non-terminal order(s), ${activeReturns.length} active return(s), ${refundReady.length} refund-ready return(s).`, metric: openOrders.length, sourceTool: "getAdminBriefing" });
    todayFacts.push(`Orders: ${openOrders.length} active · ${activeReturns.length} active returns · ${refundReady.length} refund-ready.`);
    if (refundReady.length) add({
      id: "dashboard-refund-ready",
      ruleId: "return_refund_ready",
      severity: "warning",
      category: "order",
      title: `${refundReady.length} return(s) are approved for refund`,
      detail: "These return workflows have reached remedy_approved/refund and now need the existing payment/refund execution checks.",
      evidence: refundReady.slice(0, 5).map((item) => `${item.id}: ${item.status} · remedy=${item.approvedRemedy}`),
      evidenceIds: ["dashboard:orders"],
      recommendation: "Review payment/refund readiness and execute through the governed returns workflow; do not update order state manually.",
      href: "/admin/orders?view=returns",
      affectedCount: refundReady.length,
      confidence: "high"
    }, { financialImpact: 7, customerImpact: 9, vendorImpact: 5, urgency: 8, effort: 4 });
  }

  if (tax) {
    const missingDocuments = tax.filter((row) => row.taxDocumentCount === 0);
    const capturedPending = tax.filter((row) => row.orderStatus === "pending_payment" && row.capturedMinor > 0);
    evidence.push({ id: "dashboard:tax", kind: "kontamou", label: "Tax reconciliation", detail: `${missingDocuments.length} captured/paid order(s) have no fiscal document; ${capturedPending.length} captured order(s) remain pending_payment.`, metric: missingDocuments.length + capturedPending.length, sourceTool: "getTaxCrossDomainReconciliation" });
    todayFacts.push(`Tax: ${missingDocuments.length} paid/captured orders without document · ${capturedPending.length} captured orders still pending payment.`);
    if (missingDocuments.length) add({
      id: "dashboard-paid-missing-tax",
      ruleId: "paid_order_missing_tax_document",
      severity: "critical",
      category: "tax",
      title: `${missingDocuments.length} paid/captured order(s) have no fiscal document`,
      detail: "This is a document-creation gap, not an AADE transmission retry problem.",
      evidence: missingDocuments.slice(0, 5).map((row) => `${row.displayReference ?? row.orderId}: ${row.paymentStatus}, capturedMinor=${row.capturedMinor}`),
      evidenceIds: ["dashboard:tax"],
      recommendation: "Open Tax & myDATA, identify why local fiscal-document creation did not occur, then use transmission/reconciliation only after a document exists.",
      href: "/admin/tax#tax-documents",
      affectedCount: missingDocuments.length,
      confidence: "high"
    }, { financialImpact: 8, complianceRisk: 10, customerImpact: 5, urgency: 10, effort: 5 });
    if (capturedPending.length) add({
      id: "dashboard-captured-pending-payment",
      ruleId: "payment_order_state_mismatch",
      severity: "critical",
      category: "order",
      title: `${capturedPending.length} captured order(s) still show pending_payment`,
      detail: "Payment projection and order lifecycle disagree, which can block fulfilment or produce duplicate operator intervention.",
      evidence: capturedPending.slice(0, 5).map((row) => `${row.displayReference ?? row.orderId}: ${row.paymentStatus}, capturedMinor=${row.capturedMinor}`),
      evidenceIds: ["dashboard:tax"],
      recommendation: "Investigate payment/order reconciliation before manually changing either state.",
      href: "/admin/orders",
      affectedCount: capturedPending.length,
      confidence: "high"
    }, { financialImpact: 9, customerImpact: 9, vendorImpact: 8, urgency: 10, effort: 5 });
  }

  if (catalogue) {
    const semanticGap = catalogue.attributes.unmappedObservations;
    evidence.push({ id: "dashboard:catalogue", kind: "kontamou", label: "Catalogue quality", detail: `${catalogue.metrics.totalProducts} canonical products · ${catalogue.attributes.semanticCoveragePct}% semantic attribute coverage · ${semanticGap} unmapped source observations.`, metric: semanticGap, sourceTool: "getCatalogueHealth" });
    todayFacts.push(`Catalogue: ${catalogue.metrics.totalProducts} products · ${catalogue.attributes.semanticCoveragePct}% semantic coverage · ${semanticGap} unmapped observations.`);
    if (semanticGap > 0) add({
      id: "dashboard-unmapped-attributes",
      ruleId: "product_unmapped_attributes",
      severity: "warning",
      category: "data_quality",
      title: `${semanticGap.toLocaleString("el-GR")} source attribute observations remain unmapped`,
      detail: "Unmapped attribute evidence limits normalized filters, product semantics and downstream catalogue/SEO quality.",
      evidence: [`semanticCoveragePct = ${catalogue.attributes.semanticCoveragePct}`, `unmappedObservations = ${semanticGap}`],
      evidenceIds: ["dashboard:catalogue"],
      recommendation: "Work the highest-volume governed Attribute Mapping groups first rather than mapping source keys globally by name.",
      href: "/admin/catalogue-intake/attributes",
      affectedCount: semanticGap,
      confidence: "high"
    }, { dataQualityImpact: 9, customerImpact: 5, seoImpact: 6, urgency: 6, effort: 6 });
  }

  if (vendors) {
    const activeWithoutAgreement = vendors.shops.filter((shop) => shop.operationalActive && !shop.cooperationDocumented);
    const invisibleActive = vendors.shops.filter((shop) => shop.operationalActive && !shop.publicDirectoryVisible);
    const noLocation = vendors.shops.filter((shop) => shop.operationalActive && shop.activeLocationCount === 0);
    evidence.push({ id: "dashboard:vendors", kind: "kontamou", label: "Partner readiness", detail: `${vendors.shops.length} partner shop(s); ${activeWithoutAgreement.length} active without documented cooperation; ${noLocation.length} active with no active location; ${invisibleActive.length} active but directory-hidden.`, metric: activeWithoutAgreement.length + noLocation.length, sourceTool: "getVendorOperationalIntelligence" });
    todayFacts.push(`Partners: ${activeWithoutAgreement.length} active without documented agreement · ${noLocation.length} active with no location · ${invisibleActive.length} active but directory-hidden.`);
    if (activeWithoutAgreement.length) add({
      id: "dashboard-active-vendor-no-agreement",
      ruleId: "vendor_active_without_agreement",
      severity: "critical",
      category: "vendor",
      title: `${activeWithoutAgreement.length} active partner(s) lack a documented active cooperation agreement`,
      detail: "Operational activation and the commercial agreement gate disagree.",
      evidence: activeWithoutAgreement.slice(0, 5).map((shop) => `${shop.id}: ${shop.tradingName}`),
      evidenceIds: ["dashboard:vendors"],
      recommendation: "Review each Partner record and restore the commercial gate before treating the shop as production-ready.",
      href: "/admin/vendors",
      affectedCount: activeWithoutAgreement.length,
      confidence: "high"
    }, { complianceRisk: 9, financialImpact: 8, vendorImpact: 9, urgency: 9, effort: 5 });
    if (noLocation.length) add({
      id: "dashboard-active-vendor-no-location",
      ruleId: "vendor_no_active_location",
      severity: "warning",
      category: "vendor",
      title: `${noLocation.length} active partner(s) have no active location`,
      detail: "Operational status is active but there is no active fulfilment/location record.",
      evidence: noLocation.slice(0, 5).map((shop) => `${shop.id}: ${shop.tradingName}`),
      evidenceIds: ["dashboard:vendors"],
      recommendation: "Review the partner location/setup before assigning new operational work.",
      href: "/admin/vendors",
      affectedCount: noLocation.length,
      confidence: "high"
    }, { vendorImpact: 8, customerImpact: 7, urgency: 7, effort: 4 });
  }

  if (seo) {
    const critical = seo.diagnostics.filter((item) => item.severity === "critical");
    const warnings = seo.diagnostics.filter((item) => item.severity === "warning");
    evidence.push({ id: "dashboard:seo", kind: "kontamou", label: "SEO health", detail: `${critical.length} critical and ${warnings.length} warning SEO diagnostic(s); ${seo.metrics.productIndexEligible}/${seo.metrics.products} product pages are index-eligible.`, metric: critical.length + warnings.length, sourceTool: "getSeoHealth" });
    todayFacts.push(`SEO: ${critical.length} critical · ${warnings.length} warning diagnostics · ${seo.metrics.productIndexEligible}/${seo.metrics.products} product pages index-eligible.`);
    if (critical.length) add({
      id: "dashboard-seo-critical",
      ruleId: "seo_critical_diagnostic",
      severity: "warning",
      category: "seo",
      title: `${critical.length} critical SEO diagnostic(s) need review`,
      detail: critical.slice(0, 3).map((item) => item.title).join(" · "),
      evidence: critical.slice(0, 5).map((item) => `${item.id}${typeof item.count === "number" ? ` count=${item.count}` : ""}`),
      evidenceIds: ["dashboard:seo"],
      recommendation: "Review URL-level SEO evidence and root cause before changing metadata or creating new landing pages.",
      href: "/admin/seo/issues",
      affectedCount: critical.reduce((sum, item) => sum + (typeof item.count === "number" ? item.count : 1), 0),
      confidence: "high"
    }, { seoImpact: 9, customerImpact: 4, urgency: 6, effort: 5 });
  }

  if (maintenance) {
    const failingJobs = maintenance.jobNames.filter((job) => (job.state?.consecutiveFailures ?? 0) > 0);
    evidence.push({ id: "dashboard:jobs", kind: "kontamou", label: "Background jobs", detail: `${failingJobs.length} background job(s) have consecutive failures.`, metric: failingJobs.length, sourceTool: "getSystemHealth" });
    todayFacts.push(`System: ${failingJobs.length} background job(s) with consecutive failures.`);
    if (failingJobs.length) add({
      id: "dashboard-background-job-failures",
      ruleId: "failed_background_job",
      severity: "critical",
      category: "system",
      title: `${failingJobs.length} background job(s) are failing repeatedly`,
      detail: failingJobs.slice(0, 4).map((job) => `${job.name}: ${job.state?.consecutiveFailures ?? 0} consecutive failure(s)`).join(" · "),
      evidence: failingJobs.slice(0, 6).map((job) => `${job.name}: failures=${job.state?.consecutiveFailures ?? 0}`),
      evidenceIds: ["dashboard:jobs"],
      recommendation: "Inspect the failing jobs and downstream projections before manually rerunning dependent workflows.",
      href: "/admin/maintenance",
      affectedCount: failingJobs.length,
      confidence: "high"
    }, { customerImpact: 7, vendorImpact: 7, complianceRisk: 5, urgency: 9, effort: 6 });
  }

  const recommendations = prioritizeRecommendations(candidates, 5);
  const mergedRecommendations = [...recommendations, ...(base.recommendations ?? []).filter((existing) => !recommendations.some((item) => item.id === existing.id))].slice(0, 5);
  const mergedFindings = mergeFindings(base.findings, findings);
  const criticalCount = mergedFindings.filter((item) => item.severity === "critical").length;
  const warningCount = mergedFindings.filter((item) => item.severity === "warning").length;

  return {
    ...base,
    summary: `Command Centre briefing: ${criticalCount} critical and ${warningCount} warning finding(s) are visible across the operational domains this Admin is authorised to read. ${mergedRecommendations[0] ? `Highest priority: ${mergedRecommendations[0].title}.` : "No evidence-backed intervention currently outranks normal operational work."}`,
    facts: todayFacts.slice(0, 6),
    evidence,
    findings: mergedFindings,
    recommendations: mergedRecommendations
  };
}
