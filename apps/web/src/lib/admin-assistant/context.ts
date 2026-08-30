import type { SessionPrincipal } from "@buy-local-sparta/core";
import { hasAdminPermission } from "../admin-runtime";
import type { AdminAssistantClientContext, AdminAssistantContext, AdminAssistantDomain } from "./types";

function cleanRoute(value: string): string {
  const route = value.split("?")[0]?.trim() || "/admin";
  return route.startsWith("/admin") ? route.slice(0, 500) : "/admin";
}

function safeDecode(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try { return decodeURIComponent(value).slice(0, 200); } catch { return value.slice(0, 200); }
}

function routeDescriptor(route: string): { domain: AdminAssistantDomain; pageType: string; label: string; entityType?: string; entityId?: string } {
  if (route === "/admin") return { domain: "dashboard", pageType: "admin_home", label: "Admin > Overview" };
  const order = route.match(/^\/admin\/orders\/([^/]+)$/);
  if (order) return { domain: "orders", pageType: "order_detail", label: `Operations > Orders > ${safeDecode(order[1])}`, entityType: "order", entityId: safeDecode(order[1]) };
  const product = route.match(/^\/admin\/products\/([^/]+)$/);
  if (product) return { domain: "catalogue", pageType: "product_detail", label: `Catalogue > Products > ${safeDecode(product[1])}`, entityType: "canonical_product", entityId: safeDecode(product[1]) };
  const vendor = route.match(/^\/admin\/(?:vendors|partners)\/([^/]+)$/);
  if (vendor) return { domain: "partners", pageType: "vendor_detail", label: `Partners > ${safeDecode(vendor[1])}`, entityType: "vendor", entityId: safeDecode(vendor[1]) };
  if (route.startsWith("/admin/catalogue-intake/attributes")) return { domain: "catalogue", pageType: "attribute_mapping", label: "Catalogue > Attributes" };
  if (route.startsWith("/admin/catalogue-intake/import")) return { domain: "catalogue", pageType: "source_import", label: "Catalogue > Files & Icecat" };
  if (route.startsWith("/admin/catalogue-intake")) return { domain: "catalogue", pageType: "supplier_pim", label: "Catalogue > Supplier PIM" };
  if (route.startsWith("/admin/catalogue-crawler")) return { domain: "catalogue", pageType: "website_import", label: "Catalogue > Website Import" };
  if (route.startsWith("/admin/categories")) return { domain: "catalogue", pageType: "taxonomy", label: "Catalogue > Categories & Policies" };
  if (route.startsWith("/admin/matching")) return { domain: "catalogue", pageType: "product_matching", label: "Catalogue > Product Matching" };
  if (route.startsWith("/admin/catalogue") || route.startsWith("/admin/products")) return { domain: "catalogue", pageType: "catalogue_overview", label: "Catalogue" };
  if (route.startsWith("/admin/orders") || route.startsWith("/admin/delivery")) return { domain: "orders", pageType: "orders", label: "Operations > Orders" };
  if (["/admin/partners", "/admin/vendors", "/admin/applications", "/admin/prospects", "/admin/research-vendors"].some((prefix) => route.startsWith(prefix))) return { domain: "partners", pageType: "partners", label: "Partners" };
  if (route.startsWith("/admin/tax") || route.startsWith("/admin/finance/mydata")) return { domain: "tax", pageType: "tax", label: "Finance & Tax > Tax & myDATA" };
  if (route.startsWith("/admin/seo")) return { domain: "seo", pageType: "seo", label: "SEO & Visibility" };
  if (route.startsWith("/admin/gift-cards") || route.startsWith("/admin/coupons")) return { domain: "gift_cards", pageType: "gift_cards", label: "Customers > Gift Cards" };
  if (["/admin/platform", "/admin/operations", "/admin/maintenance", "/admin/activation"].some((prefix) => route.startsWith(prefix))) return { domain: "platform", pageType: "platform", label: "Platform" };
  return { domain: "generic", pageType: "admin_page", label: route.replace(/^\/admin\/?/, "Admin > ").replaceAll("-", " ") || "Admin" };
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
    case "catalogue": return ["What should I prioritize here?", "Explain unmapped attributes.", "Show the highest-impact catalog issues.", "What happens if I change this mapping?"];
    case "orders": return ["Which orders need attention?", "Find fulfilment inconsistencies.", "Check everything related to this order.", "What should I fix first?"];
    case "partners": return ["Which partners need attention?", "Show onboarding blockers.", "Explain this partner state.", "What should I follow up next?"];
    case "tax": return ["Which fiscal documents need attention?", "Show missing MARK or transmission issues.", "Explain this tax screen.", "What is safe to do next?"];
    case "seo": return ["What is limiting visibility?", "Show the highest SEO opportunities.", "Find indexability problems.", "What should I improve first?"];
    case "gift_cards": return ["Explain this gift-card screen.", "What should I verify before launch?", "Are there redemption risks?", "What should I check next?"];
    case "platform": return ["What is unhealthy?", "What changed today?", "Which background jobs need attention?", "What should I investigate first?"];
    default: return ["Explain this page.", "What should I pay attention to?", "What should I do next?", "Check for anything unusual."];
  }
}

export function buildAdminAssistantContext(principal: SessionPrincipal, client: AdminAssistantClientContext): AdminAssistantContext {
  const descriptor = routeDescriptor(cleanRoute(client.route));
  const capabilities: string[] = ["assistant.read"];
  if (hasAdminPermission(principal, "catalog.read")) capabilities.push("catalog.read");
  if (hasAdminPermission(principal, "catalog.write")) capabilities.push("catalog.prepare");
  if (hasAdminPermission(principal, "fulfilment.read")) capabilities.push("orders.read");
  if (hasAdminPermission(principal, "vendor.manage")) capabilities.push("partners.read");
  if (hasAdminPermission(principal, "finance.read")) capabilities.push("finance.read");
  if (hasAdminPermission(principal, "content.read")) capabilities.push("seo.read");
  if (hasAdminPermission(principal, "admin.audit.read")) capabilities.push("audit.read");
  return {
    route: client.route,
    pageType: descriptor.pageType,
    domain: descriptor.domain,
    contextLabel: descriptor.label,
    entityType: descriptor.entityType,
    entityId: descriptor.entityId,
    selectedTab: client.selectedTab ?? client.filters?.view ?? client.filters?.tab,
    filters: client.filters ?? {},
    capabilities
  };
}
