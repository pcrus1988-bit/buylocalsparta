import type { MatchResult, ProductIdentity } from "../catalog/types.ts";

export type CrawlFetchMode = "auto" | "http" | "browser";
export type CrawlMode = "discovery" | "full" | "category" | "single";
export type CrawlDecision = "allow" | "reject";

export type CrawlFetchPolicy = Readonly<{
  allowedHosts: readonly string[];
  allowSubdomains?: boolean;
  allowHttp?: boolean;
  allowedPorts?: readonly number[];
  maxRedirects?: number;
  maxResponseBytes?: number;
}>;

export type CrawlUrlValidation = Readonly<{
  decision: CrawlDecision;
  normalizedUrl?: string;
  hostname?: string;
  reason?: string;
}>;

export type ProductEvidenceOrigin =
  | "json_ld"
  | "microdata"
  | "html"
  | "api"
  | "document"
  | "ai"
  | "manual";

export type ProductFieldEvidence = Readonly<{
  origin: ProductEvidenceOrigin;
  sourceUrl: string;
  confidence: number;
  selector?: string;
  sourcePath?: string;
  note?: string;
}>;

export type ExtractedPrice = Readonly<{
  amountMinor: number;
  currency: string;
  taxInclusive?: boolean;
  kind: "selling" | "rrp" | "promotion" | "catalogue" | "unknown";
  evidence: ProductFieldEvidence;
}>;

export type ExtractedImage = Readonly<{
  url: string;
  alt?: string;
  evidence: ProductFieldEvidence;
}>;

export type ExtractedProductCandidate = Readonly<{
  sourceProductKey: string;
  sourceUrl: string;
  title: string;
  description?: string;
  brand?: string;
  model?: string;
  mpn?: string;
  gtin?: string;
  sku?: string;
  categoryPath?: readonly string[];
  attributes: Readonly<Record<string, string>>;
  variantAttributes?: Readonly<Record<string, string>>;
  prices?: readonly ExtractedPrice[];
  images?: readonly ExtractedImage[];
  fieldEvidence: Readonly<Record<string, ProductFieldEvidence | readonly ProductFieldEvidence[]>>;
  rawPayload?: unknown;
}>;

export type ProductCandidateQualityIssue = Readonly<{
  field?: string;
  code:
    | "missing_title"
    | "missing_source_key"
    | "invalid_gtin"
    | "invalid_price"
    | "invalid_confidence"
    | "missing_provenance";
  message: string;
}>;

export type CanonicalMatchCandidate = Readonly<{
  product: ProductIdentity;
  match: MatchResult;
}>;

export type CanonicalizationPlan = Readonly<{
  disposition: "link_existing" | "review" | "create_canonical";
  canonicalProductId?: string;
  confidence: number;
  reasons: readonly string[];
  candidates: readonly CanonicalMatchCandidate[];
}>;
