export const CATALOGUE_COMMERCE_CHANNELS = ["normal", "bazaar"] as const;

export type CatalogueCommerceChannel = (typeof CATALOGUE_COMMERCE_CHANNELS)[number];

/**
 * Normal catalogue discovery is the safe default. BAZAAR must always be
 * selected explicitly so second-life inventory cannot leak into ordinary
 * search, category or vendor-storefront projections.
 */
export function resolveCatalogueCommerceChannel(
  requested?: string | null,
): CatalogueCommerceChannel {
  return requested === "bazaar" ? "bazaar" : "normal";
}

export function isBazaarCommerceChannel(
  channel: CatalogueCommerceChannel,
): boolean {
  return channel === "bazaar";
}

/**
 * Canonical identity is namespaced by commerce channel. Matching identifiers
 * (EAN/GTIN/SKU/manufacturer evidence) must never collapse BAZAAR inventory
 * into the canonical identity used by normal/new inventory.
 */
export function catalogueCanonicalNamespace(
  channel: CatalogueCommerceChannel,
): string {
  return `catalogue:${channel}`;
}

export function catalogueCanonicalIdentityKey(
  channel: CatalogueCommerceChannel,
  identity: string,
): string {
  return `${catalogueCanonicalNamespace(channel)}:${identity.trim().toLowerCase()}`;
}

export function canMergeCatalogueIdentities(
  leftChannel: CatalogueCommerceChannel,
  rightChannel: CatalogueCommerceChannel,
): boolean {
  return leftChannel === rightChannel;
}

/**
 * Public normal-catalogue callers must not opt into BAZAAR accidentally.
 */
export function isEligibleForNormalDiscovery(
  channel: CatalogueCommerceChannel,
): boolean {
  return channel === "normal";
}
