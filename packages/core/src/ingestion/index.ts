export * from "./types.ts";
export * from "./security.ts";
export * from "./canonicalization.ts";
export * from "./discovery.ts";
export * from "./open-icecat/index.ts";

import { analyzeHtmlProductPage as analyzeHtmlProductPageBase, type HtmlProductAnalysis } from "./html-product-extraction.ts";
export type { HtmlProductAnalysis } from "./html-product-extraction.ts";

/**
 * Public HTML extraction entry point.
 *
 * Two conservative guards live here because all crawler consumers use the
 * ingestion facade:
 * - when a modern storefront exposes trustworthy embedded product JSON, do
 *   not emit a second weak page-title fallback candidate for the same page;
 * - category/search/collection pages must remain low-likelihood even when
 *   their URL contains the word "product" (for example /product-category/).
 */
export function analyzeHtmlProductPage(html: string, sourceUrl: string): HtmlProductAnalysis {
  const analysis = analyzeHtmlProductPageBase(html, sourceUrl);
  const embeddedCandidates = analysis.candidates.filter((candidate) => {
    const payload = candidate.rawPayload;
    return Boolean(payload && typeof payload === "object" && !Array.isArray(payload) && (payload as Record<string, unknown>).extractionStrategy === "embedded_json");
  });
  const listingPage = /(?:product-category|collection-template|archive-product|search-results|category-page)/i.test(html)
    || /\/(?:product-category|collections?|category|search)(?:\/|\?|$)/i.test(new URL(sourceUrl).pathname);

  return {
    ...analysis,
    candidates: embeddedCandidates.length ? embeddedCandidates : analysis.candidates,
    productLikelihood: listingPage && analysis.candidates.length === 0
      ? Math.min(analysis.productLikelihood, 0.6)
      : analysis.productLikelihood
  };
}
