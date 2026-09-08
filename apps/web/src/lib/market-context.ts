import {
  EXPANSION_HUBS,
  getExpansionHubBySlug,
  type ExpansionHub
} from "./expansion-hubs.ts";

export const LOCATION_COOKIE_NAME = "km_locality";

export type LocationSelection =
  | Readonly<{ state: "unselected" }>
  | Readonly<{ state: "invalid"; rawValue: string }>
  | Readonly<{ state: "selected"; hub: ExpansionHub; gatewaySlug: string }>;

export type OperationalHubContext = Readonly<{
  hub: ExpansionHub;
  source: "selected" | "legacy-sparta-fallback";
}>;

export type OperationalHubOptions = Readonly<{
  allowLegacySpartaFallback?: boolean;
}>;

function decodeCookieValue(rawValue: string): string | undefined {
  try {
    return decodeURIComponent(rawValue).trim();
  } catch {
    return undefined;
  }
}

/**
 * Resolve the server-readable locality hint written by /choose-location.
 *
 * This function intentionally has no default HUB. Gateway enforcement must be
 * able to distinguish a visitor who has never selected a HUB from a visitor
 * who explicitly selected Sparta. Unknown or malformed cookie values are also
 * kept distinct so they can never silently inherit Sparta.
 */
export function resolveLocationSelection(rawCookieValue?: string | null): LocationSelection {
  if (rawCookieValue == null || rawCookieValue.trim() === "") {
    return { state: "unselected" };
  }

  const decoded = decodeCookieValue(rawCookieValue);
  if (decoded === undefined) {
    return { state: "invalid", rawValue: rawCookieValue };
  }
  if (decoded === "") {
    return { state: "unselected" };
  }

  const hub = getExpansionHubBySlug(decoded);
  if (!hub) {
    return { state: "invalid", rawValue: decoded };
  }

  return {
    state: "selected",
    hub,
    gatewaySlug: hub.slug
  };
}

function legacySpartaHub(): ExpansionHub {
  const hub = EXPANSION_HUBS.find((candidate) => candidate.isSpartaLegacy);
  if (!hub) {
    throw new Error("Expansion hub master is missing the Sparta legacy HUB");
  }
  return hub;
}

/**
 * Transitional operational resolver for legacy code paths that still require
 * a market/HUB even before the primary gateway cutover is complete.
 *
 * Fallback is opt-in and applies only to a genuinely unselected visitor.
 * Invalid selections are never converted to Sparta. New gateway-aware code
 * should leave allowLegacySpartaFallback disabled.
 */
export function resolveOperationalHub(
  selection: LocationSelection,
  options: OperationalHubOptions = {}
): OperationalHubContext | null {
  if (selection.state === "selected") {
    return { hub: selection.hub, source: "selected" };
  }

  if (selection.state === "invalid" || !options.allowLegacySpartaFallback) {
    return null;
  }

  return {
    hub: legacySpartaHub(),
    source: "legacy-sparta-fallback"
  };
}
