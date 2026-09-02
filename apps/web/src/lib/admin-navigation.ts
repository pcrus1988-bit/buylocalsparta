import type { SessionPrincipal } from "@buy-local-sparta/core";
import { hasAdminPermission } from "./admin-runtime";
import { ADMIN_WORKSPACE_NAVIGATION, type WorkspaceNavGroup, type WorkspaceNavLink } from "./workspace-navigation";

const PARTNER_PRIMARY_ROUTES = new Set([
  "/admin/partners",
  "/admin/vendors",
  "/admin/partners/pipeline",
  "/admin/applications",
  "/admin/research-vendors",
  "/admin/prospects"
]);
const PARTNER_DRILLDOWN_ROUTES = new Set([
  "/admin/finance/agreements",
  "/admin/finance/agreements/sla"
]);

const ICECAT_NAV_LINK: WorkspaceNavLink = {
  label: "Icecat",
  href: "/admin/icecat",
  icon: "◈",
  permission: "catalog.read"
};

const CATALOGUE_OPERATOR_LINKS = new Map<string, { order: number; label?: string; contextHidden?: boolean }>([
  ["/admin/catalogue", { order: 0, label: "Overview" }],
  ["/admin/quickadd", { order: 1, label: "Quick Add" }],
  ["/admin/catalogue-crawler", { order: 2, label: "Website Import" }],
  ["/admin/icecat", { order: 3, label: "Icecat" }],
  ["/admin/catalogue-intake/import", { order: 4, label: "Files & Icecat", contextHidden: false }],
  ["/admin/catalogue-intake", { order: 5, label: "Supplier PIM" }],
  ["/admin/catalogue-intake/attributes", { order: 6, label: "Attributes" }],
  ["/admin/matching", { order: 7, label: "Matching" }],
  ["/admin/categories", { order: 8, label: "Categories & Policies" }]
]);

const TRUST_OPERATOR_LINKS = new Map<string, { order: number; label?: string }>([
  ["/admin/trust", { order: 0, label: "Media & Compliance" }],
  ["/admin/recalls", { order: 1, label: "Product Safety" }],
  ["/admin/reviews", { order: 2, label: "Reviews" }],
  ["/admin/privacy", { order: 3, label: "Privacy" }],
  ["/admin/accessibility", { order: 4, label: "Accessibility" }],
  ["/admin/fairness", { order: 5, label: "Fairness" }]
]);

const ANALYTICS_OPERATOR_LINKS = new Map<string, { order: number; label?: string }>([
  ["/admin/analytics", { order: 0, label: "Performance" }],
  ["/admin/demand", { order: 1, label: "Demand" }],
  ["/admin/reports", { order: 2, label: "Reports" }]
]);

const CONTENT_OPERATOR_LINKS = new Map<string, { order: number; label?: string }>([
  ["/admin/content", { order: 0, label: "CMS & Routing" }],
  ["/admin/hero", { order: 1, label: "Homepage" }],
  ["/admin/email-lab", { order: 2, label: "Email" }]
]);

const PLATFORM_OPERATOR_LINKS = new Map<string, { order: number; label?: string }>([
  ["/admin/platform", { order: 0, label: "Overview" }],
  ["/admin/operations", { order: 1, label: "Health & Audit" }],
  ["/admin/maintenance", { order: 2, label: "Jobs & Projections" }],
  ["/admin/shipping", { order: 3, label: "BOX NOW" }],
  ["/admin/activation", { order: 4, label: "Production Readiness" }]
]);

export function canAccessAdminNavLink(principal: SessionPrincipal, link: WorkspaceNavLink): boolean {
  if (link.roles?.length && !principal.roles.some((role) => link.roles?.includes(String(role)))) return false;
  return !link.permission || hasAdminPermission(principal, link.permission);
}

function operatorLinksForGroup(group: WorkspaceNavGroup, links: ReadonlyArray<WorkspaceNavLink>): ReadonlyArray<WorkspaceNavLink> {
  if (group.href === "/admin/partners") {
    return links.map((link) => {
      if (PARTNER_PRIMARY_ROUTES.has(link.href)) return { ...link, contextHidden: false };
      if (PARTNER_DRILLDOWN_ROUTES.has(link.href)) return { ...link, contextHidden: true };
      return link;
    });
  }

  if (group.href === "/admin/catalogue") {
    const catalogueLinks = links.some((link) => link.href === ICECAT_NAV_LINK.href)
      ? links
      : [...links, ICECAT_NAV_LINK];
    return catalogueLinks
      .map((link) => {
        const presentation = CATALOGUE_OPERATOR_LINKS.get(link.href);
        return presentation ? {
          ...link,
          label: presentation.label ?? link.label,
          contextHidden: presentation.contextHidden ?? link.contextHidden
        } : link;
      })
      .sort((a, b) => (CATALOGUE_OPERATOR_LINKS.get(a.href)?.order ?? 99) - (CATALOGUE_OPERATOR_LINKS.get(b.href)?.order ?? 99));
  }

  if (group.href === "/admin/trust") {
    return links
      .map((link) => {
        const presentation = TRUST_OPERATOR_LINKS.get(link.href);
        return presentation ? { ...link, label: presentation.label ?? link.label } : link;
      })
      .sort((a, b) => (TRUST_OPERATOR_LINKS.get(a.href)?.order ?? 99) - (TRUST_OPERATOR_LINKS.get(b.href)?.order ?? 99));
  }

  if (group.href === "/admin/analytics") {
    return links
      .map((link) => {
        const presentation = ANALYTICS_OPERATOR_LINKS.get(link.href);
        return presentation ? { ...link, label: presentation.label ?? link.label } : link;
      })
      .sort((a, b) => (ANALYTICS_OPERATOR_LINKS.get(a.href)?.order ?? 99) - (ANALYTICS_OPERATOR_LINKS.get(b.href)?.order ?? 99));
  }

  if (group.href === "/admin/content") {
    return links
      .map((link) => {
        const presentation = CONTENT_OPERATOR_LINKS.get(link.href);
        return presentation ? { ...link, label: presentation.label ?? link.label } : link;
      })
      .sort((a, b) => (CONTENT_OPERATOR_LINKS.get(a.href)?.order ?? 99) - (CONTENT_OPERATOR_LINKS.get(b.href)?.order ?? 99));
  }

  if (group.href === "/admin/platform") {
    return links
      .map((link) => {
        const presentation = PLATFORM_OPERATOR_LINKS.get(link.href);
        return presentation ? { ...link, label: presentation.label ?? link.label } : link;
      })
      .sort((a, b) => (PLATFORM_OPERATOR_LINKS.get(a.href)?.order ?? 99) - (PLATFORM_OPERATOR_LINKS.get(b.href)?.order ?? 99));
  }

  return links;
}

export function adminNavigationForPrincipal(principal: SessionPrincipal, attentionBadges: Readonly<Record<string, number>> = {}): ReadonlyArray<WorkspaceNavGroup> {
  return ADMIN_WORKSPACE_NAVIGATION.flatMap((group): WorkspaceNavGroup[] => {
    const permittedLinks = group.links.filter((link) => canAccessAdminNavLink(principal, link));
    const links = operatorLinksForGroup(group, permittedLinks).filter((link) => canAccessAdminNavLink(principal, link));
    if (links.length === 0) return [];
    const requestedLanding = group.href;
    const landing = requestedLanding && links.some((link) => link.href === requestedLanding)
      ? requestedLanding
      : links.find((link) => !link.contextHidden)?.href ?? links[0]?.href;
    const badge = group.href ? attentionBadges[group.href] : undefined;
    return [{ ...group, href: landing, links, badge: badge && badge > 0 ? badge : undefined }];
  });
}

export function canAccessAdminRoute(principal: SessionPrincipal, href: string): boolean {
  if (href === ICECAT_NAV_LINK.href) return canAccessAdminNavLink(principal, ICECAT_NAV_LINK);
  const link = ADMIN_WORKSPACE_NAVIGATION.flatMap((group) => group.links).find((item) => item.href === href);
  return link ? canAccessAdminNavLink(principal, link) : false;
}
