export type PublicCoordinates = Readonly<{ latitude: number; longitude: number }>;

const NON_PUBLIC_CATALOGUE_TITLE_PATTERN = /^\s*(?:test|demo|dummy|sample|placeholder|δοκιμ(?:ή|η)|δοκιμαστικ(?:ό|ο))(?:\s|[-_:/#]|$)/i;
const GENERATED_TECHNICAL_DESCRIPTION_MARKER = "Κύρια διακριτικά/τεχνικά χαρακτηριστικά:";

/**
 * Reject missing, non-finite, out-of-range and sentinel coordinates before they
 * reach any public map/schema. `(0, 0)` is a common import/default sentinel and
 * can never represent a Sparta launch-market storefront.
 */
export function hasUsablePublicCoordinates(coordinates?: PublicCoordinates): coordinates is PublicCoordinates {
  if (!coordinates) return false;
  const { latitude, longitude } = coordinates;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
  return !(latitude === 0 && longitude === 0);
}

/**
 * Obvious fixtures and presentation records must never enter the customer-facing
 * canonical catalogue. The pattern is deliberately anchored to the beginning so
 * legitimate product names containing words such as "sample" later in the title
 * are not accidentally suppressed.
 */
export function isPublicCatalogueTitle(title: string): boolean {
  const normalized = title.trim();
  return normalized.length >= 3 && !NON_PUBLIC_CATALOGUE_TITLE_PATTERN.test(normalized);
}

/**
 * Supplier/catalogue titles remain immutable evidence, but their public projection
 * should use readable unit and punctuation spacing. Keep this deliberately narrow:
 * do not translate wording, rewrite brands/model codes, or touch decimal commas.
 */
export function publicCatalogueTitleLabel(title: string): string {
  return title
    .trim()
    .replace(/\s+/g, " ")
    .replace(/(\d+(?:[.,]\d+)?)\s*Ton\b/giu, "$1 t")
    .replace(/(\d+)\s*Τεμ\.?(?!\p{L})/giu, "$1 τεμ.")
    .replace(/Υψος\s*:\s*/giu, "Ύψος: ")
    .replace(/(\d+(?:[.,]\d+)?)\s*(mm|cm|ml|l)\b/giu, (_match, value: string, unit: string) => `${value} ${unit.toLowerCase() === "l" ? "L" : unit.toLowerCase()}`)
    .replace(/([^\d\s]),(?=\d)/gu, "$1, ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Legacy catalogue enrichment generated technical-summary tails directly from
 * title parsing. Those tails can contain stale parser artefacts even after the
 * governed public specification projection has been corrected. Cards do not load
 * the richer specification projection, so expose only the safe introductory text
 * for that generated template; preserve ordinary editorial descriptions verbatim.
 */
export function publicCatalogueCardDescription(description: string): string {
  const normalized = description.trim();
  const markerIndex = normalized.indexOf(GENERATED_TECHNICAL_DESCRIPTION_MARKER);
  if (markerIndex < 0) return normalized;
  return publicCatalogueTitleLabel(normalized.slice(0, markerIndex).trim());
}

/**
 * A non-positive minor-unit value is an import/reference sentinel, not a customer
 * selling price. Keep valid positive reference/catalogue prices visible, including
 * temporarily unavailable products, but never communicate a missing price as EUR 0.
 */
export function publicCatalogPriceLabel(product: Readonly<{ available: boolean; priceMinor: number; price: string }>): string {
  return product.priceMinor <= 0 ? "Τιμή μη διαθέσιμη" : product.price;
}

/**
 * Schema.org Offer requires a real monetary amount. Unknown/non-positive import
 * sentinels must not become a zero-value Offer in search-engine structured data.
 */
export function publicCatalogHasOfferPrice(product: Readonly<{ priceMinor: number }>): boolean {
  return Number.isSafeInteger(product.priceMinor) && product.priceMinor > 0;
}
