import type { SessionPrincipal } from "@buy-local-sparta/core";
import { suggestedQuestionsForContext } from "./context";
import { buildAdminAssistantIntelligenceSnapshot } from "./intelligence";
import { getAdminAssistantOrderIntelligence } from "./order-intelligence";
import { prioritizeRecommendations, type RecommendationCandidate } from "./recommendations";
import type { AdminAssistantClientContext, AdminAssistantEvidence, AdminAssistantFinding, AdminAssistantSnapshot } from "./types";

const physicalProgress = new Set(["handed_over", "shipped", "delivered"]);
const paidPaymentStates = new Set(["captured", "paid", "settled", "partially_refunded", "refunded"]);

export async function buildAdminAssistantOperationalSnapshot(
  principal: SessionPrincipal,
  client: AdminAssistantClientContext
): Promise<AdminAssistantSnapshot> {
  const base = await buildAdminAssistantIntelligenceSnapshot(principal, client);
  if (base.context.pageType !== "order_detail" || !base.context.entityId) return base;
  const data = await getAdminAssistantOrderIntelligence(principal, base.context.entityId).catch(() => undefined);
  if (!data?.order) return base;

  const paymentPaid = Boolean(data.payment && (paidPaymentStates.has(data.payment.status) || data.payment.capturedMinor > 0));
  const fulfilmentStarted = data.order.fulfilmentStatuses.some((status) => physicalProgress.has(status));
  const acceptedTax = data.taxDocuments.some((document) => document.transmissionStatus === "accepted" && Boolean(document.aadeMark));
  const taxErrors = data.taxDocuments.filter((document) => Boolean(document.lastError));
  const uncertainTax = data.taxDocuments.filter((document) => document.transmissionStatus === "manual_review" && Boolean(document.documentNumber) && !document.aadeMark);

  const evidence: AdminAssistantEvidence[] = [
    ...(base.evidence ?? []),
    { id: "order:state", kind: "kontamou", label: "Order state", detail: `${data.displayReference ?? data.internalOrderId}: ${data.order.status} · ${data.order.fulfilmentMode} · ${data.order.itemCount} item(s).`, metric: data.order.status, sourceTool: "getOrderLifecycleIntelligence" },
    { id: "order:fulfilment", kind: "kontamou", label: "Fulfilment", detail: data.order.fulfilmentStatuses.length ? `Fulfilment statuses: ${data.order.fulfilmentStatuses.join(", ")}.` : "No fulfilment records are currently present.", metric: fulfilmentStarted, sourceTool: "getOrderLifecycleIntelligence" },
    ...(data.payment ? [{ id: "order:payment", kind: "kontamou" as const, label: "Payment", detail: `${data.payment.provider} · ${data.payment.status} · captured ${(data.payment.capturedMinor / 100).toLocaleString("el-GR", { style: "currency", currency: "EUR" })}.`, metric: data.payment.status, sourceTool: "getOrderLifecycleIntelligence" }] : []),
    { id: "order:tax", kind: "kontamou", label: "Fiscal documents", detail: `${data.taxDocuments.length} tax document(s) linked to this order; ${acceptedTax ? "at least one accepted document has a MARK" : "no accepted document with MARK is currently present"}.`, metric: data.taxDocuments.length, sourceTool: "getOrderLifecycleIntelligence" }
  ];

  const findings: AdminAssistantFinding[] = [];
  const candidates: RecommendationCandidate[] = [];

  const add = (finding: AdminAssistantFinding, dimensions: RecommendationCandidate["dimensions"]) => {
    findings.push(finding);
    candidates.push({ finding, dimensions });
  };

  if (paymentPaid && !data.taxDocuments.length) {
    add({
      id: "order-paid-missing-tax-document",
      ruleId: "paid_order_missing_tax_document",
      severity: "critical",
      category: "tax",
      title: "Payment succeeded but no fiscal document exists",
      detail: `${data.displayReference ?? data.internalOrderId} has captured/paid payment evidence, but KONTA MOY currently has no tax document linked to the order.`,
      evidence: [`paymentStatus = ${data.payment?.status}`, `capturedMinor = ${data.payment?.capturedMinor ?? 0}`, "taxDocuments = 0"],
      evidenceIds: ["order:payment", "order:tax"],
      recommendation: "Inspect the governed fiscal workflow and determine why document creation did not occur before retrying any AADE transmission.",
      href: "/admin/tax#tax-documents",
      affectedCount: 1,
      confidence: "high"
    }, { financialImpact: 8, customerImpact: 6, complianceRisk: 10, urgency: 10, effort: 5 });
  }

  if (!paymentPaid && fulfilmentStarted) {
    add({
      id: "order-unpaid-in-fulfilment",
      ruleId: "unpaid_order_in_fulfillment",
      severity: "critical",
      category: "order",
      title: "Physical fulfilment started without captured payment",
      detail: `The order has progressed to ${data.order.fulfilmentStatuses.join(", ")}, while the latest payment state does not show captured/paid funds.`,
      evidence: [`paymentStatus = ${data.payment?.status ?? "missing"}`, `capturedMinor = ${data.payment?.capturedMinor ?? 0}`, `fulfilment = ${data.order.fulfilmentStatuses.join(",")}`],
      evidenceIds: ["order:payment", "order:fulfilment"],
      recommendation: "Stop further operational handoff until payment state and fulfilment eligibility are reconciled through the existing order/payment workflow.",
      href: base.context.route,
      affectedCount: 1,
      confidence: "high"
    }, { financialImpact: 10, customerImpact: 8, vendorImpact: 9, urgency: 10, effort: 4 });
  }

  if (data.order.status === "pending_payment" && paymentPaid) {
    add({
      id: "order-payment-order-state-mismatch",
      ruleId: "payment_order_state_mismatch",
      severity: "critical",
      category: "order",
      title: "Order still says pending payment after payment capture",
      detail: "Payment evidence indicates funds were captured, but the order lifecycle remains in pending_payment.",
      evidence: [`orderStatus = ${data.order.status}`, `paymentStatus = ${data.payment?.status}`, `capturedMinor = ${data.payment?.capturedMinor ?? 0}`],
      evidenceIds: ["order:state", "order:payment"],
      recommendation: "Investigate payment/order reconciliation and downstream event processing before manually changing either state.",
      href: base.context.route,
      affectedCount: 1,
      confidence: "high"
    }, { financialImpact: 9, customerImpact: 9, vendorImpact: 8, urgency: 10, effort: 5 });
  }

  if (taxErrors.length) {
    add({
      id: "order-tax-transmission-errors",
      ruleId: "tax_document_transmission_error",
      severity: "critical",
      category: "tax",
      title: `${taxErrors.length} linked fiscal document(s) have transmission errors`,
      detail: "The order has local tax records whose latest AADE transmission evidence contains an error.",
      evidence: taxErrors.slice(0, 3).map((document) => `${document.id}: ${document.lastError}`),
      evidenceIds: ["order:tax"],
      recommendation: "Inspect the document state and use reconciliation when the AADE outcome is uncertain; do not blindly resend.",
      href: "/admin/tax#tax-documents",
      affectedCount: taxErrors.length,
      confidence: "high"
    }, { financialImpact: 7, complianceRisk: 10, urgency: 9, effort: 5 });
  }

  if (uncertainTax.length) {
    add({
      id: "order-tax-mark-reconciliation",
      ruleId: "tax_document_missing_mark",
      severity: "warning",
      category: "tax",
      title: `${uncertainTax.length} linked fiscal document(s) need MARK reconciliation`,
      detail: "A numbered document is in manual_review without a local AADE MARK, so transmission outcome should be reconciled before any retry.",
      evidence: uncertainTax.slice(0, 3).map((document) => `${document.id}: manual_review without MARK`),
      evidenceIds: ["order:tax"],
      recommendation: "Run the existing read-only AADE reconciliation for the affected document.",
      href: "/admin/tax#tax-reconciliation",
      affectedCount: uncertainTax.length,
      confidence: "high"
    }, { complianceRisk: 9, urgency: 8, effort: 3 });
  }

  if (data.order.openReturns > 0) {
    add({
      id: "order-open-return-workflow",
      ruleId: "order_active_return",
      severity: "warning",
      category: "order",
      title: `${data.order.openReturns} active return workflow(s) are linked to this order`,
      detail: "Any further fulfilment, refund or customer-support decision should account for the active return state.",
      evidence: [`openReturns = ${data.order.openReturns}`],
      evidenceIds: ["order:state"],
      recommendation: "Review the active return workflow before changing order or payment state.",
      href: `${base.context.route}#returns`,
      affectedCount: data.order.openReturns,
      confidence: "high"
    }, { financialImpact: 6, customerImpact: 8, vendorImpact: 5, urgency: 7, effort: 4 });
  }

  const recommendations = prioritizeRecommendations(candidates, 5);
  const mergedRecommendations = [...recommendations, ...(base.recommendations ?? []).filter((existing) => !recommendations.some((item) => item.id === existing.id))].slice(0, 5);
  const mergedFindings = [...findings, ...base.findings.filter((existing) => !findings.some((item) => item.id === existing.id))]
    .sort((a, b) => ({ critical: 0, warning: 1, opportunity: 2, info: 3 }[a.severity] - ({ critical: 0, warning: 1, opportunity: 2, info: 3 }[b.severity])))
    .slice(0, 8);
  const issueCount = findings.filter((item) => item.severity === "critical" || item.severity === "warning").length;

  return {
    ...base,
    summary: `${data.displayReference ?? data.internalOrderId}: ${data.order.status}. Payment is ${data.payment?.status ?? "not available"}; ${data.taxDocuments.length} fiscal document(s) are linked; fulfilment ${fulfilmentStarted ? "has physically progressed" : "has not reached a physical handoff state"}. ${issueCount ? `${issueCount} cross-domain issue(s) require attention.` : "No payment/fulfilment/tax contradiction was detected by the current checks."}`,
    facts: [
      `Order status: ${data.order.status}; fulfilment mode: ${data.order.fulfilmentMode}.`,
      `Payment: ${data.payment ? `${data.payment.provider} / ${data.payment.status}, captured ${(data.payment.capturedMinor / 100).toLocaleString("el-GR", { style: "currency", currency: "EUR" })}` : "no payment projection available"}.`,
      `Fiscal documents: ${data.taxDocuments.length}; accepted with MARK: ${acceptedTax ? "yes" : "no"}.`,
      `Active returns: ${data.order.openReturns}.`
    ],
    evidence,
    findings: mergedFindings,
    recommendations: mergedRecommendations,
    suggestedQuestions: suggestedQuestionsForContext(base.context)
  };
}
