export * from "./types.ts";
export * from "./security.ts";
export * from "./canonicalization.ts";
export * from "./discovery.ts";
export * from "./open-icecat/index.ts";

import { extractJsonLdProductCandidates } from "./discovery.ts";
import { analyzeHtmlProductPage as analyzeHtmlProductPageBase, type HtmlProductAnalysis } from "./html-product-extraction.ts";
import type { ExtractedProductCandidate, ProductFieldEvidence } from "./types.ts";
export type { HtmlProductAnalysis } from "./html-product-extraction.ts";

/**
 * Public HTML extraction entry point.
 *
 * Conservative guards live here because all crawler consumers use the
 * ingestion facade:
 * - when a modern storefront exposes trustworthy embedded product JSON, do
 *   not emit a second weak page-title fallback candidate for the same page;
 * - when JSON-LD already describes the product, suppress only anonymous
 *   generic HTML fallbacks from the same canonical page while retaining
 *   identifier-bearing HTML evidence that can safely enrich the structured row;
 * - remove obvious GDPR/newsletter/stock-notification form controls from
 *   product attributes before crawler candidates are merged;
 * - category/search/collection pages must remain low-likelihood even when
 *   their URL contains the word "product" (for example /product-category/).
 */
export function analyzeHtmlProductPage(html: string, sourceUrl: string): HtmlProductAnalysis {
  const analysis = analyzeHtmlProductPageBase(html, sourceUrl);
  const jsonLdCandidates = extractJsonLdProductCandidates(html, sourceUrl);
  const embeddedCandidates = analysis.candidates.filter((candidate) => {
    const payload = candidate.rawPayload;
    return Boolean(payload && typeof payload === "object" && !Array.isArray(payload) && (payload as Record<string, unknown>).extractionStrategy === "embedded_json");
  });
  const baseCandidates = embeddedCandidates.length ? embeddedCandidates : analysis.candidates;
  const candidates = baseCandidates
    .filter((candidate) => !isDominatedAnonymousHtmlFallback(candidate, jsonLdCandidates))
    .map(sanitizeStorefrontUiAttributes);
  const listingPage = /(?:product-category|collection-template|archive-product|search-results|category-page)/i.test(html)
    || /\/(?:product-category|collections?|category|search)(?:\/|\?|$)/i.test(new URL(sourceUrl).pathname);

  return {
    ...analysis,
    candidates,
    productLikelihood: listingPage && candidates.length === 0
      ? Math.min(analysis.productLikelihood, 0.6)
      : analysis.productLikelihood
  };
}

function isDominatedAnonymousHtmlFallback(
  candidate: ExtractedProductCandidate,
  jsonLdCandidates: readonly ExtractedProductCandidate[]
): boolean {
  if (!jsonLdCandidates.length || !isGenericHtmlFallback(candidate)) return false;
  if (candidate.sku?.trim() || candidate.gtin?.trim() || candidate.mpn?.trim() || candidate.model?.trim()) return false;
  const candidateUrl = comparableUrl(candidate.sourceUrl);
  return jsonLdCandidates.some((structured) => comparableUrl(structured.sourceUrl) === candidateUrl);
}

function isGenericHtmlFallback(candidate: ExtractedProductCandidate): boolean {
  const payload = candidate.rawPayload;
  return Boolean(
    payload
      && typeof payload === "object"
      && !Array.isArray(payload)
      && (payload as Record<string, unknown>).extractionStrategy === "html_multi_signal"
  );
}

function sanitizeStorefrontUiAttributes(candidate: ExtractedProductCandidate): ExtractedProductCandidate {
  const attributes = cleanAttributeMap(candidate.attributes);
  const variantAttributes = cleanAttributeMap(candidate.variantAttributes ?? {});
  const removed = new Set<string>([
    ...Object.keys(candidate.attributes).filter((key) => !(key in attributes)),
    ...Object.keys(candidate.variantAttributes ?? {}).filter((key) => !(key in variantAttributes))
  ]);
  if (!removed.size) return candidate;

  const fieldEvidence: Record<string, ProductFieldEvidence | readonly ProductFieldEvidence[]> = { ...candidate.fieldEvidence };
  for (const key of removed) delete fieldEvidence[key];

  return {
    ...candidate,
    attributes,
    variantAttributes: Object.keys(variantAttributes).length ? variantAttributes : undefined,
    fieldEvidence
  };
}

function cleanAttributeMap(values: Readonly<Record<string, string>>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!isStorefrontUiAttribute(key, value)) result[key] = value;
  }
  return result;
}

function isStorefrontUiAttribute(key: string, value: string): boolean {
  const normalizedKey = searchableText(key);
  const normalizedValue = searchableText(value);
  const keyLooksLikeControl = /\b(?:gdpr|privacy|consent|cookie|email|newsletter|subscribe|subscription|notify|notification|quantity|qty)\b/.test(normalizedKey)
    || /(?:αποδοχ|απορρη|ενημερω|ειδοπο)/.test(normalizedKey);
  const valueLooksLikeControl = /(?:privacy policy|cookie policy|newsletter|subscribe|αποδεχομαι|πολιτικ.{0,3}απορρη)/.test(normalizedValue)
    || /^e ?mail:?$/.test(normalizedValue);
  return keyLooksLikeControl || valueLooksLikeControl;
}

function searchableText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[_\W]+/gu, " ")
    .trim();
}

function comparableUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.replace(/^www\./i, "");
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return value.trim().replace(/\/+$/, "");
  }
}
