import type { SessionPrincipal } from "@buy-local-sparta/core";
import { hasAdminPermission } from "../admin-runtime";
import { adminAssistantPageDefinition } from "./page-registry";
import type { AdminAssistantClientContext, AdminAssistantContext, AdminAssistantDomain } from "./types";

function cleanRoute(value: string): string {
  const route = value.split("?")[0]?.trim() || "/admin";
  return route.startsWith("/admin") ? route.slice(0, 500) : "/admin";
}

function safeDecode(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try { return decodeURIComponent(value).slice(0, 200); } catch { return value.slice(0, 200); }
}

function entityIdFromRoute(route: string, entityType?: string): string | undefined {
  if (entityType === "order") return safeDecode(/^\/admin\/orders\/([^/]+)$/.exec(route)?.[1]);
  if (entityType === "vendor") return safeDecode(/^\/admin\/partners\/([^/]+)/.exec(route)?.[1]);
  return undefined;
}

export function parseAssistantClientContext(input: unknown): AdminAssistantClientContext {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const route = cleanRoute(typeof raw.route === "string" ? raw.route : "/admin");
  const filters: Record<string, string> = {};
  if (raw.filters && typeof raw.filters === "object") {
    for (const [key, value] of Object.entries(raw.filters as Record<string, unknown>).slice(0, 12)) {
      if (typeof value === "string" && key.length <= 80) filters[key] = value.slice(0, 250);
    }
  }
  return {
    route,
    filters,
    searchQuery: typeof raw.searchQuery === "string" ? raw.searchQuery.slice(0, 250) : undefined,
    selectedTab: typeof raw.selectedTab === "string" ? raw.selectedTab.slice(0, 120) : undefined
  };
}

export function suggestedQuestionsForDomain(domain: AdminAssistantDomain): readonly string[] {
  switch (domain) {
    case "dashboard": return ["What should I do next?", "What changed recently?", "Show only critical problems.", "Explain this overview."];
    case "catalogue": return ["What should I prioritize here?", "Explain unmapped attributes.", "Show the highest-impact data-quality issues.", "Check everything related to this context."];
    case "orders": return ["Which orders need attention?", "Find payment and fulfilment inconsistencies.", "Check everything related to this order.", "What should I fix first?"];
    case "partners": return ["Which partners need attention?", "Show onboarding blockers.", "Explain this partner state.", "What should I follow up next?"];
    case "tax": return ["Which fiscal documents need attention?", "Show missing MARK or transmission issues.", "Explain this tax screen.", "What is safe to do next?"];
    case "seo": return ["What is limiting visibility?", "Show the highest SEO opportunities.", "Find indexability problems.", "What should I improve first?"];
    case "gift_cards": return ["Which gift cards are not redeemable?", "Explain this gift-card screen.", "Find redemption risks.", "What should I verify before launch?"];
    case "platform": return ["What is unhealthy?", "What changed today?", "Which background jobs need attention?", "What should I investigate first?"];
    default: return ["Explain this page.", "What should I pay attention to?", "What should I do next?", "Check for anything unusual."];
  }
}

export function suggestedQuestionsForContext(context: AdminAssistantContext): readonly string[] {
  const specific: Readonly<Record<string, readonly string[]>> = {
    attribute_mapping: ["Show the highest-impact unmapped attributes.", "Suggest safe mappings.", "Find inconsistent units.", "What should I map first?"],
    catalogue_import: ["Is ingestion stalled?", "Why are rows being rejected?", "What changed in the latest ingestion?", "Show the highest-impact ingestion problem."],
    product_matching: ["Find duplicate-risk products.", "Which offers still need canonical matching?", "Show identifier conflicts.", "What can safely be resolved next?"],
    category_governance: ["Which categories need attention?", "Find empty or weak categories.", "Show taxonomy consistency problems.", "What category work has the highest impact?"],
    order_detail: ["Check everything related to this order.", "Is payment consistent with fulfilment?", "Does this order have a valid tax document?", "What is unusual about this order?"],
    vendor_detail: ["Check this partner's operational readiness.", "Is the agreement valid for this partner state?", "Are active orders safe for this partner?", "What should I fix first?"],
    vendor_catalogue: ["Is this partner ready to sell?", "What catalogue gaps block this partner?", "Does this partner have enough approved offers?", "What should I improve first?"],
    tax_mydata: ["Find paid orders missing tax documents.", "Show missing MARK documents.", "Which AADE failures need attention?", "What should I resolve first?"],
    gift_cards: ["Find gift cards that cannot be redeemed.", "Check checkout redemption readiness.", "Show state/value inconsistencies.", "What should I verify before launch?"],
    search_console: ["Which search queries are opportunities?", "Where are impressions not turning into clicks?", "Match search demand to catalogue coverage.", "What should I improve first?"],
    background_jobs: ["Which jobs are failing repeatedly?", "Show stalled or stale processing.", "What recovered recently?", "What should I investigate first?"]
  };
  return specific[context.pageType] ?? suggestedQuestionsForDomain(context.domain);
}

export function buildAdminAssistantContext(principal: SessionPrincipal, client: AdminAssistantClientContext): AdminAssistantContext {
  const route = cleanRoute(client.route);
  const page = adminAssistantPageDefinition(route);
  const capabilities: string[] = ["assistant.read"];
  const permissions: string[] = [];
  const add = (permission: Parameters<typeof hasAdminPermission>[1], capability: string) => {
    if (!hasAdminPermission(principal, permission)) return;
    permissions.push(permission);
    capabilities.push(capability);
  };
  add("catalog.read", "catalog.read");
  add("catalog.write", "catalog.prepare");
  add("fulfilment.read", "orders.read");
  add("vendor.manage", "partners.read");
  add("finance.read", "finance.read");
  add("content.read", "seo.read");
  add("admin.audit.read", "audit.read");
  add("analytics.market.read", "analytics.read");

  const entityId = entityIdFromRoute(route, page.entityType);
  return {
    route,
    pageType: page.pageType,
    domain: page.domain,
    contextLabel: page.contextLabel,
    pagePurpose: page.purpose,
    attentionAreas: page.attention,
    entityType: page.entityType,
    entityId,
    entityName: entityId,
    selectedTab: client.selectedTab ?? client.filters?.view ?? client.filters?.tab,
    searchQuery: client.searchQuery,
    filters: client.filters ?? {},
    permissions,
    capabilities
  };
}
