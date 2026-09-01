import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminCatalogueControlledValueQueue } from "../admin-catalogue-controlled-value-queue";
import { adminCatalogueOverviewWorkspace } from "../admin-catalogue-overview-runtime";
import { adminCategoryWorkspace } from "../admin-governance-runtime";
import { prioritizeRecommendations, type RecommendationCandidate } from "./recommendations";
import type { AdminAssistantEvidence, AdminAssistantFinding, AdminAssistantSnapshot } from "./types";

function mergeFindings(base: readonly AdminAssistantFinding[], extra: readonly AdminAssistantFinding[]): readonly AdminAssistantFinding[] {
  const rank = { critical: 0, warning: 1, opportunity: 2, info: 3 } as const;
  const byId = new Map<string, AdminAssistantFinding>();
  for (const item of [...extra, ...base]) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 10);
}

function mergeRecommendations(base: AdminAssistantSnapshot, candidates: readonly RecommendationCandidate[]) {
  const ranked = prioritizeRecommendations(candidates, 5);
  return [...ranked, ...(base.recommendations ?? []).filter((existing) => !ranked.some((item) => item.id === existing.id))].slice(0, 5);
}

export async function categoryGovernanceIntelligence(
  principal: SessionPrincipal,
  base: AdminAssistantSnapshot
): Promise<AdminAssistantSnapshot> {
  const [overview, policy] = await Promise.all([
    adminCatalogueOverviewWorkspace(principal).catch(() => undefined),
    adminCategoryWorkspace(principal).catch(() => undefined)
  ]);
  if (!overview || !policy) return base;

  const inactiveWithLive = overview.categories.filter((category) => !category.active && category.subtreeLiveProducts > 0);
  const nonAssignableWithDirect = overview.categories.filter((category) => !category.assignable && category.directProducts > 0);
  const emptyActiveLeaves = overview.categories.filter((category) => category.active && category.discoverable && category.childCount === 0 && category.subtreeProducts === 0);
  const constrainedPolicies = policy.categories.filter((category) => category.commerceMode !== "standard");

  const evidence: AdminAssistantEvidence[] = [
    ...(base.evidence ?? []),
    { id: "category:taxonomy", kind: "kontamou", label: "Taxonomy", detail: `${overview.metrics.totalCategories} categories · ${overview.metrics.activeCategories} active · ${overview.metrics.taxonomyLevels} taxonomy level(s) · ${overview.metrics.totalProducts} canonical products.`, metric: overview.metrics.totalCategories, sourceTool: "getCategoryGovernanceIntelligence" },
    { id: "category:policies", kind: "kontamou", label: "Commerce policies", detail: `${policy.categories.length} category policy record(s); ${constrainedPolicies.length} intentionally use a non-standard commerce mode.`, metric: policy.categories.length, sourceTool: "getCategoryGovernanceIntelligence" },
    { id: "category:empty", kind: "kontamou", label: "Empty branches", detail: `${overview.metrics.emptyCategories} taxonomy branches have no products in their subtree; ${emptyActiveLeaves.length} are active discoverable leaves.`, metric: overview.metrics.emptyCategories, sourceTool: "getCategoryGovernanceIntelligence" }
  ];

  const findings: AdminAssistantFinding[] = [];
  const candidates: RecommendationCandidate[] = [];
  const add = (finding: AdminAssistantFinding, dimensions: RecommendationCandidate["dimensions"]) => {
    findings.push(finding);
    candidates.push({ finding, dimensions });
  };

  if (inactiveWithLive.length) {
    add({
      id: "category-inactive-with-live-products",
      ruleId: "category_inactive_with_live_products",
      severity: "critical",
      category: "catalog",
      title: `${inactiveWithLive.length} inactive category branch(es) still contain live products`,
      detail: "An inactive taxonomy branch and live catalogue content are contradictory operational signals. The products or taxonomy state should be reconciled before relying on navigation or SEO behavior.",
      evidence: inactiveWithLive.slice(0, 6).map((category) => `${category.categoryCode}: ${category.subtreeLiveProducts} live product(s) in subtree`),
      evidenceIds: ["category:taxonomy"],
      recommendation: "Inspect the affected branches and decide whether the category should be active or the live products should be reassigned/suppressed through the normal catalogue workflow.",
      href: "/admin/categories",
      affectedCount: inactiveWithLive.length,
      confidence: "high"
    }, { dataQualityImpact: 10, customerImpact: 8, seoImpact: 8, urgency: 9, effort: 6 });
  }

  if (nonAssignableWithDirect.length) {
    add({
      id: "category-nonassignable-direct-products",
      ruleId: "category_nonassignable_with_direct_products",
      severity: "warning",
      category: "catalog",
      title: `${nonAssignableWithDirect.length} non-assignable category/ies have directly assigned products`,
      detail: "Non-assignable taxonomy nodes are intended to structure the hierarchy, yet these nodes currently carry direct product assignments.",
      evidence: nonAssignableWithDirect.slice(0, 6).map((category) => `${category.categoryCode}: directProducts=${category.directProducts}`),
      evidenceIds: ["category:taxonomy"],
      recommendation: "Review whether those products belong in an assignable child category; do not change the taxonomy role solely to hide the inconsistency.",
      href: "/admin/categories",
      affectedCount: nonAssignableWithDirect.length,
      confidence: "high"
    }, { dataQualityImpact: 9, customerImpact: 6, seoImpact: 6, urgency: 7, effort: 5 });
  }

  if (emptyActiveLeaves.length) {
    add({
      id: "category-empty-active-leaves",
      ruleId: "category_empty_active_leaf",
      severity: "opportunity",
      category: "catalog",
      title: `${emptyActiveLeaves.length} active discoverable leaf category/ies are empty`,
      detail: "These leaves contain no products. Empty categories can be intentional preparation, so this is cleanup/merchandising evidence rather than a defect.",
      evidence: emptyActiveLeaves.slice(0, 8).map((category) => `${category.categoryCode}: ${category.pathLabels.join(" > ")}`),
      evidenceIds: ["category:empty"],
      recommendation: "Review whether each empty leaf is intentionally staged; otherwise hide, consolidate or populate it through the normal taxonomy workflow.",
      href: "/admin/categories",
      affectedCount: emptyActiveLeaves.length,
      confidence: "high"
    }, { dataQualityImpact: 4, customerImpact: 4, seoImpact: 5, urgency: 2, effort: 4, reversibility: 8 });
  }

  return {
    ...base,
    summary: `Categories & Policies: ${overview.metrics.totalCategories} taxonomy categories, ${overview.metrics.totalProducts} canonical products and ${policy.categories.length} commerce-policy records. ${inactiveWithLive.length + nonAssignableWithDirect.length ? `${inactiveWithLive.length + nonAssignableWithDirect.length} objective taxonomy contradiction(s) need attention.` : "No inactive/live or non-assignable/direct-product contradiction was detected."} ${constrainedPolicies.length} non-standard commerce policy/ies are treated as deliberate configuration, not errors.`,
    facts: [
      `${overview.metrics.activeCategories} of ${overview.metrics.totalCategories} taxonomy categories are active.`,
      `${overview.metrics.liveProducts} of ${overview.metrics.totalProducts} canonical products are live in the catalogue overview.`,
      `${policy.categories.length} commerce policy records exist; ${constrainedPolicies.length} are deliberately constrained/non-standard.`,
      `${emptyActiveLeaves.length} active discoverable leaf categories are empty.`
    ],
    evidence,
    findings: mergeFindings(base.findings, findings),
    recommendations: mergeRecommendations(base, candidates)
  };
}

export async function controlledValueIntelligence(
  principal: SessionPrincipal,
  base: AdminAssistantSnapshot
): Promise<AdminAssistantSnapshot> {
  const queue = await adminCatalogueControlledValueQueue(principal).catch(() => undefined);
  if (!queue) return base;

  const totalOccurrences = queue.reduce((sum, item) => sum + item.occurrences, 0);
  const noTarget = queue.filter((item) => item.options.length === 0);
  const singleTarget = queue.filter((item) => item.options.length === 1);
  const ordered = [...queue].sort((a, b) => b.occurrences - a.occurrences);
  const top = ordered.slice(0, 10);
  const topOccurrences = top.reduce((sum, item) => sum + item.occurrences, 0);
  const concentration = totalOccurrences ? Math.round((topOccurrences / totalOccurrences) * 100) : 0;

  const evidence: AdminAssistantEvidence[] = [
    ...(base.evidence ?? []),
    { id: "values:groups", kind: "kontamou", label: "Controlled-value queue", detail: `${queue.length} exact source-value group(s) await review, covering ${totalOccurrences} observations.`, metric: queue.length, sourceTool: "getControlledValueIntelligence" },
    { id: "values:top", kind: "derived", label: "Top-10 concentration", detail: `The 10 highest-frequency groups account for ${topOccurrences} observations (${concentration}% of the current queue).`, metric: concentration, sourceTool: "getControlledValueIntelligence" },
    { id: "values:targets", kind: "kontamou", label: "Canonical target availability", detail: `${noTarget.length} groups have no active canonical target options; ${singleTarget.length} have exactly one allowed target.`, metric: noTarget.length, sourceTool: "getControlledValueIntelligence" }
  ];

  const findings: AdminAssistantFinding[] = [];
  const candidates: RecommendationCandidate[] = [];
  const add = (finding: AdminAssistantFinding, dimensions: RecommendationCandidate["dimensions"]) => {
    findings.push(finding);
    candidates.push({ finding, dimensions });
  };

  if (noTarget.length) {
    add({
      id: "controlled-value-no-target",
      ruleId: "controlled_value_no_target",
      severity: "warning",
      category: "data_quality",
      title: `${noTarget.length} controlled-value group(s) have no active canonical target`,
      detail: "The source attribute is mapped, but these exact enum values currently have no permitted canonical value to approve. Guessing a synonym would bypass the governed value set.",
      evidence: noTarget.slice(0, 6).map((item) => `${item.sourceName} · ${item.sourceAttributeKey} · “${item.sourceValue}” · ${item.occurrences} observations`),
      evidenceIds: ["values:targets"],
      recommendation: "Review the Product Type controlled-value definition first; add/activate a canonical value only when the domain semantics justify it.",
      href: "/admin/catalogue-intake/values",
      affectedCount: noTarget.reduce((sum, item) => sum + item.occurrences, 0),
      confidence: "high"
    }, { dataQualityImpact: 9, customerImpact: 4, seoImpact: 4, urgency: 7, effort: 6 });
  }

  if (queue.length) {
    add({
      id: "controlled-value-high-impact-queue",
      ruleId: "controlled_value_unmapped",
      severity: "opportunity",
      category: "data_quality",
      title: `${queue.length} exact enum value group(s) can be normalized through governed review`,
      detail: `The highest-frequency 10 groups account for ${concentration}% of unresolved controlled-value observations. One approved exact alias can resolve all matching observations in the same source context and future matching values.`,
      evidence: top.slice(0, 6).map((item) => `${item.sourceName} · ${item.sourceAttributeKey} · “${item.sourceValue}”: ${item.occurrences} observations, ${item.options.length} target option(s)`),
      evidenceIds: ["values:groups", "values:top"],
      recommendation: "Start with high-frequency groups that have a semantically obvious permitted target; leave fuzzy synonyms, multienum splitting and unit conversion for explicit governance.",
      href: "/admin/catalogue-intake/values",
      affectedCount: totalOccurrences,
      confidence: "high"
    }, { dataQualityImpact: 9, customerImpact: 5, seoImpact: 4, urgency: 5, effort: 4, reversibility: 5 });
  }

  const highest = ordered[0];
  if (highest) {
    evidence.push({
      id: "values:highest",
      kind: "kontamou",
      label: "Highest-impact source value",
      detail: `${highest.sourceName} · ${highest.sourceAttributeKey} · “${highest.sourceValue}” affects ${highest.occurrences} observation(s) and has ${highest.options.length} allowed target(s).`,
      metric: highest.occurrences,
      sourceTool: "getControlledValueIntelligence"
    });
  }

  return {
    ...base,
    summary: queue.length
      ? `Controlled Values: ${queue.length} exact value group(s) cover ${totalOccurrences} unresolved observations. The top 10 account for ${concentration}%. ${noTarget.length ? `${noTarget.length} group(s) are blocked because no active canonical target exists.` : "Every queued group currently has at least one permitted canonical target."}`
      : "Controlled Values: no exact enum value groups are awaiting review.",
    facts: [
      `${queue.length} controlled-value groups are awaiting review across ${totalOccurrences} observations.`,
      `The top 10 groups account for ${concentration}% of the current queue.`,
      `${noTarget.length} groups have zero allowed canonical targets; ${singleTarget.length} have exactly one.`,
      "Only exact scalar enum aliases are eligible here; fuzzy synonym inference, multienum splitting and unit conversion remain review-required."
    ],
    evidence,
    findings: mergeFindings(base.findings, findings),
    recommendations: mergeRecommendations(base, candidates)
  };
}
