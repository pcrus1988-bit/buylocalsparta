import { municipalityProposalRisks } from "./hub-gemi-municipality-risk.ts";

/**
 * Owner-authorized *administrative name correspondence* review only.
 * This does not attest a physical business address, consent or SEO publication.
 * The actor in the immutable audit trail must always be an AUTOMATION actor.
 */
export const GEMI_AUTO_REVIEW_ACTOR = "automation:owner-authorized:20261012";

export type MunicipalityAutoReviewCandidate = Readonly<{
  municipalityId: string;
  sourceId: string;
  sourceName: string;
  reviewStatus: string;
  matchMethod: string;
  sourceRegion: string | null;
  hubRegionCode: string | null;
  centroidDistanceKm: number | string | null;
  sourceMatchCount: number;
  hubId: string | null;
  hubSlug: string | null;
}>;

// A geodesic line can cross water between otherwise proximate islands and
// mainland hubs. These municipality names had ambiguous HUB destinations in
// the October 2026 audit. Keep them for individual geographic adjudication.
const ISLAND_CROSSING_REVIEW = new Set(["Spetses", "Agkistri", "Agathonisi"]);

export function municipalityAutoReviewReason(candidate: MunicipalityAutoReviewCandidate): string | undefined {
  if (candidate.reviewStatus !== "proposed") return undefined;
  if (candidate.matchMethod !== "unique_exact_transliteration" &&
      candidate.matchMethod !== "normalized_genitive_variant") return undefined;
  if (!/^[1-9][0-9]{3,5}$/.test(candidate.municipalityId) ||
      !/^GR[0-9]{4}M[0-9]{3}$/.test(candidate.sourceId)) return undefined;
  if (!candidate.hubId || !/^KM-HUB-[0-9]{3}$/.test(candidate.hubId) ||
      !candidate.hubSlug || !/^[a-z0-9-]{2,80}$/.test(candidate.hubSlug)) return undefined;
  if (candidate.sourceMatchCount !== 1) return undefined;
  if (ISLAND_CROSSING_REVIEW.has(candidate.sourceName)) return undefined;
  if (municipalityProposalRisks(candidate).length !== 0) return undefined;
  return "OWNER-AUTHORIZED AUTOMATED ADMINISTRATIVE NAME CORRESPONDENCE ONLY: " +
    (candidate.matchMethod === "unique_exact_transliteration"
      ? "unique exact transliteration"
      : "unique normalized Greek genitive form") +
    "; region code matches the source and municipality centroid is within 25 km. " +
    "NOT proof of any business premise, landmass/25 km coverage, owner authorization, " +
    "privacy review, consent or permission for public directory publication.";
}
