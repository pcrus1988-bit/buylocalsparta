"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { WorkspaceNavGroup, WorkspaceNavLink } from "../lib/workspace-navigation";

function matches(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function activeLink(pathname: string, links: ReadonlyArray<WorkspaceNavLink>) {
  return [...links].filter((link) => matches(pathname, link.href)).sort((a, b) => b.href.length - a.href.length)[0];
}

function activeContext(pathname: string, groups: ReadonlyArray<WorkspaceNavGroup>) {
  return groups.flatMap((group) => group.links
    .filter((link) => matches(pathname, link.href))
    .map((link) => ({ group, link })))
    .sort((a, b) => b.link.href.length - a.link.href.length)[0];
}

export function AdminDomainNavigation({ id, groups, onNavigate }: Readonly<{ id: string; groups: ReadonlyArray<WorkspaceNavGroup>; onNavigate?: () => void }>) {
  const pathname = usePathname();
  const current = activeContext(pathname, groups);
  return <nav id={id} className="admin-domain-nav" aria-label="Admin domains">
    {groups.map((group) => {
      const href = group.href ?? group.links.find((link) => !link.contextHidden)?.href ?? group.links[0]?.href ?? "/admin";
      const active = current?.group.label === group.label;
      const badgeLabel = group.badge && group.badge > 99 ? "99+" : group.badge;
      return <Link href={href} key={group.label} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined} onClick={onNavigate}>
        <span className="admin-domain-icon" aria-hidden="true">{group.icon ?? group.links[0]?.icon ?? "·"}</span>
        <span className="admin-domain-label">{group.label}</span>
        <span className={`admin-domain-badge${group.badge ? "" : " is-empty"}`} aria-label={group.badge ? `${group.badge} items need attention` : undefined} aria-hidden={group.badge ? undefined : true}>{badgeLabel ?? ""}</span>
        <i aria-hidden="true">›</i>
      </Link>;
    })}
  </nav>;
}

export function AdminContextNavigation({ groups }: Readonly<{ groups: ReadonlyArray<WorkspaceNavGroup> }>) {
  const pathname = usePathname();
  const group = activeContext(pathname, groups)?.group;
  if (!group) return null;
  const links = group.links.filter((link) => !link.contextHidden);
  if (links.length <= 1) return null;
  const current = activeLink(pathname, links);
  return <nav className="admin-context-nav" aria-label={`${group.label} sections`}>
    {links.map((link) => <Link href={link.href} key={link.href} className={current?.href === link.href ? "is-active" : undefined} aria-current={current?.href === link.href ? "page" : undefined}>{link.label}</Link>)}
  </nav>;
}

export function AdminBreadcrumbs({ groups }: Readonly<{ groups: ReadonlyArray<WorkspaceNavGroup> }>) {
  const pathname = usePathname();
  const context = activeContext(pathname, groups);
  const group = context?.group;
  const current = context?.link;
  if (!group || group.href === "/admin") return <span className="admin-breadcrumb-current">Επισκόπηση</span>;
  return <><Link href="/admin">Admin</Link><span aria-hidden="true">/</span><Link href={group.href ?? current?.href ?? "/admin"}>{group.label}</Link>{current && current.href !== group.href && <><span aria-hidden="true">/</span><span className="admin-breadcrumb-current">{current.label}</span></>}</>;
}
