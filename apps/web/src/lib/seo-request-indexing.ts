import { NON_INDEXABLE_PAGE_ROUTES } from "./site-navigation.ts";
import { seoVisibilityForPath, type SeoRoutePolicy } from "./seo-visibility-policy.ts";

export type SeoRequestIndexingDecision = Readonly<{
  index: boolean;
  follow: boolean;
  routePolicy: SeoRoutePolicy;
  reason: string;
  source: "route-policy" | "route-inventory" | "private-prefix" | "query-state" | "public";
}>;

type SearchParamsLike = Pick<URLSearchParams, "entries">;

const PRIVATE_DOCUMENT_PREFIXES = [
  "/account",
  "/admin",
  "/daily",
  "/driver",
  "/delivery/manage"
] as const;

const PUBLIC_QUERY_NOINDEX_RULES = new Map<string, readonly string[] | "*">([
  ["/shop", "*"],
  ["/shops", ["q", "category", "subcategory", "status"]]
]);

function normalizePathname(pathname: string): string {
  if (!pathname) return "/";
  const withSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

function routePatternMatches(pattern: string, pathname: string): boolean {
  const patternParts = normalizePathname(pattern).split("/").filter(Boolean);
  const pathnameParts = normalizePathname(pathname).split("/").filter(Boolean);
  if (patternParts.length !== pathnameParts.length) return false;
  return patternParts.every((part, index) => /^\[[^/]+\]$/.test(part) || part === pathnameParts[index]);
}

function isExplicitlyNonIndexable(pathname: string): boolean {
  return NON_INDEXABLE_PAGE_ROUTES.some((pattern) => routePatternMatches(pattern, pathname));
}

function isPrivateDocument(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  if (normalized === "/vendor") return true;
  return PRIVATE_DOCUMENT_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function hasQueryState(pathname: string, searchParams?: SearchParamsLike): boolean {
  if (!searchParams) return false;
  const rule = PUBLIC_QUERY_NOINDEX_RULES.get(normalizePathname(pathname));
  if (!rule) return false;
  for (const [key, value] of searchParams.entries()) {
    if (!value.trim()) continue;
    if (rule === "*" || rule.includes(key)) return true;
  }
  return false;
}

/**
 * Final request-level indexing decision for public HTML documents.
 *
 * This deliberately layers the semantic route policy with the explicit navigation
 * inventory. That gives us defense in depth while older route registries are being
 * consolidated, and prevents a newly-added private/utility page from becoming
 * indexable merely because a page forgot to emit metadata.
 */
export function seoRequestIndexingDecision(pathname: string, searchParams?: SearchParamsLike): SeoRequestIndexingDecision {
  const normalized = normalizePathname(pathname);
  const routePolicy = seoVisibilityForPath(normalized);

  if (routePolicy.visibility !== "PUBLIC_INDEXABLE") {
    return {
      index: false,
      follow: routePolicy.visibility === "PUBLIC_NOINDEX",
      routePolicy,
      reason: routePolicy.reason,
      source: "route-policy"
    };
  }

  if (isPrivateDocument(normalized)) {
    return {
      index: false,
      follow: false,
      routePolicy,
      reason: "Authenticated/operational document namespace must never become a search result.",
      source: "private-prefix"
    };
  }

  if (isExplicitlyNonIndexable(normalized)) {
    return {
      index: false,
      follow: true,
      routePolicy,
      reason: "Route is explicitly present in the non-indexable page inventory.",
      source: "route-inventory"
    };
  }

  if (hasQueryState(normalized, searchParams)) {
    return {
      index: false,
      follow: true,
      routePolicy,
      reason: "Filtered/search result state canonicalizes to a clean discovery landing page.",
      source: "query-state"
    };
  }

  return {
    index: true,
    follow: true,
    routePolicy,
    reason: routePolicy.reason,
    source: "public"
  };
}

/**
 * X-Robots-Tag is a fallback for HTML documents, not an API/media policy.
 * Public image endpoints are intentionally handled by robots.ts and must remain
 * eligible for image discovery when the global media-crawl setting allows it.
 */
export function seoDocumentRobotsHeader(pathname: string, searchParams?: SearchParamsLike): string | undefined {
  const normalized = normalizePathname(pathname);
  if (normalized === "/api" || normalized.startsWith("/api/")) return undefined;
  const decision = seoRequestIndexingDecision(normalized, searchParams);
  if (decision.index) return undefined;
  return decision.follow ? "noindex, follow" : "noindex, nofollow";
}
