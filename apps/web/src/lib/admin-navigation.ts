import type { SessionPrincipal } from "@buy-local-sparta/core";
import { hasAdminPermission } from "./admin-runtime";
import { ADMIN_WORKSPACE_NAVIGATION, type WorkspaceNavGroup, type WorkspaceNavLink } from "./workspace-navigation";

export function canAccessAdminNavLink(principal: SessionPrincipal, link: WorkspaceNavLink): boolean {
  return !link.permission || hasAdminPermission(principal, link.permission);
}

export function adminNavigationForPrincipal(principal: SessionPrincipal): ReadonlyArray<WorkspaceNavGroup> {
  return ADMIN_WORKSPACE_NAVIGATION
    .map((group) => ({ ...group, links: group.links.filter((link) => canAccessAdminNavLink(principal, link)) }))
    .filter((group) => group.links.length > 0);
}

export function canAccessAdminRoute(principal: SessionPrincipal, href: string): boolean {
  const link = ADMIN_WORKSPACE_NAVIGATION.flatMap((group) => group.links).find((item) => item.href === href);
  return link ? canAccessAdminNavLink(principal, link) : false;
}
