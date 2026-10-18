/** Pure route policy. The subdomain cannot browse marketplace backoffice routes. */
export const HOSPITALITY_HOST = "hospitality.kontamou.site";

export function isHospitalityHost(hostname: string): boolean {
  return hostname.toLowerCase().replace(/\.$/, "") === HOSPITALITY_HOST;
}

export function isHospitalityHostPathAllowed(pathname: string): boolean {
  return pathname === "/" ||
    pathname === "/drinkStock" ||
    pathname.startsWith("/drinkStock/") ||
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
  return pathname === "/drinkStock/dashboard" ||
    pathname.startsWith("/drinkStock/dashboard/");
}
/**
 * Map only explicitly exposed hospitality URLs to their internal Next.js pages.
 * Proxy rewrites run before filesystem route matching; config rewrites alone can
 * allow the marketplace root page to win on the hospitality hostname.
 */
export function hospitalityRewritePath(pathname: string): string | undefined {
  if (pathname === "/") return "/hospitality";
  if (pathname === "/drinkStock" || pathname.startsWith("/drinkStock/")) {
    return `/hospitality${pathname}`;
  }
  return undefined;
}
