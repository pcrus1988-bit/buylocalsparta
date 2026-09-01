import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminOrdersReturnsWorkspace } from "../admin-governance-runtime";
import { adminVendorShopsWorkspace } from "../vendor-admin-controls";
import { prioritizeRecommendations, type RecommendationCandidate } from "./recommendations";
import type { AdminAssistantEvidence, AdminAssistantFinding, AdminAssistantSnapshot } from "./types";

const terminalOrders = new Set(["cancelled", "completed", "fulfilled", "refunded"]);

function mergeFindings(base: readonly AdminAssistantFinding[], extra: readonly AdminAssistantFinding[]): readonly AdminAssistantFinding[] {
  const rank = { critical: 0, warning: 1, opportunity: 2, info: 3 } as const;
  const byId = new Map<string, AdminAssistantFinding>();
  for (const item of [...extra, ...base]) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 8);
}

export async function vendorOperationalIntelligence(
  principal: SessionPrincipal,
  base: AdminAssistantSnapshot
): Promise<AdminAssistantSnapshot> {
  const vendorId = base.context.entityId;
  if (!vendorId) return base;
  const [workspace, orderData] = await Promise.all([
    adminVendorShopsWorkspace(principal).catch(() => undefined),
    adminOrdersReturnsWorkspace(principal).catch(() => undefined)
  ]);
  const shop = workspace?.shops.find((item) => item.id === vendorId);
  if (!shop) return base;

  const orders = orderData?.orders.filter((order) => order.lines.some((line) => line.vendorId === shop.id)) ?? [];
  const activeOrders = orders.filter((order) => !terminalOrders.has(order.status));
  const now = Date.now();
  const agreementEndsAt = shop.agreement?.endsAt ? new Date(shop.agreement.endsAt).getTime() : undefined;
  const agreementExpired = shop.agreement?.status === "expired" || (agreementEndsAt !== undefined && Number.isFinite(agreementEndsAt) && agreementEndsAt <= now);
  const applicationPreLive = Boolean(shop.applicationState && !["active", "restricted", "suspended", "closed"].includes(shop.applicationState));
  const activationBlocked = !shop.cooperationDocumented || applicationPreLive;

  const evidence: AdminAssistantEvidence[] = [
    ...(base.evidence ?? []),
    { id: "vendor:state", kind: "kontamou", label: "Partner state", detail: `${shop.tradingName} is ${shop.status}; operational active = ${shop.operationalActive ? "yes" : "no"}.`, metric: shop.status, sourceTool: "getVendorOperationalIntelligence" },
    { id: "vendor:visibility", kind: "kontamou", label: "Public directory", detail: `Public directory visibility is ${shop.publicDirectoryVisible ? "on" : "off"}.`, metric: shop.publicDirectoryVisible, sourceTool: "getVendorOperationalIntelligence" },
    { id: "vendor:agreement", kind: "kontamou", label: "Agreement", detail: shop.agreement ? `${shop.agreement.code} v${shop.agreement.version} · ${shop.agreement.status} · cooperation documented = ${shop.cooperationDocumented ? "yes" : "no"}.` : "No cooperation agreement record is available.", metric: shop.cooperationDocumented, sourceTool: "getVendorOperationalIntelligence" },
    { id: "vendor:locations", kind: "kontamou", label: "Locations", detail: `${shop.activeLocationCount} of ${shop.locationCount} partner location(s) are active.`, metric: shop.activeLocationCount, sourceTool: "getVendorOperationalIntelligence" },
    { id: "vendor:offers", kind: "kontamou", label: "Approved offers", detail: `${shop.approvedOfferCount.toLocaleString("el-GR")} approved offer(s) belong to this partner.`, metric: shop.approvedOfferCount, sourceTool: "getVendorOperationalIntelligence" },
    { id: "vendor:orders", kind: "kontamou", label: "Assigned orders", detail: `${orders.length.toLocaleString("el-GR")} order(s) are assigned to this partner; ${activeOrders.length.toLocaleString("el-GR")} are non-terminal.`, metric: activeOrders.length, sourceTool: "getVendorOperationalIntelligence" }
  ];
  const findings: AdminAssistantFinding[] = [];
  const candidates: RecommendationCandidate[] = [];
  const add = (finding: AdminAssistantFinding, dimensions: RecommendationCandidate["dimensions"]) => {
    findings.push(finding);
    candidates.push({ finding, dimensions });
  };

  if (shop.operationalActive && !shop.cooperationDocumented) {
    add({
      id: "vendor-active-without-documented-agreement",
      ruleId: "vendor_active_without_agreement",
      severity: "critical",
      category: "vendor",
      title: "Partner is operationally active without a documented effective cooperation agreement",
      detail: "The Partner record requires an active signed agreement with a source document reference before commercial activation/publication is considered fully governed.",
      evidence: [`operationalActive = true`, `cooperationDocumented = false`, `agreementStatus = ${shop.agreement?.status ?? "missing"}`],
      evidenceIds: ["vendor:state", "vendor:agreement"],
      recommendation: "Review the cooperation agreement immediately and restrict activation/public visibility if the commercial gate is not satisfied.",
      href: `${base.context.route}#partner-agreement`,
      affectedCount: 1,
      confidence: "high"
    }, { financialImpact: 8, vendorImpact: 9, complianceRisk: 9, urgency: 10, effort: 4 });
  }

  if (shop.operationalActive && agreementExpired) {
    add({
      id: "vendor-active-expired-agreement",
      ruleId: "vendor_active_with_expired_agreement",
      severity: "critical",
      category: "vendor",
      title: "Partner is operationally active while its current agreement is expired",
      detail: `The current agreement ${shop.agreement?.code ?? "record"} is expired or has passed its end date.`,
      evidence: [`vendorStatus = ${shop.status}`, `agreementStatus = ${shop.agreement?.status ?? "missing"}`, `agreementEndsAt = ${shop.agreement?.endsAt ?? "missing"}`],
      evidenceIds: ["vendor:state", "vendor:agreement"],
      recommendation: "Create/complete the governed renewal or extension before continued commercial operation.",
      href: `${base.context.route}#partner-renewal`,
      affectedCount: 1,
      confidence: "high"
    }, { financialImpact: 8, vendorImpact: 10, complianceRisk: 8, urgency: 10, effort: 5 });
  }

  if (!shop.operationalActive && activeOrders.length > 0) {
    add({
      id: "vendor-inactive-with-active-orders",
      ruleId: "inactive_vendor_has_active_orders",
      severity: "critical",
      category: "order",
      title: `${activeOrders.length} active order(s) are assigned to an inactive partner`,
      detail: "The partner is not operationally active while non-terminal customer orders still contain lines assigned to it.",
      evidence: [`operationalActive = false`, `activeOrders = ${activeOrders.length}`],
      evidenceIds: ["vendor:state", "vendor:orders"],
      recommendation: "Review the affected orders and fulfilment ownership before changing partner state or allowing further customer commitments.",
      href: `/admin/orders?q=${encodeURIComponent(shop.id)}`,
      affectedCount: activeOrders.length,
      confidence: "high"
    }, { financialImpact: 9, customerImpact: 10, vendorImpact: 9, urgency: 10, effort: 5 });
  }

  if (shop.publicDirectoryVisible && !shop.operationalActive && !shop.researchVendor) {
    add({
      id: "vendor-visible-while-inactive",
      ruleId: "vendor_visibility_state_mismatch",
      severity: "warning",
      category: "vendor",
      title: "Inactive partner remains publicly visible",
      detail: "The normal partner visibility contract expects active commercial partners to satisfy their operational/commercial gates before public directory publication.",
      evidence: [`publicDirectoryVisible = true`, `operationalActive = false`, `researchVendor = false`],
      evidenceIds: ["vendor:state", "vendor:visibility"],
      recommendation: "Confirm whether visibility is intentional; otherwise hide the listing until the operational gate is restored.",
      href: base.context.route,
      affectedCount: 1,
      confidence: "high"
    }, { customerImpact: 7, vendorImpact: 6, seoImpact: 4, urgency: 7, effort: 2, reversibility: 9 });
  }

  if (shop.operationalActive && shop.activeLocationCount === 0) {
    add({
      id: "vendor-active-without-active-location",
      ruleId: "vendor_no_active_location",
      severity: "warning",
      category: "vendor",
      title: "Active partner has no active location",
      detail: "The partner is operationally active, but none of its stored locations are active. Local pickup/delivery and address-dependent experiences may therefore be incomplete.",
      evidence: [`activeLocationCount = 0`, `locationCount = ${shop.locationCount}`],
      evidenceIds: ["vendor:state", "vendor:locations"],
      recommendation: "Review location activation and address readiness before relying on local fulfilment or public location information.",
      href: base.context.route,
      affectedCount: 1,
      confidence: "high"
    }, { customerImpact: 7, vendorImpact: 7, dataQualityImpact: 6, urgency: 6, effort: 4 });
  }

  if (shop.operationalActive && shop.approvedOfferCount === 0) {
    add({
      id: "vendor-active-without-approved-offers",
      ruleId: "vendor_no_approved_offers",
      severity: "opportunity",
      category: "catalog",
      title: "Active partner has no approved catalogue offers",
      detail: "The partner can exist operationally, but it currently contributes no approved offer inventory to the marketplace catalogue.",
      evidence: ["approvedOfferCount = 0"],
      evidenceIds: ["vendor:offers", "vendor:state"],
      recommendation: "Prioritize catalogue assignment/import for this partner if it is intended to transact through KONTA MOY.",
      href: `/admin/partners/${encodeURIComponent(shop.id)}/catalogue`,
      affectedCount: 1,
      confidence: "high"
    }, { vendorImpact: 8, financialImpact: 6, customerImpact: 4, dataQualityImpact: 5, urgency: 4, effort: 6 });
  }

  if (applicationPreLive && shop.operationalActive) {
    add({
      id: "vendor-active-prelive-application",
      ruleId: "vendor_application_state_conflict",
      severity: "warning",
      category: "vendor",
      title: `Partner is active while onboarding state is still ${shop.applicationState}`,
      detail: "The Partner record treats pre-live application stages as governed activation blockers. The application lifecycle and vendor operational state should not disagree silently.",
      evidence: [`applicationState = ${shop.applicationState}`, `operationalActive = true`],
      evidenceIds: ["vendor:state"],
      recommendation: "Reconcile onboarding/application state with the operational vendor state before further activation changes.",
      href: "/admin/partners/pipeline",
      affectedCount: 1,
      confidence: "high"
    }, { vendorImpact: 8, complianceRisk: 6, urgency: 7, effort: 4 });
  }

  const recommendations = prioritizeRecommendations(candidates, 5);
  const issueCount = findings.filter((item) => item.severity === "critical" || item.severity === "warning").length;
  return {
    ...base,
    summary: `${shop.tradingName}: ${shop.status} · ${shop.activeLocationCount}/${shop.locationCount} active locations · ${shop.approvedOfferCount.toLocaleString("el-GR")} approved offers · ${activeOrders.length.toLocaleString("el-GR")} active orders. ${issueCount ? `${issueCount} deterministic operational/commercial issue(s) need attention.` : "No partner-state contradiction was detected by the current checks."}`,
    facts: [
      `Operational state: ${shop.status}; public directory: ${shop.publicDirectoryVisible ? "visible" : "hidden"}.`,
      `Agreement: ${shop.agreement ? `${shop.agreement.code} / ${shop.agreement.status}` : "missing"}; documented cooperation: ${shop.cooperationDocumented ? "yes" : "no"}.`,
      `Locations: ${shop.activeLocationCount}/${shop.locationCount} active; approved offers: ${shop.approvedOfferCount}.`,
      `Assigned orders: ${orders.length}; active orders: ${activeOrders.length}.`
    ],
    evidence,
    findings: mergeFindings(base.findings, findings),
    recommendations: [...recommendations, ...(base.recommendations ?? []).filter((existing) => !recommendations.some((item) => item.id === existing.id))].slice(0, 5)
  };
}
