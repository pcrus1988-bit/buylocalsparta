import { EXPANSION_HUBS, getExpansionHubBySlug, type ExpansionHub } from "./expansion-hubs.ts";

export const SPARTA_HUB_ID = "KM-HUB-015";
export const SPARTA_GATEWAY_SLUG = "sparti";
export const SPARTA_MARKET_CODE = "sparta";
export const SPARTA_MARKET_ID = "e174202e-9b12-4dc4-a0d4-c2263491f292";
export const KALAMATA_HUB_ID = "KM-HUB-019";
export const KALAMATA_GATEWAY_SLUG = "kalamata";

export type HubResolutionSource = "route" | "selection" | "compatibility-root" | "fallback";
export type HubResolution = Readonly<{
  hub: ExpansionHub;
  source: HubResolutionSource;
}>;

// These are application/system namespaces, never geographic HUB slugs. Keep this
// guard explicit before introducing a dynamic city route so existing URLs retain
// precedence over expansion routing.
export const RESERVED_HUB_ROUTE_SEGMENTS = new Set([
  "_next",
  "about",
  "accessibility",
  "account",
  "admin",
  "agora",
  "api",
  "ask-local",
  "auth",
  "cart",
  "categories",
  "category",
  "checkout",
  "choose-location",
  "contact",
  "daily",
  "driver",
  "join",
  "legal",
  "login",
  "logout",
  "manifest.webmanifest",
  "order",
  "orders",
  "privacy",
  "product",
  "products",
  "register",
  "returns",
  "robots.txt",
  "search",
  "shops",
  "sitemap",
  "sitemap.xml",
  "support",
  "terms",
  "track",
  "tracking",
  "vendor"
]);

const HUB_BY_ID = new Map(EXPANSION_HUBS.map((hub) => [hub.id, hub] as const));

function requireSpartaHub(): ExpansionHub {
  const hub = HUB_BY_ID.get(SPARTA_HUB_ID);
  if (!hub || hub.slug !== SPARTA_GATEWAY_SLUG || !hub.isSpartaLegacy) {
    throw new Error("Expansion master must expose Sparta as KM-HUB-015 / sparti");
  }
  return hub;
}

const SPARTA_HUB: ExpansionHub = requireSpartaHub();

function normaliseSegment(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Malformed URL encoding is never a valid HUB identifier. Keeping the raw
    // segment makes resolution fail closed instead of throwing in middleware.
  }
  return decoded.trim().toLocaleLowerCase("en-US");
}

function pathSegments(pathname: string): string[] {
  const pathOnly = pathname.split(/[?#]/, 1)[0] ?? "";
  return pathOnly
    .split("/")
    .map(normaliseSegment)
    .filter(Boolean);
}

export function getExpansionHubById(id: string): ExpansionHub | undefined {
  return HUB_BY_ID.get(id);
}

export function isReservedHubRouteSegment(segment: string): boolean {
  return RESERVED_HUB_ROUTE_SEGMENTS.has(normaliseSegment(segment));
}

export function resolveHubSelection(slug: string | null | undefined): ExpansionHub | undefined {
  if (!slug) return undefined;
  const normalised = normaliseSegment(slug);
  if (!normalised || isReservedHubRouteSegment(normalised)) return undefined;

  // `sparta` is the long-lived operational market code. Accept it only as a
  // compatibility alias while keeping `sparti` as the canonical expansion slug.
  if (normalised === SPARTA_MARKET_CODE) return SPARTA_HUB;
  return getExpansionHubBySlug(normalised);
}

export function resolveHubFromPathname(pathname: string): ExpansionHub | undefined {
  const segments = pathSegments(pathname);
  if (segments.length === 0) return undefined;

  const first = segments[0];
  if (first === "agora") {
    const candidate = segments[1];
    if (!candidate || isReservedHubRouteSegment(candidate)) return undefined;
    return resolveHubSelection(candidate);
  }

  if (isReservedHubRouteSegment(first)) return undefined;
  return resolveHubSelection(first);
}

export function resolveHubContext(input: Readonly<{
  pathname?: string | null;
  selectedSlug?: string | null;
}> = {}): HubResolution {
  const pathname = input.pathname ?? "/";

  // Compatibility contract: until the national gateway becomes the enforced
  // storefront entry, `/` is always the current Sparta storefront.
  if (pathname.split(/[?#]/, 1)[0] === "/") {
    return { hub: SPARTA_HUB, source: "compatibility-root" };
  }

  const routeHub = resolveHubFromPathname(pathname);
  if (routeHub) return { hub: routeHub, source: "route" };

  const selectedHub = resolveHubSelection(input.selectedSlug);
  if (selectedHub) return { hub: selectedHub, source: "selection" };

  return { hub: SPARTA_HUB, source: "fallback" };
}
