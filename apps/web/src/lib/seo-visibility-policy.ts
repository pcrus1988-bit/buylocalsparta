import type { PublicVendorDirectoryEntry } from "./public-vendor-directory.ts";
import { isPublicCatalogueTitle } from "./public-data-integrity.ts";

export type SeoVisibilityClass =
  | "PUBLIC_INDEXABLE"
  | "PUBLIC_NOINDEX"
  | "AUTHENTICATED_PRIVATE"
  | "INTERNAL_SYSTEM";

export type SeoRoutePolicy = Readonly<{
  id: string;
  label: string;
  match: (pathname: string) => boolean;
  visibility: SeoVisibilityClass;
  sitemapEligible: boolean;
  reason: string;
}>;

const exact = (value: string) => (pathname: string) => pathname === value;
const prefix = (value: string) => (pathname: string) => pathname === value || pathname.startsWith(`${value}/`);

// `/vendor/[id]` is intentionally a public merchant-profile namespace while the
// named vendor workspace paths below are private. Keep this explicit until a future
// route migration is deliberately planned and regression-tested.
export const PRIVATE_VENDOR_WORKSPACE_PREFIXES = [
  "/vendor/login",
  "/vendor/advice",
  "/vendor/analytics",
  "/vendor/catalog",
  "/vendor/daily-access",
  "/vendor/finance",
  "/vendor/notifications",
  "/vendor/orders",
  "/vendor/pickup",
  "/vendor/reports",
  "/vendor/returns",
  "/vendor/shipping",
  "/vendor/storefront",
  "/vendor/trust"
] as const;

export const PUBLIC_NOINDEX_PATHS = [
  "/cart",
  "/checkout",
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/join/apply"
] as const;

export const SEO_ROUTE_POLICIES: ReadonlyArray<SeoRoutePolicy> = [
  {
    id: "internal-api",
    label: "Internal/API routes",
    match: prefix("/api"),
    visibility: "INTERNAL_SYSTEM",
    sitemapEligible: false,
    reason: "API/system routes are not public HTML search documents. Public media is a crawler exception, not an indexable page."
  },
  {
    id: "admin",
    label: "Admin workspace",
    match: prefix("/admin"),
    visibility: "AUTHENTICATED_PRIVATE",
    sitemapEligible: false,
    reason: "Administrative data requires an authenticated platform role and must never become a search result."
  },
  {
    id: "account",
    label: "Customer account",
    match: prefix("/account"),
    visibility: "AUTHENTICATED_PRIVATE",
    sitemapEligible: false,
    reason: "Customer-specific account and order data requires the owning customer session."
  },
  {
    id: "daily",
    label: "Daily/staff workspace",
    match: prefix("/daily"),
    visibility: "AUTHENTICATED_PRIVATE",
    sitemapEligible: false,
    reason: "Operational staff surfaces are authenticated and excluded from search."
  },
  ...PRIVATE_VENDOR_WORKSPACE_PREFIXES.map((value): SeoRoutePolicy => ({
    id: `vendor-private:${value}`,
    label: `Private vendor workspace ${value}`,
    match: prefix(value),
    visibility: "AUTHENTICATED_PRIVATE",
    sitemapEligible: false,
    reason: "Vendor backoffice route. The separate /vendor/[id] public profile namespace remains public."
  })),
  ...PUBLIC_NOINDEX_PATHS.map((value): SeoRoutePolicy => ({
    id: `public-noindex:${value}`,
    label: `Public utility ${value}`,
    match: value === "/checkout" ? prefix(value) : exact(value),
    visibility: "PUBLIC_NOINDEX",
    sitemapEligible: false,
    reason: "Human-accessible utility/transaction page with no independent organic-search value."
  })),
  {
    id: "public-vendor-profile",
    label: "Public vendor profile",
    match: (pathname) => /^\/vendor\/[^/]+$/.test(pathname),
    visibility: "PUBLIC_INDEXABLE",
    sitemapEligible: true,
    reason: "Public merchant/local-business dossier; entity-level quality policy decides final index eligibility."
  },
  {
    id: "public-product",
    label: "Public product",
    match: (pathname) => /^\/product\/[^/]+$/.test(pathname),
    visibility: "PUBLIC_INDEXABLE",
    sitemapEligible: true,
    reason: "Approved public canonical product. Product admission checks remain authoritative."
  },
  {
    id: "public-category",
    label: "Public category",
    match: (pathname) => /^\/category\/[^/]+$/.test(pathname),
    visibility: "PUBLIC_INDEXABLE",
    sitemapEligible: true,
    reason: "Curated marketplace category landing page."
  },
  {
    id: "public-default",
    label: "Public site",
    match: () => true,
    visibility: "PUBLIC_INDEXABLE",
    sitemapEligible: true,
    reason: "Default public-site policy; sitemap admission remains explicit rather than automatic."
  }
];

export function seoVisibilityForPath(pathname: string): SeoRoutePolicy {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return SEO_ROUTE_POLICIES.find((policy) => policy.match(normalized)) ?? SEO_ROUTE_POLICIES[SEO_ROUTE_POLICIES.length - 1];
}

export type ResearchVendorIndexEligibility = Readonly<{
  eligible: boolean;
  score: number;
  minimumScore: number;
  reasons: readonly string[];
  blockingReasons: readonly string[];
}>;

export type ProductIndexCandidate = Readonly<{
  title: string;
  categoryCode: string;
  description?: string;
  brand?: string;
  gtin?: string;
  mpn?: string;
  mediaId?: string;
  sourceImageAvailable?: boolean;
  offerAvailable?: boolean;
  color?: string;
  sizes?: readonly string[];
  duplicateTitleCount?: number;
}>;

export type ProductIndexEligibility = Readonly<{
  eligible: boolean;
  score: number;
  minimumScore: number;
  reasons: readonly string[];
  blockingReasons: readonly string[];
}>;

export const DEFAULT_RESEARCH_VENDOR_INDEX_SCORE = 5;
export type ResearchVendorIndexPolicy = Readonly<{
  enabled?: boolean;
  minimumScore?: number;
}>;
const PLACEHOLDER_NAME_PATTERN = /^(unknown|unnamed|χωρίς όνομα|χωρις ονομα|n\/a|test|demo)$/i;
const CLOSED_STATUS_PATTERN = /(permanently[_ -]?closed|closed|inactive|out[_ -]?of[_ -]?scope|κλειστ|έκλεισ)/i;

function usefulText(value: string | undefined, minimum = 2): boolean {
  return Boolean(value && value.trim().length >= minimum);
}

/**
 * Model C quality gate for research-vendor local SEO.
 *
 * The public directory already enforces public_directory_visible at the database
 * boundary. This function only decides whether a visible research record is strong
 * enough to be actively indexed/sitemapped. It intentionally does not invent data.
 * Production research rows expose their linked source evidence; automatic indexing
 * additionally requires corroboration from at least two distinct source types.
 * That corroboration requirement is intentionally not a hard entity blocker so a
 * deliberate governed admin override can still opt in a reviewed dossier.
 */
export function researchVendorIndexEligibility(vendor: PublicVendorDirectoryEntry, policy: ResearchVendorIndexPolicy = {}): ResearchVendorIndexEligibility {
  if (vendor.directoryStatus !== "research") {
    return { eligible: true, score: 100, minimumScore: 0, reasons: ["active partner profile"], blockingReasons: [] };
  }

  const minimumScore = Number.isSafeInteger(policy.minimumScore) && Number(policy.minimumScore) >= 3 && Number(policy.minimumScore) <= 7
    ? Number(policy.minimumScore)
    : DEFAULT_RESEARCH_VENDOR_INDEX_SCORE;
  let score = 0;
  const reasons: string[] = [];
  const blockingReasons: string[] = [];
  if (policy.enabled === false) blockingReasons.push("research-vendor indexing disabled by global policy");
  const name = vendor.name?.trim();

  if (usefulText(name, 3) && !PLACEHOLDER_NAME_PATTERN.test(name)) {
    score += 2;
    reasons.push("meaningful business name");
  } else {
    blockingReasons.push("missing or placeholder business name");
  }

  if (vendor.location?.addressLine1 && vendor.location.locality && vendor.location.postcode) {
    score += 2;
    reasons.push("usable local address");
  } else {
    blockingReasons.push("incomplete local address");
  }

  if (vendor.taxonomies.length > 0 || usefulText(vendor.researchCategory)) {
    score += 1;
    reasons.push("business/category classification");
  } else {
    blockingReasons.push("missing business/category classification");
  }

  if (usefulText(vendor.location?.phone) || usefulText(vendor.location?.publicEmail) || usefulText(vendor.research?.onlineShopUrl) || usefulText(vendor.research?.directoryProfileUrl)) {
    score += 1;
    reasons.push("public discovery/contact signal");
  }

  if (usefulText(vendor.research?.checkedAt)) {
    score += 1;
    reasons.push("research freshness signal");
  }

  const statusText = [vendor.research?.storefrontStatus, vendor.research?.marketplaceScope].filter(Boolean).join(" ");
  if (statusText && CLOSED_STATUS_PATTERN.test(statusText)) blockingReasons.push("record indicates closed/inactive/out-of-scope status");

  // Older synthetic fixtures predate evidence metadata. Production DB-backed
  // research entries always supply sourceTypes/sourceCount through the public
  // vendor projection, so only those real records are subject to corroboration.
  const hasEvidenceMetadata = Array.isArray(vendor.research?.sourceTypes) || typeof vendor.research?.sourceCount === "number";
  const distinctSourceTypes = new Set(
    (vendor.research?.sourceTypes ?? [])
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const independentlyCorroborated = !hasEvidenceMetadata || distinctSourceTypes.size >= 2;
  if (hasEvidenceMetadata) {
    if (independentlyCorroborated) reasons.push("corroborated by multiple independent source types");
    else reasons.push("requires an additional independent research source before automatic indexing");
  }

  return {
    eligible: blockingReasons.length === 0 && independentlyCorroborated && score >= minimumScore,
    score,
    minimumScore,
    reasons,
    blockingReasons
  };
}

export function vendorIndexEligible(vendor: PublicVendorDirectoryEntry, policy: ResearchVendorIndexPolicy = {}): boolean {
  return vendor.directoryStatus === "partner" || researchVendorIndexEligibility(vendor, policy).eligible;
}

export const DEFAULT_PRODUCT_INDEX_SCORE = 5;

/**
 * Search-quality gate layered above the existing public canonical admission rule.
 * Suppressed, recalled, inactive and otherwise unsafe products never reach this
 * function. An approved platform image or a source image admitted through an
 * approved source-product link is a hard requirement for organic promotion.
 * Products also need a currently sellable local offer; unavailable catalog records
 * remain human-readable but are not promoted into search or the sitemap.
 */
export function productIndexEligibility(
  product: ProductIndexCandidate,
  policy: Readonly<{ minimumScore?: number }> = {}
): ProductIndexEligibility {
  const minimumScore = Number.isSafeInteger(policy.minimumScore) && Number(policy.minimumScore) >= 4 && Number(policy.minimumScore) <= 7
    ? Number(policy.minimumScore)
    : DEFAULT_PRODUCT_INDEX_SCORE;
  let score = 0;
  const reasons: string[] = [];
  const blockingReasons: string[] = [];
  const title = product.title.trim();
  const hasDescription = usefulText(product.description, 60);
  const hasApprovedMedia = usefulText(product.mediaId, 8);
  const hasTrustedSourceImage = product.sourceImageAvailable === true;
  const hasImage = hasApprovedMedia || hasTrustedSourceImage;
  const hasIdentity = usefulText(product.gtin, 8) || usefulText(product.mpn, 2) || usefulText(product.brand, 2);
  const hasStrongDifferentiator = usefulText(product.gtin, 8) || usefulText(product.mpn, 2) || usefulText(product.color, 2) || Boolean(product.sizes?.some((size) => usefulText(size, 1)));

  if (isPublicCatalogueTitle(title)) {
    score += 2;
    reasons.push("meaningful product title");
  } else {
    blockingReasons.push("missing, fixture or placeholder product title");
  }

  if (usefulText(product.categoryCode, 2)) {
    score += 1;
    reasons.push("governed category classification");
  } else {
    blockingReasons.push("missing category classification");
  }

  if (hasDescription) {
    score += 2;
    reasons.push("meaningful public description");
  }
  if (hasImage) {
    score += 1;
    reasons.push(hasApprovedMedia ? "approved public media" : "approved catalogue-source image");
  } else {
    blockingReasons.push("missing approved or trusted public image");
  }
  if (hasIdentity) {
    score += 1;
    reasons.push("brand or public product identifier");
  }
  if (hasStrongDifferentiator && !hasIdentity) {
    score += 1;
    reasons.push("public variant differentiator");
  }

  if (!hasDescription && !hasImage && !hasIdentity && !hasStrongDifferentiator) {
    blockingReasons.push("insufficient public product content");
  }
  if (Number(product.duplicateTitleCount) > 1 && !hasStrongDifferentiator) {
    blockingReasons.push("duplicate title without a public identifier or variant differentiator");
  }
  if (product.offerAvailable !== true) {
    blockingReasons.push("no active local offer with fresh sellable stock");
  } else {
    reasons.push("active local offer with fresh sellable stock");
  }

  return {
    eligible: blockingReasons.length === 0 && score >= minimumScore,
    score,
    minimumScore,
    reasons,
    blockingReasons
  };
}
