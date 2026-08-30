import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminCatalogueAttributeReviewWorkspace } from "../admin-catalogue-attribute-review";
import { adminGiftCards, giftCardsLiveEnabled } from "../gift-card-service";
import { suggestedQuestionsForContext } from "./context";
import { prioritizeRecommendations, type RecommendationCandidate } from "./recommendations";
import { buildAdminAssistantSnapshot } from "./tools";
import type {
  AdminAssistantClientContext,
  AdminAssistantEvidence,
  AdminAssistantFact,
  AdminAssistantFinding,
  AdminAssistantSnapshot
} from "./types";

function percentage(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : Math.round((numerator / denominator) * 100);
}

function mergeUniqueFindings(base: readonly AdminAssistantFinding[], extra: readonly AdminAssistantFinding[]): readonly AdminAssistantFinding[] {
  const byId = new Map<string, AdminAssistantFinding>();
  for (const item of [...extra, ...base]) if (!byId.has(item.id)) byId.set(item.id, item);
  const rank = { critical: 0, warning: 1, opportunity: 2, info: 3 } as const;
  return [...byId.values()].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 8);
}

export async function buildAdminAssistantIntelligenceSnapshot(
  principal: SessionPrincipal,
  client: AdminAssistantClientContext
): Promise<AdminAssistantSnapshot> {
  const base = await buildAdminAssistantSnapshot(principal, client);
  if (base.context.pageType === "attribute_mapping") return attributeMappingIntelligence(principal, client, base);
  if (base.context.pageType === "gift_cards") return giftCardIntelligence(principal, base);
  return { ...base, suggestedQuestions: suggestedQuestionsForContext(base.context) };
}

async function attributeMappingIntelligence(
  principal: SessionPrincipal,
  client: AdminAssistantClientContext,
  base: AdminAssistantSnapshot
): Promise<AdminAssistantSnapshot> {
  const review = await adminCatalogueAttributeReviewWorkspace(principal, { snapshotId: client.filters?.snapshot }).catch(() => undefined);
  if (!review) return { ...base, suggestedQuestions: suggestedQuestionsForContext(base.context) };

  const evidence: AdminAssistantEvidence[] = [];
  const structuredFacts: AdminAssistantFact[] = [];
  const findings: AdminAssistantFinding[] = [];
  const candidates: RecommendationCandidate[] = [];

  evidence.push(
    { id: "attr:unmapped", kind: "kontamou", label: "Unmapped observations", detail: `${review.totalUnmapped.toLocaleString("el-GR")} source attribute observations remain unmapped in the current review scope.`, metric: review.totalUnmapped, sourceTool: "getAttributeMappingIntelligence" },
    { id: "attr:groups", kind: "kontamou", label: "Repeated contexts", detail: `${review.groupCount.toLocaleString("el-GR")} repeated source-attribute contexts are grouped for review.`, metric: review.groupCount, sourceTool: "getAttributeMappingIntelligence" },
    { id: "attr:actionable", kind: "kontamou", label: "Actionable groups", detail: `${review.actionableGroups.toLocaleString("el-GR")} groups have governed mapping suggestions available.`, metric: review.actionableGroups, sourceTool: "getAttributeMappingIntelligence" },
    { id: "attr:blocked", kind: "kontamou", label: "Blocked groups", detail: `${review.blockedGroups.toLocaleString("el-GR")} groups are blocked by taxonomy/source context and should not be mapped blindly.`, metric: review.blockedGroups, sourceTool: "getAttributeMappingIntelligence" }
  );
  structuredFacts.push(
    { id: "fact:attr-unmapped", label: "Unmapped observations", value: review.totalUnmapped.toLocaleString("el-GR"), evidenceIds: ["attr:unmapped"] },
    { id: "fact:attr-actionable", label: "Ready to review", value: review.actionableGroups.toLocaleString("el-GR"), evidenceIds: ["attr:actionable"] },
    { id: "fact:attr-blocked", label: "Blocked by governance", value: review.blockedGroups.toLocaleString("el-GR"), evidenceIds: ["attr:blocked"] }
  );

  const topGroups = [...review.groups].sort((a, b) => b.observationCount - a.observationCount || b.productCount - a.productCount).slice(0, 12);
  const topObservationCount = topGroups.reduce((sum, group) => sum + group.observationCount, 0);
  const concentration = percentage(topObservationCount, review.totalUnmapped);
  evidence.push({ id: "attr:top12", kind: "derived", label: "Top-12 concentration", detail: `The 12 highest-volume review groups account for ${topObservationCount.toLocaleString("el-GR")} observations (${concentration}% of the current unmapped scope).`, metric: concentration, sourceTool: "getAttributeMappingIntelligence" });

  if (review.totalUnmapped > 0) {
    const finding: AdminAssistantFinding = {
      id: "attribute-mapping-unresolved",
      ruleId: "product_unmapped_attributes",
      severity: "warning",
      category: "data_quality",
      title: `${review.totalUnmapped.toLocaleString("el-GR")} attribute observations require normalization`,
      detail: `${review.groupCount.toLocaleString("el-GR")} repeated contexts exist; the top 12 account for ${concentration}% of unresolved observations in this scope.`,
      evidence: [`totalUnmapped = ${review.totalUnmapped}`, `groupCount = ${review.groupCount}`, `top12Concentration = ${concentration}%`],
      evidenceIds: ["attr:unmapped", "attr:groups", "attr:top12"],
      recommendation: "Start with the highest-volume actionable groups, but review unit and taxonomy exceptions before approving reusable mappings.",
      href: "/admin/catalogue-intake/attributes",
      affectedCount: review.totalUnmapped,
      confidence: "high"
    };
    findings.push(finding);
    candidates.push({ finding, dimensions: { dataQualityImpact: 10, customerImpact: 4, seoImpact: 5, urgency: 7, effort: 5, reversibility: 4 } });
  }

  if (review.blockedGroups > 0) {
    const finding: AdminAssistantFinding = {
      id: "attribute-mapping-blocked-contexts",
      ruleId: "attribute_mapping_taxonomy_blocked",
      severity: "warning",
      category: "catalog",
      title: `${review.blockedGroups.toLocaleString("el-GR")} mapping group(s) are blocked by taxonomy context`,
      detail: "These groups do not currently have a safe governed target scope. Mapping them globally would bypass the same category/Product Type boundary enforced by the Attribute Review Centre.",
      evidence: [`blockedGroups = ${review.blockedGroups}`],
      evidenceIds: ["attr:blocked"],
      recommendation: "Resolve the source taxonomy/category boundary first; do not compensate with a broad attribute rule.",
      href: "/admin/catalogue-intake/attributes",
      affectedCount: review.blockedGroups,
      confidence: "high"
    };
    findings.push(finding);
    candidates.push({ finding, dimensions: { dataQualityImpact: 8, complianceRisk: 3, urgency: 5, effort: 6 } });
  }

  for (const [index, group] of topGroups.slice(0, 4).entries()) {
    const evidenceId = `attr:group:${index}`;
    const topSuggestion = group.suggestions[0];
    const unitConflict = group.sourceUnits.length > 1;
    evidence.push({
      id: evidenceId,
      kind: "kontamou",
      label: group.sourceAttributeKey,
      detail: `${group.sourceName} · ${group.contextLabel} · ${group.observationCount.toLocaleString("el-GR")} observations across ${group.productCount.toLocaleString("el-GR")} products${group.sourceUnits.length ? ` · units: ${group.sourceUnits.join(", ")}` : ""}${topSuggestion ? ` · leading governed suggestion: ${topSuggestion.productTypeName} / ${topSuggestion.attributeCode}` : ""}`,
      metric: group.productCount,
      sourceTool: "getAttributeMappingIntelligence"
    });
    const finding: AdminAssistantFinding = {
      id: `attribute-group-${index}`,
      ruleId: unitConflict ? "attribute_inconsistent_units" : "attribute_high_impact_unmapped",
      severity: unitConflict ? "warning" : "opportunity",
      category: "data_quality",
      title: `${group.sourceAttributeKey} affects ${group.productCount.toLocaleString("el-GR")} product(s)`,
      detail: unitConflict
        ? `This repeated source context contains ${group.sourceUnits.length} observed units (${group.sourceUnits.join(", ")}). A reusable mapping needs unit review before approval.`
        : topSuggestion
          ? `The governed review service has a candidate target: ${topSuggestion.productTypeName} / ${topSuggestion.attributeCode}. This remains advisory until Admin approval.`
          : group.blocker ?? "No safe governed target is currently available for this context.",
      evidence: [`observations = ${group.observationCount}`, `products = ${group.productCount}`, ...(group.sourceUnits.length ? [`units = ${group.sourceUnits.join(",")}`] : [])],
      evidenceIds: [evidenceId],
      recommendation: unitConflict ? "Review samples and units before creating a reusable mapping." : group.actionable ? "Open the grouped review and inspect samples before approval." : "Resolve the blocker before attempting to map this source key.",
      href: "/admin/catalogue-intake/attributes",
      affectedCount: group.productCount,
      confidence: topSuggestion && !unitConflict ? "medium" : "high"
    };
    findings.push(finding);
    candidates.push({ finding, dimensions: { dataQualityImpact: Math.min(10, 4 + Math.log10(group.productCount + 1) * 2), seoImpact: 3, urgency: unitConflict ? 6 : 4, effort: 4 } });
  }

  const recommendations = prioritizeRecommendations(candidates, 5);
  const summary = review.totalUnmapped === 0
    ? "Attribute Mapping: no unmapped source observations are present in the current review scope."
    : `Attribute Mapping: ${review.totalUnmapped.toLocaleString("el-GR")} unresolved observations across ${review.groupCount.toLocaleString("el-GR")} repeated contexts. ${review.actionableGroups.toLocaleString("el-GR")} are ready for governed review; ${review.blockedGroups.toLocaleString("el-GR")} are blocked. The top 12 groups account for ${concentration}% of unresolved observations.`;

  return {
    ...base,
    summary,
    facts: [
      `${review.totalUnmapped.toLocaleString("el-GR")} unmapped observations are in scope.`,
      `${review.actionableGroups.toLocaleString("el-GR")} grouped contexts are actionable and ${review.blockedGroups.toLocaleString("el-GR")} are blocked.`,
      `The top 12 groups account for ${concentration}% of current unmapped observations.`
    ],
    structuredFacts,
    evidence,
    findings: mergeUniqueFindings(base.findings, findings),
    recommendations,
    suggestedQuestions: suggestedQuestionsForContext(base.context)
  };
}

async function giftCardIntelligence(principal: SessionPrincipal, base: AdminAssistantSnapshot): Promise<AdminAssistantSnapshot> {
  const cards = await adminGiftCards(principal).catch(() => undefined);
  if (!cards) return { ...base, suggestedQuestions: suggestedQuestionsForContext(base.context) };
  const now = Date.now();
  const active = cards.filter((card) => card.status === "active");
  const expiredActive = active.filter((card) => card.expiresAt !== undefined && card.expiresAt <= now);
  const zeroBalanceActive = active.filter((card) => card.balanceMinor <= 0);
  const availableBalanceMinor = active.reduce((sum, card) => sum + Math.max(0, card.balanceMinor), 0);
  const evidence: AdminAssistantEvidence[] = [
    { id: "gift:total", kind: "kontamou", label: "Gift cards", detail: `${cards.length} stored-value gift cards are visible to Admin.`, metric: cards.length, sourceTool: "getGiftCardHealth" },
    { id: "gift:active", kind: "kontamou", label: "Active", detail: `${active.length} cards are marked active.`, metric: active.length, sourceTool: "getGiftCardHealth" },
    { id: "gift:balance", kind: "kontamou", label: "Active balance", detail: `Active cards hold ${(availableBalanceMinor / 100).toLocaleString("el-GR", { style: "currency", currency: "EUR" })}.`, metric: availableBalanceMinor, sourceTool: "getGiftCardHealth" },
    { id: "gift:public-purchase", kind: "kontamou", label: "Public purchase flag", detail: `Public gift-card purchase is ${giftCardsLiveEnabled() ? "enabled" : "feature-gated"}. This flag is separate from checkout redemption of already issued cards.`, metric: giftCardsLiveEnabled(), sourceTool: "getGiftCardHealth" }
  ];
  const findings: AdminAssistantFinding[] = [];
  const candidates: RecommendationCandidate[] = [];

  if (expiredActive.length) {
    const finding: AdminAssistantFinding = {
      id: "gift-card-active-expired",
      ruleId: "gift_card_not_redeemable",
      severity: "warning",
      category: "financial",
      title: `${expiredActive.length} active gift card(s) are already expired`,
      detail: "The redemption service rejects expired cards even when their stored status is active.",
      evidence: [`activeExpired = ${expiredActive.length}`],
      evidenceIds: ["gift:active"],
      recommendation: "Review these records and align operational status with expiry before relying on them at checkout.",
      href: "/admin/gift-cards",
      affectedCount: expiredActive.length,
      confidence: "high"
    };
    findings.push(finding);
    candidates.push({ finding, dimensions: { financialImpact: 7, customerImpact: 8, urgency: 8, effort: 3 } });
  }
  if (zeroBalanceActive.length) {
    const finding: AdminAssistantFinding = {
      id: "gift-card-active-zero-balance",
      ruleId: "gift_card_state_balance_inconsistent",
      severity: "warning",
      category: "financial",
      title: `${zeroBalanceActive.length} active gift card(s) have no redeemable balance`,
      detail: "Checkout redemption requires a positive merchandise-applicable amount; active cards with zero balance are operationally inconsistent with the normal depleted state.",
      evidence: [`activeZeroBalance = ${zeroBalanceActive.length}`],
      evidenceIds: ["gift:active", "gift:balance"],
      recommendation: "Inspect the ledger/state transition for these cards before launch or customer support use.",
      href: "/admin/gift-cards",
      affectedCount: zeroBalanceActive.length,
      confidence: "high"
    };
    findings.push(finding);
    candidates.push({ finding, dimensions: { financialImpact: 6, customerImpact: 7, urgency: 7, effort: 4 } });
  }

  const recommendations = prioritizeRecommendations(candidates, 5);
  return {
    ...base,
    summary: `Gift Cards: ${cards.length} card(s) exist, ${active.length} are active, with ${(availableBalanceMinor / 100).toLocaleString("el-GR", { style: "currency", currency: "EUR" })} active balance. ${expiredActive.length + zeroBalanceActive.length ? `${expiredActive.length + zeroBalanceActive.length} deterministic redemption/state issue(s) need review.` : "No expiry/balance contradiction was detected by the current deterministic checks."}`,
    facts: [
      `${active.length} of ${cards.length} gift cards are marked active.`,
      `Active stored balance is ${(availableBalanceMinor / 100).toLocaleString("el-GR", { style: "currency", currency: "EUR" })}.`,
      `Public purchase is ${giftCardsLiveEnabled() ? "enabled" : "feature-gated"}; this is separate from redemption of an already issued card.`
    ],
    evidence,
    findings: mergeUniqueFindings(base.findings.filter((item) => item.id !== "gift-card-diagnostic-missing"), findings),
    recommendations,
    suggestedQuestions: suggestedQuestionsForContext(base.context)
  };
}
