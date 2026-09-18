export const COMMERCE_CHANNELS = ["normal", "bazaar"] as const;

export type CommerceChannel = (typeof COMMERCE_CHANNELS)[number];

/**
 * Public catalogue discovery is normal-only unless a caller explicitly opts
 * into the dedicated BAZAAR experience. This default-deny boundary prevents
 * second-life inventory from leaking into normal search/category/storefronts.
 */
export const DEFAULT_COMMERCE_CHANNEL: CommerceChannel = "normal";
export const BAZAAR_COMMERCE_CHANNEL: CommerceChannel = "bazaar";

const COMMERCE_CHANNEL_SET = new Set<string>(COMMERCE_CHANNELS);

export function isCommerceChannel(value: unknown): value is CommerceChannel {
  return typeof value === "string" && COMMERCE_CHANNEL_SET.has(value);
}

export function requireCommerceChannel(value: unknown): CommerceChannel {
  if (!isCommerceChannel(value)) throw new Error("Invalid catalogue commerce channel");
  return value;
}

export function normalDiscoveryChannel(): "normal" {
  return DEFAULT_COMMERCE_CHANNEL;
}

export function bazaarDiscoveryChannel(): "bazaar" {
  return BAZAAR_COMMERCE_CHANNEL;
}

/**
 * Canonical identity must be channel-aware. Identical EAN/SKU/manufacturer
 * evidence may link provenance across channels, but must never merge a BAZAAR
 * item into the normal/new canonical inventory namespace.
 */
export function channelScopedCanonicalNamespace(channel: CommerceChannel): string {
  return `catalog:${channel}`;
}

export function channelScopedCanonicalKey(input: {
  channel: CommerceChannel;
  identityKey: string;
}): string {
  const identityKey = input.identityKey.trim();
  if (!identityKey) throw new Error("Canonical identity key is required");
  return `${channelScopedCanonicalNamespace(input.channel)}:${identityKey}`;
}

export function sameCanonicalMergeDomain(left: CommerceChannel, right: CommerceChannel): boolean {
  return left === right;
}
