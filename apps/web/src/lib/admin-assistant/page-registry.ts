import { ADMIN_WORKSPACE_NAVIGATION } from "../workspace-navigation";
import type { AdminAssistantDomain } from "./types";

export type AdminAssistantPageDefinition = Readonly<{
  route: string;
  pageType: string;
  domain: AdminAssistantDomain;
  contextLabel: string;
  entityType?: string;
  purpose: string;
  attention: readonly string[];
}>;

const SEMANTIC_PAGES: Readonly<Record<string, Omit<AdminAssistantPageDefinition, "route">>> = {
  "/admin": { pageType: "dashboard", domain: "dashboard", contextLabel: "Command Centre", purpose: "Operational briefing, priorities and changes requiring Admin attention.", attention: ["critical queues", "cross-domain anomalies", "changes since last session"] },
  "/admin/orders": { pageType: "orders", domain: "orders", contextLabel: "Operations > Orders", entityType: "order", purpose: "Order lifecycle, payment, fulfilment, tax and exception management.", attention: ["payment inconsistencies", "fulfilment anomalies", "missing tax documents", "returns and refunds"] },
  "/admin/catalogue": { pageType: "catalogue_overview", domain: "catalogue", contextLabel: "Catalogue > Overview", purpose: "Canonical catalogue, taxonomy and data-quality overview.", attention: ["catalog coverage", "taxonomy gaps", "canonical integrity", "publication readiness"] },
  "/admin/catalogue-intake": { pageType: "supplier_pim", domain: "catalogue", contextLabel: "Catalogue > Supplier PIM", purpose: "Normalize supplier source data before canonical promotion.", attention: ["review queue", "blocked promotions", "source normalization", "category policy conflicts"] },
  "/admin/catalogue-intake/attributes": { pageType: "attribute_mapping", domain: "catalogue", contextLabel: "Catalogue > Attribute Mapping", entityType: "source_attribute", purpose: "Map source attributes into KONTA MOY canonical attributes safely and consistently.", attention: ["highest-impact unmapped attributes", "unit conflicts", "duplicate semantics", "affected products"] },
  "/admin/catalogue-intake/values": { pageType: "controlled_values", domain: "catalogue", contextLabel: "Catalogue > Controlled Values", entityType: "attribute_value", purpose: "Normalize source values into controlled canonical values.", attention: ["unmapped values", "aliases", "unit/value inconsistency", "high-volume source values"] },
  "/admin/catalogue-intake/import": { pageType: "catalogue_import", domain: "catalogue", contextLabel: "Catalogue > Files & Icecat", entityType: "ingestion_job", purpose: "Monitor source ingestion, acceptance/rejection, checkpoints and enrichment boundaries.", attention: ["stalled ingestion", "systematic rejection", "checkpoint progress", "publication boundary"] },
  "/admin/catalogue-crawler": { pageType: "catalogue_crawler", domain: "catalogue", contextLabel: "Catalogue > Website Import", entityType: "catalogue_source", purpose: "Monitor vendor/source crawling, extraction and source drift.", attention: ["failed crawls", "content drift", "stale sources", "processor backlog"] },
  "/admin/matching": { pageType: "product_matching", domain: "catalogue", contextLabel: "Catalogue > Product Matching", entityType: "canonical_product", purpose: "Resolve source offers into canonical products without duplicates.", attention: ["unmatched offers", "duplicate risk", "identifier conflicts", "canonical readiness"] },
  "/admin/categories": { pageType: "category_governance", domain: "catalogue", contextLabel: "Catalogue > Categories & Policies", entityType: "category", purpose: "Manage taxonomy hierarchy and category policy consistency.", attention: ["empty categories", "low-depth categories", "attribute-policy conflicts", "orphaned products"] },
  "/admin/partners": { pageType: "partners_overview", domain: "partners", contextLabel: "Partners > Overview", entityType: "vendor", purpose: "Partner commercial and operational readiness.", attention: ["onboarding blockers", "agreement gaps", "catalog readiness", "settlement readiness"] },
  "/admin/vendors": { pageType: "vendors", domain: "partners", contextLabel: "Partners > Vendors", entityType: "vendor", purpose: "Manage vendor state, catalogue participation and operational readiness.", attention: ["inactive/incomplete vendors", "inventory freshness", "offer health", "agreement state"] },
  "/admin/partners/pipeline": { pageType: "vendor_pipeline", domain: "partners", contextLabel: "Partners > Pipeline", entityType: "vendor_application", purpose: "Move partner candidates safely through verification and onboarding.", attention: ["verification queue", "stalled onboarding", "missing evidence", "next commercial action"] },
  "/admin/tax": { pageType: "tax_mydata", domain: "tax", contextLabel: "Finance > Tax & myDATA", entityType: "tax_document", purpose: "Monitor tax-document issuance, AADE transmission and MARK state.", attention: ["paid orders without documents", "missing MARK", "failed transmissions", "manual review"] },
  "/admin/gift-cards": { pageType: "gift_cards", domain: "gift_cards", contextLabel: "Finance > Gift Cards", entityType: "gift_card", purpose: "Manage gift-card issuance, validity and checkout redemption readiness.", attention: ["not redeemable", "state/value inconsistencies", "expired balances", "checkout integration"] },
  "/admin/seo": { pageType: "seo_overview", domain: "seo", contextLabel: "SEO & Visibility > Overview", entityType: "seo_page", purpose: "Prioritize KONTA MOY-specific organic visibility and indexability work.", attention: ["indexability", "canonical conflicts", "metadata quality", "search demand"] },
  "/admin/seo/pages": { pageType: "seo_pages", domain: "seo", contextLabel: "SEO & Visibility > Pages", entityType: "seo_page", purpose: "Inspect page-level SEO readiness and content quality.", attention: ["weak metadata", "thin pages", "canonical state", "availability"] },
  "/admin/seo/issues": { pageType: "seo_issues", domain: "seo", contextLabel: "SEO & Visibility > Issues", entityType: "seo_issue", purpose: "Review actionable SEO diagnostics based on deterministic evidence.", attention: ["critical issues", "warnings", "affected URLs", "root cause"] },
  "/admin/seo/crawl": { pageType: "seo_crawl", domain: "seo", contextLabel: "SEO & Visibility > Crawl", entityType: "crawl_result", purpose: "Review crawlability and internal technical SEO state.", attention: ["crawl failures", "redirects", "robots/indexability", "internal links"] },
  "/admin/seo/sitemaps": { pageType: "seo_sitemaps", domain: "seo", contextLabel: "SEO & Visibility > Sitemaps", entityType: "sitemap", purpose: "Validate sitemap coverage against indexable KONTA MOY pages.", attention: ["missing URLs", "stale URLs", "non-indexable entries", "coverage gaps"] },
  "/admin/seo/search-console": { pageType: "search_console", domain: "seo", contextLabel: "SEO & Visibility > Search Console", entityType: "search_query", purpose: "Connect search performance with actual catalogue and content opportunities.", attention: ["queries with impressions", "low CTR", "position opportunities", "landing-page mismatch"] },
  "/admin/seo/search-console/index-coverage": { pageType: "search_console_coverage", domain: "seo", contextLabel: "SEO & Visibility > Google Coverage", entityType: "indexed_url", purpose: "Compare Google coverage with KONTA MOY indexability intent.", attention: ["excluded intended URLs", "indexed unintended URLs", "canonical differences", "coverage change"] },
  "/admin/platform": { pageType: "platform_overview", domain: "platform", contextLabel: "Platform > Overview", entityType: "system_component", purpose: "Summarize production system readiness and operational dependencies.", attention: ["dependency health", "failed jobs", "integration configuration", "production readiness"] },
  "/admin/operations": { pageType: "platform_health", domain: "platform", contextLabel: "Platform > Health & Audit", entityType: "system_event", purpose: "Investigate technical health, audit activity and operational failures.", attention: ["critical dependencies", "recent failures", "audit anomalies", "recovery state"] },
  "/admin/maintenance": { pageType: "background_jobs", domain: "platform", contextLabel: "Platform > Jobs & Projections", entityType: "background_job", purpose: "Monitor scheduled jobs, projections, queues and recovery work.", attention: ["failed jobs", "consecutive failures", "stale projections", "dead-letter work"] }
};

function domainForGroupHref(href?: string): AdminAssistantDomain {
  if (href === "/admin") return "dashboard";
  if (href === "/admin/work") return "orders";
  if (href === "/admin/partners") return "partners";
  if (href === "/admin/catalogue") return "catalogue";
  if (href === "/admin/finance") return "tax";
  if (href === "/admin/seo") return "seo";
  if (href === "/admin/platform") return "platform";
  return "generic";
}

const NAV_PAGE_ENTRIES: Array<[string, AdminAssistantPageDefinition]> = ADMIN_WORKSPACE_NAVIGATION.flatMap((group) =>
  group.links.map((link): [string, AdminAssistantPageDefinition] => [
    link.href,
    {
      route: link.href,
      pageType: link.href === "/admin" ? "dashboard" : link.href.replace(/^\/admin\/?/, "").replaceAll("/", "_"),
      domain: domainForGroupHref(group.href),
      contextLabel: `${group.label} > ${link.label}`,
      purpose: group.description ?? `Admin workspace for ${link.label}`,
      attention: []
    }
  ])
);

const NAV_PAGES = new Map<string, AdminAssistantPageDefinition>(NAV_PAGE_ENTRIES);

export function adminAssistantPageDefinition(route: string): AdminAssistantPageDefinition {
  const normalized = route === "/admin" ? route : route.replace(/\/$/, "");
  const semantic = SEMANTIC_PAGES[normalized];
  if (semantic) return { route: normalized, ...semantic };

  const orderMatch = /^\/admin\/orders\/([^/]+)$/.exec(normalized);
  if (orderMatch) return {
    route: normalized,
    pageType: "order_detail",
    domain: "orders",
    contextLabel: `Operations > Order ${decodeURIComponent(orderMatch[1] ?? "")}`,
    entityType: "order",
    purpose: "Investigate the complete lifecycle of a single order across payment, fulfilment, tax, accounting and notifications.",
    attention: ["payment state", "fulfilment state", "tax document and MARK", "refund/return state", "timeline anomalies"]
  };

  return NAV_PAGES.get(normalized) ?? {
    route: normalized,
    pageType: "admin_page",
    domain: "generic",
    contextLabel: normalized,
    purpose: "Current KONTA MOY Admin workspace.",
    attention: []
  };
}

export function supportedAdminAssistantPages(): readonly AdminAssistantPageDefinition[] {
  const routes = new Set([...NAV_PAGES.keys(), ...Object.keys(SEMANTIC_PAGES)]);
  return [...routes].sort().map((route) => adminAssistantPageDefinition(route));
}
