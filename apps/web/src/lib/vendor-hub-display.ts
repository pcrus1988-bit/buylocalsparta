import type { VendorOperatingContext } from "@buy-local-sparta/core";
import { EXPANSION_HUBS } from "./expansion-hubs";

type VendorHubScope = Pick<VendorOperatingContext, "marketId" | "hubId">;

export function isExpansionHubScope(scope: VendorHubScope): boolean {
  return Boolean(scope.hubId) && scope.marketId !== "sparta";
}

export function vendorHubDisplayName(scope: VendorHubScope): string {
  if (!isExpansionHubScope(scope)) return "Σπάρτη";

  const byId = scope.hubId ? EXPANSION_HUBS.find((hub) => hub.id === scope.hubId) : undefined;
  if (byId) return byId.nameEl;

  const slug = scope.marketId.startsWith("hub-") ? scope.marketId.slice(4) : scope.marketId;
  const bySlug = EXPANSION_HUBS.find((hub) => hub.slug === slug);
  if (bySlug) return bySlug.nameEl;

  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("el") + part.slice(1))
    .join(" ");
}
