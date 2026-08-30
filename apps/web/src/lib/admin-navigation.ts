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

export function canAccessAdminNavLink(principal: SessionPrincipal, link: WorkspaceNavLink): boolean {
  if (link.roles?.length && !principal.roles.some((role) => link.roles?.includes(String(role)))) return false;
  return !link.permission || hasAdminPermission(principal, link.permission);
}

function operatorLinksForGroup(group: WorkspaceNavGroup, links: ReadonlyArray<WorkspaceNavLink>): ReadonlyArray<WorkspaceNavLink> {
  if (group.href !== "/admin/partners") return links;
  return links.map((link) => {
    if (PARTNER_PRIMARY_ROUTES.has(link.href)) return { ...link, contextHidden: false };
    if (PARTNER_DRILLDOWN_ROUTES.has(link.href)) return { ...link, contextHidden: true };
    return link;
  });
}

export function adminNavigationForPrincipal(principal: SessionPrincipal, attentionBadges: Readonly<Record<string, number>> = {}): ReadonlyArray<WorkspaceNavGroup> {
  return ADMIN_WORKSPACE_NAVIGATION.flatMap((group): WorkspaceNavGroup[] => {
    const permittedLinks = group.links.filter((link) => canAccessAdminNavLink(principal, link));
    const links = operatorLinksForGroup(group, permittedLinks);
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
  const link = ADMIN_WORKSPACE_NAVIGATION.flatMap((group) => group.links).find((item) => item.href === href);
  return link ? canAccessAdminNavLink(principal, link) : false;
}
