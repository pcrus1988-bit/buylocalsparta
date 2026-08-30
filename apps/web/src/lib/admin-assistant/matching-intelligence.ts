import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminMatchingWorkspace } from "../admin-runtime";
import { prioritizeRecommendations, type RecommendationCandidate } from "./recommendations";
import type { AdminAssistantEvidence, AdminAssistantFinding, AdminAssistantSnapshot } from "./types";

const actionableSubmissionStates = new Set(["submitted", "needs_review"]);
const actionableCandidateStates = new Set(["pending", "auto_linked"]);
const offerReadyStates = new Set(["linked", "approved"]);
const HIGH_CONFIDENCE = 0.85;
const LOW_AUTOLINK_CONFIDENCE = 0.9;
const AMBIGUITY_DELTA = 0.08;

function mergeFindings(base: readonly AdminAssistantFinding[], extra: readonly AdminAssistantFinding[]): readonly AdminAssistantFinding[] {
  const rank = { critical: 0, warning: 1, opportunity: 2, info: 3 } as const;
  const byId = new Map<string, AdminAssistantFinding>();
  for (const item of [...extra, ...base]) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 10);
}

export async function productMatchingIntelligence(
  principal: SessionPrincipal,
  base: AdminAssistantSnapshot
): Promise<AdminAssistantSnapshot> {
  const data = await adminMatchingWorkspace(principal).catch(() => undefined);
  if (!data) return base;

  const submissions = data.submissions;
  const selectedId = base.context.filters.submission;
  const selected = selectedId ? submissions.find((item) => item.id === selectedId) : undefined;
  const reviewQueue = submissions.filter((item) => actionableSubmissionStates.has(item.status));
  const unlinkedReview = reviewQueue.filter((item) => !item.canonicalVariantId);
  const linkedReady = submissions.filter((item) => Boolean(item.canonicalVariantId) && offerReadyStates.has(item.status));
  const unresolvedCandidates = submissions.flatMap((submission) => submission.candidates
    .filter((candidate) => actionableCandidateStates.has(candidate.status))
    .map((candidate) => ({ submission, candidate })));

  const ambiguous = submissions.flatMap((submission) => {
    const candidates = submission.candidates
      .filter((candidate) => actionableCandidateStates.has(candidate.status))
      .sort((a, b) => b.confidence - a.confidence);
    if (candidates.length < 2) return [];
    const first = candidates[0];
    const second = candidates[1];
    if (!first || !second || first.canonicalVariantId === second.canonicalVariantId) return [];
    return first.confidence - second.confidence <= AMBIGUITY_DELTA ? [{ submission, first, second }] : [];
  });

  const duplicateRisk = submissions.flatMap((submission) => {
    const high = submission.candidates.filter((candidate) => actionableCandidateStates.has(candidate.status) && candidate.confidence >= HIGH_CONFIDENCE);
    const variants = new Set(high.map((candidate) => candidate.canonicalVariantId));
    return variants.size > 1 ? [{ submission, high }] : [];
  });

  const lowConfidenceAutoLinks = submissions.flatMap((submission) => submission.candidates
    .filter((candidate) => candidate.status === "auto_linked" && candidate.confidence < LOW_AUTOLINK_CONFIDENCE)
    .map((candidate) => ({ submission, candidate })));

  const evidence: AdminAssistantEvidence[] = [
    ...(base.evidence ?? []),
    { id: "matching:submissions", kind: "kontamou", label: "Matching submissions", detail: `${submissions.length.toLocaleString("el-GR")} source product submissions are visible in the matching workspace.`, metric: submissions.length, sourceTool: "getProductMatchingIntelligence" },
    { id: "matching:review", kind: "kontamou", label: "Needs review", detail: `${reviewQueue.length.toLocaleString("el-GR")} submissions remain in submitted/needs_review states; ${unlinkedReview.length.toLocaleString("el-GR")} have no canonical variant assigned.`, metric: reviewQueue.length, sourceTool: "getProductMatchingIntelligence" },
    { id: "matching:candidates", kind: "kontamou", label: "Candidate decisions", detail: `${unresolvedCandidates.length.toLocaleString("el-GR")} candidate match decisions are pending or auto-linked and still reviewable.`, metric: unresolvedCandidates.length, sourceTool: "getProductMatchingIntelligence" },
    { id: "matching:ready", kind: "kontamou", label: "Offer-ready links", detail: `${linkedReady.length.toLocaleString("el-GR")} linked submissions are in linked/approved lifecycle states.`, metric: linkedReady.length, sourceTool: "getProductMatchingIntelligence" }
  ];

  const findings: AdminAssistantFinding[] = [];
  const candidates: RecommendationCandidate[] = [];
  const add = (finding: AdminAssistantFinding, dimensions: RecommendationCandidate["dimensions"]) => {
    findings.push(finding);
    candidates.push({ finding, dimensions });
  };

  if (duplicateRisk.length) {
    add({
      id: "matching-high-confidence-duplicate-risk",
      ruleId: "canonical_conflict",
      severity: "critical",
      category: "catalog",
      title: `${duplicateRisk.length} submission(s) have multiple high-confidence canonical candidates`,
      detail: "More than one different canonical variant exceeds the high-confidence threshold for these source products. Automatically choosing one risks duplicate/canonical corruption.",
      evidence: duplicateRisk.slice(0, 5).map(({ submission, high }) => `${submission.id}: ${high.map((candidate) => `${candidate.canonicalVariantId} ${(candidate.confidence * 100).toFixed(0)}%`).join(" vs ")}`),
      evidenceIds: ["matching:candidates"],
      recommendation: "Review identifiers and candidate evidence manually; do not create a new canonical variant or approve an automatic link until the conflict is resolved.",
      href: "/admin/matching",
      affectedCount: duplicateRisk.length,
      confidence: "high"
    }, { dataQualityImpact: 10, customerImpact: 7, seoImpact: 7, vendorImpact: 6, urgency: 9, effort: 5 });
  }

  if (ambiguous.length) {
    add({
      id: "matching-close-candidate-scores",
      ruleId: "canonical_candidate_ambiguity",
      severity: "warning",
      category: "catalog",
      title: `${ambiguous.length} submission(s) have nearly tied canonical candidates`,
      detail: `The top two actionable candidates differ by at most ${Math.round(AMBIGUITY_DELTA * 100)} confidence points, so score alone is not strong enough evidence for an automatic decision.`,
      evidence: ambiguous.slice(0, 5).map(({ submission, first, second }) => `${submission.id}: ${first.canonicalVariantId} ${(first.confidence * 100).toFixed(0)}% vs ${second.canonicalVariantId} ${(second.confidence * 100).toFixed(0)}%`),
      evidenceIds: ["matching:candidates"],
      recommendation: "Compare identifiers/category/source evidence before approving either candidate.",
      href: "/admin/matching",
      affectedCount: ambiguous.length,
      confidence: "high"
    }, { dataQualityImpact: 9, vendorImpact: 5, seoImpact: 5, urgency: 7, effort: 4 });
  }

  if (lowConfidenceAutoLinks.length) {
    add({
      id: "matching-low-confidence-auto-links",
      ruleId: "canonical_low_confidence_auto_link",
      severity: "warning",
      category: "catalog",
      title: `${lowConfidenceAutoLinks.length} auto-linked candidate(s) are below 90% confidence`,
      detail: "These candidates entered auto_linked state but remain below the conservative review threshold used by the assistant.",
      evidence: lowConfidenceAutoLinks.slice(0, 5).map(({ submission, candidate }) => `${submission.id} → ${candidate.canonicalVariantId}: ${(candidate.confidence * 100).toFixed(0)}%`),
      evidenceIds: ["matching:candidates"],
      recommendation: "Review these auto-links before offer approval, prioritizing identifier and category agreement over confidence score alone.",
      href: "/admin/matching",
      affectedCount: lowConfidenceAutoLinks.length,
      confidence: "high"
    }, { dataQualityImpact: 8, vendorImpact: 6, customerImpact: 5, urgency: 7, effort: 4 });
  }

  if (unlinkedReview.length) {
    add({
      id: "matching-unlinked-review-queue",
      ruleId: "product_unlinked_canonical",
      severity: "warning",
      category: "catalog",
      title: `${unlinkedReview.length} review submission(s) remain unlinked to a canonical variant`,
      detail: "These source products cannot become normal linked offers until the canonical relationship is resolved.",
      evidence: unlinkedReview.slice(0, 5).map((submission) => `${submission.id}: ${submission.title} · ${submission.vendorId} · ${submission.categoryCode}`),
      evidenceIds: ["matching:review"],
      recommendation: "Resolve strong existing candidates first; create a new canonical variant only when the evidence supports that the product is genuinely new.",
      href: "/admin/matching",
      affectedCount: unlinkedReview.length,
      confidence: "high"
    }, { dataQualityImpact: 8, vendorImpact: 7, customerImpact: 4, seoImpact: 5, urgency: 6, effort: 6 });
  }

  if (selected) {
    const actionable = selected.candidates.filter((candidate) => actionableCandidateStates.has(candidate.status)).sort((a, b) => b.confidence - a.confidence);
    const selectedEvidenceId = `matching:selected:${selected.id}`;
    evidence.push({
      id: selectedEvidenceId,
      kind: "kontamou",
      label: `Selected product: ${selected.title}`,
      detail: `${selected.id} · vendor ${selected.vendorId} · category ${selected.categoryCode} · status ${selected.status} · canonical ${selected.canonicalVariantId ?? "unlinked"} · ${selected.candidates.length} candidate(s).`,
      metric: selected.id,
      sourceTool: "getProductMatchingIntelligence"
    });

    if (!selected.canonicalVariantId && selected.candidates.length === 0 && actionableSubmissionStates.has(selected.status)) {
      add({
        id: `matching-selected-no-candidate-${selected.id}`,
        ruleId: "product_no_canonical_candidate",
        severity: "opportunity",
        category: "catalog",
        title: `${selected.title} has no canonical candidate`,
        detail: "The selected source product is unlinked and the matching runtime has not produced any candidate. This may be a genuinely new canonical product, but absence of a candidate is not proof by itself.",
        evidence: [`submission = ${selected.id}`, `vendor = ${selected.vendorId}`, `category = ${selected.categoryCode}`, "candidates = 0"],
        evidenceIds: [selectedEvidenceId],
        recommendation: "Verify identifiers and product identity before using Create canonical.",
        href: `/admin/matching?submission=${encodeURIComponent(selected.id)}`,
        affectedCount: 1,
        confidence: "high"
      }, { dataQualityImpact: 7, vendorImpact: 6, seoImpact: 5, urgency: 4, effort: 6, reversibility: 3 });
    }

    if (selected.canonicalVariantId && !offerReadyStates.has(selected.status)) {
      add({
        id: `matching-selected-linked-not-ready-${selected.id}`,
        ruleId: "canonical_link_not_offer_ready",
        severity: "warning",
        category: "catalog",
        title: `${selected.title} is linked but not offer-ready`,
        detail: `The selected submission points to ${selected.canonicalVariantId}, but its lifecycle state is ${selected.status}; linkage and offer approval are separate governance steps.`,
        evidence: [`canonicalVariantId = ${selected.canonicalVariantId}`, `submissionStatus = ${selected.status}`],
        evidenceIds: [selectedEvidenceId],
        recommendation: "Review the matching decision and remaining lifecycle gate before approving the offer.",
        href: `/admin/matching?submission=${encodeURIComponent(selected.id)}`,
        affectedCount: 1,
        confidence: "high"
      }, { dataQualityImpact: 7, vendorImpact: 7, customerImpact: 4, urgency: 6, effort: 3 });
    }

    if (actionable.length) {
      const top = actionable[0];
      evidence.push({
        id: `matching:selected-top:${selected.id}`,
        kind: "derived",
        label: "Leading candidate",
        detail: `${top?.canonicalVariantId} · ${top?.level} · ${Math.round((top?.confidence ?? 0) * 100)}% confidence · ${top?.status}.`,
        metric: top?.confidence ?? 0,
        sourceTool: "getProductMatchingIntelligence"
      });
    }
  }

  const recommendations = prioritizeRecommendations(candidates, 5);
  const summary = selected
    ? `Product Matching: ${selected.title} (${selected.id}) is ${selected.status}, ${selected.canonicalVariantId ? `linked to ${selected.canonicalVariantId}` : "not linked to a canonical variant"}, with ${selected.candidates.length} candidate(s). Queue-wide: ${reviewQueue.length} submissions need review and ${unresolvedCandidates.length} candidate decisions remain.`
    : `Product Matching: ${submissions.length} submissions, ${reviewQueue.length} needing review, ${unlinkedReview.length} review items still unlinked, and ${unresolvedCandidates.length} actionable candidate decisions. ${duplicateRisk.length + ambiguous.length ? `${duplicateRisk.length} high-confidence conflict(s) and ${ambiguous.length} close-score ambiguity/ies need careful review.` : "No queue-wide high-confidence conflict crossed the current deterministic thresholds."}`;

  return {
    ...base,
    summary,
    facts: [
      `${submissions.length} source submissions are visible in Product Matching.`,
      `${reviewQueue.length} need review; ${unlinkedReview.length} of those are unlinked.`,
      `${unresolvedCandidates.length} candidate decisions remain pending or auto-linked.`,
      `${linkedReady.length} linked submissions are in linked/approved offer-review states.`,
      ...(selected ? [`Selected: ${selected.title} · ${selected.status} · canonical ${selected.canonicalVariantId ?? "unlinked"}.`] : [])
    ].slice(0, 6),
    evidence,
    findings: mergeFindings(base.findings, findings),
    recommendations: [...recommendations, ...(base.recommendations ?? []).filter((existing) => !recommendations.some((item) => item.id === existing.id))].slice(0, 5)
  };
}
