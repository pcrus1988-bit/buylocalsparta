import { matchProducts } from "../catalog/matching.ts";
import type { ProductIdentity } from "../catalog/types.ts";
import type {
  CanonicalizationPlan,
  ExtractedProductCandidate,
  ProductCandidateQualityIssue
} from "./types.ts";

export function normalizeGtin(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().replace(/[\s-]+/g, "");
  if (!/^\d+$/.test(normalized) || ![8, 12, 13, 14].includes(normalized.length)) return undefined;

  const digits = [...normalized].map(Number);
  const suppliedCheckDigit = digits.pop();
  if (suppliedCheckDigit === undefined) return undefined;

  let sum = 0;
  let weight = 3;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += digits[index] * weight;
    weight = weight === 3 ? 1 : 3;
  }
  const expected = (10 - (sum % 10)) % 10;
  return suppliedCheckDigit === expected ? normalized : undefined;
}

export function validateExtractedProductCandidate(
  candidate: ExtractedProductCandidate
): Readonly<{ valid: boolean; normalizedGtin?: string; issues: readonly ProductCandidateQualityIssue[] }> {
  const issues: ProductCandidateQualityIssue[] = [];

  if (!candidate.sourceProductKey.trim()) {
    issues.push({ field: "sourceProductKey", code: "missing_source_key", message: "Source product key is required" });
  }
  if (!candidate.title.trim()) {
    issues.push({ field: "title", code: "missing_title", message: "Product title is required" });
  }

  const normalizedGtin = normalizeGtin(candidate.gtin);
  if (candidate.gtin && !normalizedGtin) {
    issues.push({ field: "gtin", code: "invalid_gtin", message: "GTIN failed GS1 length/check-digit validation" });
  }

  for (const price of candidate.prices ?? []) {
    if (!Number.isSafeInteger(price.amountMinor) || price.amountMinor < 0 || !/^[A-Z]{3}$/.test(price.currency)) {
      issues.push({ field: "prices", code: "invalid_price", message: "Prices require non-negative integer minor units and ISO-style currency codes" });
    }
    if (!validConfidence(price.evidence.confidence)) {
      issues.push({ field: "prices", code: "invalid_confidence", message: "Price evidence confidence must be between 0 and 1" });
    }
    if (!price.evidence.sourceUrl.trim()) {
      issues.push({ field: "prices", code: "missing_provenance", message: "Price evidence requires a source URL" });
    }
  }

  for (const [field, evidence] of Object.entries(candidate.fieldEvidence)) {
    const entries = Array.isArray(evidence) ? evidence : [evidence];
    if (!entries.length || entries.some((item) => !item.sourceUrl.trim())) {
      issues.push({ field, code: "missing_provenance", message: `${field} requires source provenance` });
    }
    if (entries.some((item) => !validConfidence(item.confidence))) {
      issues.push({ field, code: "invalid_confidence", message: `${field} evidence confidence must be between 0 and 1` });
    }
  }

  return { valid: issues.length === 0, normalizedGtin, issues };
}

export function planCanonicalization(
  source: ProductIdentity,
  existing: readonly ProductIdentity[]
): CanonicalizationPlan {
  const candidates = existing
    .map((product) => ({ product, match: matchProducts(source, product) }))
    .filter(({ match }) => match.level !== "different")
    .sort((a, b) => b.match.confidence - a.match.confidence || a.product.id.localeCompare(b.product.id));

  const autoMergeCandidates = candidates.filter(({ match }) => match.autoMergeAllowed);
  if (autoMergeCandidates.length === 1) {
    const winner = autoMergeCandidates[0];
    return {
      disposition: "link_existing",
      canonicalProductId: winner.product.id,
      confidence: winner.match.confidence,
      reasons: winner.match.reasons,
      candidates
    };
  }

  if (autoMergeCandidates.length > 1) {
    const top = autoMergeCandidates[0];
    return {
      disposition: "review",
      confidence: top.match.confidence,
      reasons: ["Multiple canonical products satisfy automatic matching rules", ...top.match.reasons],
      candidates
    };
  }

  if (candidates.length) {
    const top = candidates[0];
    return {
      disposition: "review",
      confidence: top.match.confidence,
      reasons: top.match.reasons,
      candidates
    };
  }

  return {
    disposition: "create_canonical",
    confidence: 1,
    reasons: ["No existing canonical product has a plausible identity match"],
    candidates: []
  };
}

function validConfidence(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}
