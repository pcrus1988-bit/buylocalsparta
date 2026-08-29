import type { SessionPrincipal } from "@buy-local-sparta/core";
import { hasAdminPermission } from "./admin-runtime";
import { ADMIN_WORKSPACE_NAVIGATION, type WorkspaceNavGroup, type WorkspaceNavLink } from "./workspace-navigation";

export function canAccessAdminNavLink(principal: SessionPrincipal, link: WorkspaceNavLink): boolean {
  if (link.roles?.length && !principal.roles.some((role) => link.roles?.includes(String(role)))) return false;
  return !link.permission || hasAdminPermission(principal, link.permission);
}

export function adminNavigationForPrincipal(principal: SessionPrincipal, attentionBadges: Readonly<Record<string, number>> = {}): ReadonlyArray<WorkspaceNavGroup> {
  return ADMIN_WORKSPACE_NAVIGATION.flatMap((group): WorkspaceNavGroup[] => {
    const links = group.links.filter((link) => canAccessAdminNavLink(principal, link));
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
