import { isReadOnlyPublicCrawlerUserAgent } from "./public-crawler";

export const HUB_LOCALITY_COOKIE = "km_locality";
export const PRIMARY_LOCATION_GATEWAY_PATH = "/choose-location";

const LEGACY_SPARTA_SELECTIONS = new Set(["sparti", "sparta"]);

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

export function isLegacySpartaLocality(value: string | null | undefined): boolean {
  const normalized = normaliseLocality(value);
  return Boolean(normalized && LEGACY_SPARTA_SELECTIONS.has(normalized));
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
}>): boolean {
  if (input.pathname !== "/") return false;
  if (input.method !== "GET" && input.method !== "HEAD") return false;
  if (isReadOnlyPublicCrawlerUserAgent(input.userAgent)) return false;
  return !isLegacySpartaLocality(input.localityCookie);
}
