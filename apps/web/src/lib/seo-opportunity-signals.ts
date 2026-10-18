/**
 * Read-only, conservative prioritization of privacy-sanitized Search Console
 * aggregate queries. An opportunity here is NOT proof of untapped demand:
 * competitor difficulty, intent and landing-page mapping require human review.
 *
 * No speculative search volume, predicted clicks, or automatic SEO mutations.
 */
export type SeoQuerySignal = Readonly<{
  key: string;
  clicks: number;
  impressions: number;
  ctr: number; // Fraction 0..1, as persisted by the existing GSC sync.
  position: number;
}>;

export type SeoKeywordOpportunity = SeoQuerySignal & Readonly<{
  kind: "striking_distance" | "snippet_review";
  priorityScore: number; // A sorting heuristic, NOT traffic or revenue.
  recommendedAction: string;
}>;

// The phrase "καταστήματα κοντά μου" is a generic local-shopping query,
// not evidence that a person searched for the KONTA MOY brand.
const OWN_BRAND_LATIN = /(?:kontamou|konta[\s-]*mou|buy[\s-]*local[\s-]*sparta)/iu;
const OWN_BRAND_GREEK = /^(?:κοντά[\s-]*μου|κοντα[\s-]*μου)(?:\s+(?:marketplace|πλατφόρμα|eshop|e-shop))?$/iu;

export function isOwnBrandQuery(query: string): boolean {
  const normalized = query.trim();
  return OWN_BRAND_LATIN.test(normalized) || OWN_BRAND_GREEK.test(normalized);
}

export function rankSeoKeywordOpportunities(
  rows: readonly SeoQuerySignal[],
  limit = 20
): SeoKeywordOpportunity[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];

  const candidates: SeoKeywordOpportunity[] = [];
  for (const row of rows) {
    const query = row.key?.trim();
    if (!query || isOwnBrandQuery(query)) continue;
    if (![row.clicks, row.impressions, row.ctr, row.position].every(Number.isFinite)) continue;
    if (row.impressions < 20 || row.clicks < 0 || row.position < 1 || row.position > 30) continue;
    if (row.ctr < 0 || row.ctr > 1) continue;

    // Positions and CTR are property averages; don't treat them as deterministic
    // ranking benchmarks or promise a particular CTR uplift.
    const isSnippetReview = row.position <= 10 && row.impressions >= 50 && row.ctr < 0.02;
    const isStrikingDistance = row.position >= 4 && row.position <= 20;
    if (!isSnippetReview && !isStrikingDistance) continue;

    const kind = isSnippetReview ? "snippet_review" : "striking_distance";
    const recommendedAction = kind === "snippet_review"
      ? "Check matching landing page, search intent, title and description before changing snippets."
      : "Identify the matching indexable page, verify actual product/location relevance, improve useful content and add contextual internal links.";

    // Priority only orders evidence-backed candidates in the same GSC window.
    const priorityScore = Math.round(
      Math.log2(row.impressions + 1) * 10
      * (kind === "snippet_review" ? 1.2 : 1)
      / (1 + Math.max(0, row.position - 8) / 12)
    );

    candidates.push({ ...row, key: query, kind, priorityScore, recommendedAction });
  }

  return candidates
    .sort((a, b) => b.priorityScore - a.priorityScore || b.impressions - a.impressions || a.key.localeCompare(b.key, "el"))
    .slice(0, Math.floor(limit));
}

export function researchCensusSearchExposure(rows: readonly SeoQuerySignal[]) {
  const matching = rows.filter((row) => /^\/vendor\/vendor_research_census_[^/]+$/u.test(row.key));
  return {
    pages: matching.length,
    impressions: matching.reduce((sum, row) => sum + row.impressions, 0),
    clicks: matching.reduce((sum, row) => sum + row.clicks, 0)
  };
}
