import { EXPANSION_HUBS } from "./expansion-hubs";

export const LOCATION_GATEWAY_COOKIE = "km_locality";
export const LOCATION_GATEWAY_PATH = "/choose-location";

const LIVE_LOCALITY_SLUGS = new Set(EXPANSION_HUBS.filter((hub) => hub.isLive).map((hub) => hub.slug));
const CRAWLER_USER_AGENT = /(?:bot\b|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|discordbot|linkedinbot|twitterbot|applebot|duckduckbot|yandexbot|baiduspider|google-inspectiontool|lighthouse|pagespeed)/i;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export type LocationGatewayRedirectDecision = Readonly<{
  redirect: boolean;
  reason: "disabled" | "method-bypass" | "route-bypass" | "prefetch-bypass" | "crawler-bypass" | "live-locality" | "selection-required";
}>;

export function locationGatewayEnforcementEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function isLiveLocalitySlug(value: string | undefined): boolean {
  return Boolean(value && LIVE_LOCALITY_SLUGS.has(value));
}

export function isLikelyCrawler(userAgent: string | undefined): boolean {
  return Boolean(userAgent && CRAWLER_USER_AGENT.test(userAgent));
}

export function sanitizeLocationGatewayNext(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  const candidate = value.trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\") || CONTROL_CHARACTER.test(candidate)) return fallback;

  try {
    const base = "https://location-gateway.invalid";
    const parsed = new URL(candidate, base);
    if (parsed.origin !== base || parsed.pathname === LOCATION_GATEWAY_PATH) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function locationGatewayRequestTarget(pathname: string, search = ""): string {
  return sanitizeLocationGatewayNext(`${pathname || "/"}${search}`);
}

export function locationGatewayRedirectDecision(input: Readonly<{
  enabled: boolean;
  method: string;
  pathname: string;
  userAgent?: string;
  localityCookie?: string;
  prefetch?: boolean;
}>): LocationGatewayRedirectDecision {
  if (!input.enabled) return { redirect: false, reason: "disabled" };
  if (input.method !== "GET" && input.method !== "HEAD") return { redirect: false, reason: "method-bypass" };

  // First rollout intentionally intercepts only the marketplace root. Public SEO
  // deep links and every private/system namespace remain untouched by construction.
  if (input.pathname !== "/") return { redirect: false, reason: "route-bypass" };
  if (input.prefetch) return { redirect: false, reason: "prefetch-bypass" };
  if (isLikelyCrawler(input.userAgent)) return { redirect: false, reason: "crawler-bypass" };
  if (isLiveLocalitySlug(input.localityCookie)) return { redirect: false, reason: "live-locality" };
  return { redirect: true, reason: "selection-required" };
}
