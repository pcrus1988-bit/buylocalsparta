import { EXPANSION_HUBS } from "./expansion-hubs.ts";
import { isReadOnlyPublicCrawlerUserAgent } from "./public-crawler.ts";

export const HUB_LOCALITY_COOKIE = "km_locality";
export const PRIMARY_LOCATION_GATEWAY_PATH = "/choose-location";

const LIVE_LOCALITY_SELECTIONS = new Set([
  ...EXPANSION_HUBS.filter((hub) => hub.isLive).map((hub) => hub.slug),
  // Compatibility with the pre-HUB English Sparta locality alias.
  "sparta"
]);

function normaliseLocality(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Malformed cookie input is not a valid locality selection.
  }
  const normalized = decoded.trim().toLocaleLowerCase("en-US");
  return normalized || undefined;
}

/**
 * The national location gateway is the default storefront entry contract.
 * An explicit server-side `false` is the emergency rollback switch; any other
 * explicitly configured value must be `true`, so typos fail safely to the
 * legacy Sparta-first root instead of unexpectedly changing traffic routing.
 */
export function primaryLocationGatewayEnforcementEnabled(value: string | null | undefined): boolean {
  if (value == null) return true;
  return value.trim().toLowerCase() === "true";
}

export function isLiveLocalitySelection(value: string | null | undefined): boolean {
  const normalized = normaliseLocality(value);
  return Boolean(normalized && LIVE_LOCALITY_SELECTIONS.has(normalized));
}

/** @deprecated Prefer isLiveLocalitySelection; retained for compatibility with the initial Sparta gateway tests. */
export function isLegacySpartaLocality(value: string | null | undefined): boolean {
  return isLiveLocalitySelection(value);
}

/**
 * Only the bare human storefront root is location-gated. Existing direct
 * application/storefront URLs remain untouched, and public crawlers retain the
 * stable Sparta root document for SEO/social previews.
 */
export function shouldRedirectToPrimaryLocationGateway(input: Readonly<{
  pathname: string;
  method: string;
  localityCookie?: string | null;
  userAgent?: string | null;
  prefetch?: boolean;
}>): boolean {
  if (input.pathname !== "/") return false;
  if (input.method !== "GET" && input.method !== "HEAD") return false;
  if (input.prefetch) return false;
  if (isReadOnlyPublicCrawlerUserAgent(input.userAgent)) return false;
  return !isLiveLocalitySelection(input.localityCookie);
}
