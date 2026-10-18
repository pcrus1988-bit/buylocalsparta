/** Pure route policy. The subdomain cannot browse marketplace backoffice routes. */
export const HOSPITALITY_HOST = "hospitality.kontamou.site";

export function isHospitalityHost(hostname: string): boolean {
  return hostname.toLowerCase().replace(/\.$/, "") === HOSPITALITY_HOST;
}

export function isHospitalityHostPathAllowed(pathname: string): boolean {
  return pathname === "/" ||
    pathname === "/drinkstock" ||
    pathname.startsWith("/drinkstock/") ||
    pathname === "/drinkStock" ||
    pathname.startsWith("/drinkStock/") ||
    // Shared, signed consent endpoint is required by the global cookie banner.
    // Keep the exception exact: all other marketplace/privacy APIs remain blocked.
    pathname === "/api/privacy/consent" ||
    pathname === "/api/hospitality/login" ||
    pathname === "/api/hospitality/logout" ||
    pathname.startsWith("/api/hospitality/partners/") ||
    pathname === "/favicon.ico" ||
    pathname === "/favicon.svg" ||
    pathname === "/robots.txt" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/brand/");
}

export function hospitalityPrivatePath(pathname: string): boolean {
  return pathname === "/drinkstock/dashboard" ||
    pathname.startsWith("/drinkstock/dashboard/") ||
    pathname === "/drinkStock/dashboard" ||
    pathname.startsWith("/drinkStock/dashboard/");
}
/**
 * Map only explicitly exposed hospitality URLs to their internal Next.js pages.
 * Proxy rewrites run before filesystem route matching; config rewrites alone can
 * allow the marketplace root page to win on the hospitality hostname.
 */
export function hospitalityRewritePath(pathname: string): string | undefined {
  if (pathname === "/") return "/hospitality";
  if (pathname === "/drinkstock" || pathname.startsWith("/drinkstock/")) {
    return `/hospitality/drinkStock${pathname.slice("/drinkstock".length)}`;
  }
  if (pathname === "/drinkStock" || pathname.startsWith("/drinkStock/")) {
    return `/hospitality${pathname}`;
  }
  return undefined;
}
