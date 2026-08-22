import type { PublicVendorDirectoryEntry } from "./public-vendor-directory";

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

const MIN_RESEARCH_VENDOR_INDEX_SCORE = 5;
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
 */
export function researchVendorIndexEligibility(vendor: PublicVendorDirectoryEntry): ResearchVendorIndexEligibility {
  if (vendor.directoryStatus !== "research") {
    return { eligible: true, score: 100, minimumScore: 0, reasons: ["active partner profile"], blockingReasons: [] };
  }

  let score = 0;
  const reasons: string[] = [];
  const blockingReasons: string[] = [];
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

  return {
    eligible: blockingReasons.length === 0 && score >= MIN_RESEARCH_VENDOR_INDEX_SCORE,
    score,
    minimumScore: MIN_RESEARCH_VENDOR_INDEX_SCORE,
    reasons,
    blockingReasons
  };
}

export function vendorIndexEligible(vendor: PublicVendorDirectoryEntry): boolean {
  return vendor.directoryStatus === "partner" || researchVendorIndexEligibility(vendor).eligible;
}
