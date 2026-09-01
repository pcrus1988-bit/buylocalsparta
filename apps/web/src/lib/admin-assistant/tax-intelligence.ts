import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getAdminAssistantTaxCrossDomain } from "./tax-cross-domain";
import { prioritizeRecommendations, type RecommendationCandidate } from "./recommendations";
import type { AdminAssistantEvidence, AdminAssistantFinding, AdminAssistantSnapshot } from "./types";

function mergeFindings(base: readonly AdminAssistantFinding[], extra: readonly AdminAssistantFinding[]): readonly AdminAssistantFinding[] {
  const rank = { critical: 0, warning: 1, opportunity: 2, info: 3 } as const;
  const byId = new Map<string, AdminAssistantFinding>();
  for (const item of [...extra, ...base]) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 8);
}

export async function taxCrossDomainIntelligence(
  principal: SessionPrincipal,
  base: AdminAssistantSnapshot
): Promise<AdminAssistantSnapshot> {
  const rows = await getAdminAssistantTaxCrossDomain(principal).catch(() => undefined);
  if (!rows) return base;
  const missingDocuments = rows.filter((row) => row.taxDocumentCount === 0);
  const paidPending = rows.filter((row) => row.orderStatus === "pending_payment");
  const evidence: AdminAssistantEvidence[] = [
    ...(base.evidence ?? []),
    { id: "tax:paid-missing-documents", kind: "derived", label: "Paid orders without fiscal documents", detail: `${missingDocuments.length.toLocaleString("el-GR")} captured/paid order(s) have no linked tax document in the bounded reconciliation query.`, metric: missingDocuments.length, sourceTool: "getTaxCrossDomainReconciliation" },
    { id: "tax:paid-pending-orders", kind: "derived", label: "Captured payment / pending order", detail: `${paidPending.length.toLocaleString("el-GR")} paid/captured order(s) still have order status pending_payment.`, metric: paidPending.length, sourceTool: "getTaxCrossDomainReconciliation" }
  ];
  const findings: AdminAssistantFinding[] = [];
  const candidates: RecommendationCandidate[] = [];
  const add = (finding: AdminAssistantFinding, dimensions: RecommendationCandidate["dimensions"]) => {
    findings.push(finding);
    candidates.push({ finding, dimensions });
  };

  if (missingDocuments.length) {
    add({
      id: "tax-paid-orders-missing-documents",
      ruleId: "paid_order_missing_tax_document",
      severity: "critical",
      category: "tax",
      title: `${missingDocuments.length} paid/captured order(s) have no fiscal document`,
      detail: `The bounded cross-domain reconciliation found payment capture evidence without any linked tax-document record. Examples: ${missingDocuments.slice(0, 5).map((row) => row.displayReference).join(", ")}.`,
      evidence: missingDocuments.slice(0, 5).map((row) => `${row.displayReference}: payment=${row.paymentStatus}, captured=${row.capturedMinor}, taxDocuments=0`),
      evidenceIds: ["tax:paid-missing-documents"],
      recommendation: "Investigate fiscal-document creation for these orders before attempting AADE transmission; document creation and transmission are separate failure boundaries.",
      href: "/admin/tax#tax-documents",
      affectedCount: missingDocuments.length,
      affectedEntities: missingDocuments.slice(0, 8).map((row) => ({ type: "order", id: row.orderId, label: row.displayReference, href: `/admin/orders/${encodeURIComponent(row.displayReference)}` })),
      confidence: "high"
    }, { financialImpact: 9, customerImpact: 6, complianceRisk: 10, urgency: 10, effort: 6 });
  }

  if (paidPending.length) {
    add({
      id: "tax-paid-orders-pending-payment-state",
      ruleId: "payment_order_state_mismatch",
      severity: "critical",
      category: "order",
      title: `${paidPending.length} captured/paid order(s) still say pending payment`,
      detail: `Payment and order lifecycle disagree for: ${paidPending.slice(0, 5).map((row) => row.displayReference).join(", ")}. This can block downstream fulfilment, fiscal creation or customer communication even when money was captured.`,
      evidence: paidPending.slice(0, 5).map((row) => `${row.displayReference}: order=${row.orderStatus}, payment=${row.paymentStatus}, captured=${row.capturedMinor}`),
      evidenceIds: ["tax:paid-pending-orders"],
      recommendation: "Reconcile payment/order event processing before manually changing order or fiscal state.",
      href: "/admin/orders?status=pending_payment",
      affectedCount: paidPending.length,
      affectedEntities: paidPending.slice(0, 8).map((row) => ({ type: "order", id: row.orderId, label: row.displayReference, href: `/admin/orders/${encodeURIComponent(row.displayReference)}` })),
      confidence: "high"
    }, { financialImpact: 10, customerImpact: 9, vendorImpact: 8, complianceRisk: 7, urgency: 10, effort: 6 });
  }

  const recommendations = prioritizeRecommendations(candidates, 5);
  const issueCount = missingDocuments.length + paidPending.length;
  return {
    ...base,
    summary: `${base.summary} Cross-domain reconciliation: ${missingDocuments.length} paid order(s) are missing fiscal documents and ${paidPending.length} paid order(s) still report pending_payment.${issueCount ? " These require operational review." : " No paid-order contradiction was found by the bounded reconciliation."}`,
    facts: [
      ...base.facts.slice(0, 4),
      `Paid/captured orders without a tax document: ${missingDocuments.length}.`,
      `Paid/captured orders still pending_payment: ${paidPending.length}.`
    ].slice(0, 6),
    evidence,
    findings: mergeFindings(base.findings, findings),
    recommendations: [...recommendations, ...(base.recommendations ?? []).filter((existing) => !recommendations.some((item) => item.id === existing.id))].slice(0, 5)
  };
}
