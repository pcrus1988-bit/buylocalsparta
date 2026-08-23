export type PublicCoordinates = Readonly<{ latitude: number; longitude: number }>;

/**
 * Reject missing, non-finite, out-of-range and sentinel coordinates before they
 * reach any public map. `(0, 0)` is a common import/default sentinel and can never
 * represent a Sparta launch-market storefront.
 */
export function hasUsablePublicCoordinates(coordinates?: PublicCoordinates): coordinates is PublicCoordinates {
  if (!coordinates) return false;
  const { latitude, longitude } = coordinates;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
  return !(latitude === 0 && longitude === 0);
}

/**
 * A zero minor-unit value on an unavailable canonical is not a customer price.
 * Keep valid reference/catalogue prices visible, but never communicate an absent
 * offer as a misleading EUR 0.00 price.
 */
export function publicCatalogPriceLabel(product: Readonly<{ available: boolean; priceMinor: number; price: string }>): string {
  return !product.available && product.priceMinor === 0 ? "Τιμή μη διαθέσιμη" : product.price;
}
