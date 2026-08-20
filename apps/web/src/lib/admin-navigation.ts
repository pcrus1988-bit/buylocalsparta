import type { SessionPrincipal } from "@buy-local-sparta/core";
import { hasAdminPermission } from "./admin-runtime";
import { ADMIN_WORKSPACE_NAVIGATION, type WorkspaceNavGroup, type WorkspaceNavLink } from "./workspace-navigation";

export function canAccessAdminNavLink(principal: SessionPrincipal, link: WorkspaceNavLink): boolean {
  return !link.permission || hasAdminPermission(principal, link.permission);
}

export function adminNavigationForPrincipal(principal: SessionPrincipal): ReadonlyArray<WorkspaceNavGroup> {
  return ADMIN_WORKSPACE_NAVIGATION
    .map((group) => {
      const links = group.links.filter((link) => canAccessAdminNavLink(principal, link));
      if (links.length === 0) return undefined;
      const requestedLanding = group.href;
      const landing = requestedLanding && links.some((link) => link.href === requestedLanding)
        ? requestedLanding
        : links.find((link) => !link.contextHidden)?.href ?? links[0]?.href;
      return { ...group, href: landing, links };
    })
    .filter((group): group is WorkspaceNavGroup => Boolean(group));
}

export function canAccessAdminRoute(principal: SessionPrincipal, href: string): boolean {
  const link = ADMIN_WORKSPACE_NAVIGATION.flatMap((group) => group.links).find((item) => item.href === href);
  return link ? canAccessAdminNavLink(principal, link) : false;
}
