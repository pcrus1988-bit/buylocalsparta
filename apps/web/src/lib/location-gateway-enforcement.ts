import { getExpansionHubBySlug, type ExpansionHub } from "./expansion-hubs.ts";

export const LOCATION_GATEWAY_COOKIE = "km_locality";
export const LOCATION_GATEWAY_PATH = "/choose-location";

export type LocationGatewayRootDecisionInput = Readonly<{
  pathname: string;
  method?: string;
  localitySlug?: string | null;
  enforcementEnabled: boolean;
}>;

function normaliseLocalitySlug(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // A malformed cookie is never a valid location decision. Keep the raw value
    // so lookup fails closed instead of throwing at the request boundary.
  }
  return decoded.trim().toLocaleLowerCase("en-US");
}

export function isLocationGatewayRootEnforcementEnabled(value: string | null | undefined): boolean {
  const normalised = value?.trim().toLocaleLowerCase("en-US");
  return normalised === "1" || normalised === "true";
}

/**
 * `/` is still the legacy Sparta storefront. Until each non-Sparta HUB has its
 * own market-scoped storefront route, only the canonical Sparta selection may
 * unlock the root storefront. This prevents a prospect/inactive HUB cookie from
 * leaking a visitor into Sparta's inventory, pricing, checkout or delivery UX.
 */
export function getSupportedRootStorefrontHub(localitySlug: string | null | undefined): ExpansionHub | undefined {
  if (!localitySlug) return undefined;
  const hub = getExpansionHubBySlug(normaliseLocalitySlug(localitySlug));
  return hub?.isSpartaLegacy ? hub : undefined;
}

/**
 * Stage-one gateway enforcement is intentionally narrow:
 * - off unless explicitly enabled by a server-side flag;
 * - GET/HEAD requests to `/` only;
 * - every deep route remains untouched;
 * - only KM-HUB-015 / `sparti` may enter the current root storefront.
 */
export function shouldRedirectRootToLocationGateway(input: LocationGatewayRootDecisionInput): boolean {
  if (!input.enforcementEnabled) return false;
  if (input.pathname !== "/") return false;

  const method = (input.method ?? "GET").toLocaleUpperCase("en-US");
  if (method !== "GET" && method !== "HEAD") return false;

  return !getSupportedRootStorefrontHub(input.localitySlug);
}
