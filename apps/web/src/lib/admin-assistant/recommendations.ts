import type { AdminAssistantAction, AdminAssistantConfidence, AdminAssistantFinding, AdminAssistantPriority, AdminAssistantRecommendation } from "./types";

const severityWeight = { info: 8, opportunity: 18, warning: 42, critical: 78 } as const;
const priorityForScore = (score: number): AdminAssistantPriority => score >= 82 ? "critical" : score >= 58 ? "high" : score >= 32 ? "medium" : "low";

function boundedDimension(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10, Math.round(value)));
}

export type RecommendationDimensions = Readonly<{
  financialImpact?: number;
  customerImpact?: number;
  vendorImpact?: number;
  complianceRisk?: number;
  dataQualityImpact?: number;
  seoImpact?: number;
  urgency?: number;
  effort?: number;
  reversibility?: number;
}>;

export type RecommendationCandidate = Readonly<{
  finding: AdminAssistantFinding;
  dimensions?: RecommendationDimensions;
  actions?: readonly AdminAssistantAction[];
  explanation?: string;
  confidence?: AdminAssistantConfidence;
}>;

export function recommendationScore(candidate: RecommendationCandidate): number {
  const d = candidate.dimensions ?? {};
  const impact = boundedDimension(d.financialImpact) * 2.2
    + boundedDimension(d.customerImpact) * 1.8
    + boundedDimension(d.vendorImpact) * 1.2
    + boundedDimension(d.complianceRisk) * 2.6
    + boundedDimension(d.dataQualityImpact) * 1.4
    + boundedDimension(d.seoImpact) * 1.1
    + boundedDimension(d.urgency) * 2.4;
  const scale = Math.min(18, Math.log10(Math.max(1, candidate.finding.affectedCount ?? 1) + 1) * 8);
  const effortPenalty = boundedDimension(d.effort) * 1.25;
  const confidenceFactor = (candidate.confidence ?? candidate.finding.confidence ?? "high") === "high" ? 1 : (candidate.confidence ?? candidate.finding.confidence) === "medium" ? 0.86 : 0.68;
  return Math.max(0, Math.round((severityWeight[candidate.finding.severity] + impact + scale - effortPenalty) * confidenceFactor));
}

export function prioritizeRecommendations(candidates: readonly RecommendationCandidate[], limit = 5): readonly AdminAssistantRecommendation[] {
  return [...candidates]
    .map((candidate) => {
      const score = recommendationScore(candidate);
      const confidence = candidate.confidence ?? candidate.finding.confidence ?? "high";
      return {
        id: `rec:${candidate.finding.id}`,
        title: candidate.finding.title,
        explanation: candidate.explanation ?? candidate.finding.recommendation ?? candidate.finding.detail,
        priority: priorityForScore(score),
        confidence,
        evidenceIds: candidate.finding.evidenceIds ?? [],
        affectedEntities: candidate.finding.affectedEntities ?? [],
        actions: candidate.actions ?? safeFindingActions(candidate.finding),
        dimensions: candidate.dimensions ?? {}
      } satisfies AdminAssistantRecommendation;
    })
    .sort((a, b) => {
      const ap = { critical: 4, high: 3, medium: 2, low: 1 }[a.priority];
      const bp = { critical: 4, high: 3, medium: 2, low: 1 }[b.priority];
      if (ap !== bp) return bp - ap;
      return (b.affectedEntities.length || 0) - (a.affectedEntities.length || 0);
    })
    .slice(0, Math.max(1, Math.min(8, limit)));
}

function safeFindingActions(finding: AdminAssistantFinding): readonly AdminAssistantAction[] {
  if (!finding.href) return [];
  return [{ id: `open:${finding.id}`, kind: "inspect", label: "Inspect", href: finding.href, requiresApproval: false }];
}
