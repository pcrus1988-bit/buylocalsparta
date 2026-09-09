export const LOCATION_GATEWAY_COOKIE = "km_locality";
export const SPARTA_GATEWAY_SLUG = "sparti";
export const LOCATION_GATEWAY_PATH = "/choose-location";

export type LocationGatewayRootDecision = Readonly<{
  pathname: string;
  localitySlug?: string;
  enforcementEnabled: boolean;
}>;

/**
 * Root-only gateway cutover guard.
 *
 * The live Sparta storefront remains the only market that may currently enter
 * through `/`. Other HUBs can be selected and researched in the location
 * gateway, but they must not fall through to Sparta's storefront by accident.
 *
 * This deliberately does not govern deep links. Wider market-aware routing is
 * a later cutover once every public surface can resolve a MarketContext safely.
 */
export function shouldRedirectRootToLocationGateway({
  pathname,
  localitySlug,
  enforcementEnabled
}: LocationGatewayRootDecision): boolean {
  if (!enforcementEnabled || pathname !== "/") return false;
  return localitySlug !== SPARTA_GATEWAY_SLUG;
}

export function isLocationGatewayRootEnforcementEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}
