"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { WorkspaceNavGroup, WorkspaceNavLink } from "../lib/workspace-navigation";
import { AdminNavIcon } from "./AdminNavIcon";

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
    {groups.map((group, index) => {
      const href = group.href ?? group.links.find((link) => !link.contextHidden)?.href ?? group.links[0]?.href ?? "/admin";
      const active = current?.group.label === group.label;
      const badgeLabel = group.badge && group.badge > 99 ? "99+" : group.badge;
      const showSection = Boolean(group.section && group.section !== groups[index - 1]?.section);
      return <Fragment key={group.label}>
        {showSection ? <span className="admin-nav-section-label">{group.section}</span> : null}
        <Link href={href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined} onClick={onNavigate} title={group.description}>
          <span className="admin-domain-icon" aria-hidden="true"><AdminNavIcon name={group.icon ?? "overview"} /></span>
          <span className="admin-domain-copy"><strong>{group.label}</strong>{group.description ? <small>{group.description}</small> : null}</span>
          <span className={`admin-domain-badge${group.badge ? "" : " is-empty"}`} aria-label={group.badge ? `${group.badge} items need attention` : undefined} aria-hidden={group.badge ? undefined : true}>{badgeLabel ?? ""}</span>
          <i aria-hidden="true">›</i>
        </Link>
      </Fragment>;
    })}
  </nav>;
}

export function AdminContextNavigation({ groups }: Readonly<{ groups: ReadonlyArray<WorkspaceNavGroup> }>) {
  const pathname = usePathname();
  const group = activeContext(pathname, groups)?.group;
  if (!group) return null;
  const links = group.links.filter((link) => !link.contextHidden);
  const current = activeLink(pathname, links);
  return <div className="admin-context-shell">
    <div className="admin-context-heading">
      <span className="admin-context-icon" aria-hidden="true"><AdminNavIcon name={group.icon ?? "overview"} /></span>
      <span><small>Workspace</small><strong>{group.label}</strong></span>
    </div>
    {links.length > 1 ? <nav className="admin-context-nav" aria-label={`${group.label} sections`}>
      {links.map((link) => <Link href={link.href} key={link.href} className={current?.href === link.href ? "is-active" : undefined} aria-current={current?.href === link.href ? "page" : undefined}>{link.label}</Link>)}
    </nav> : <span className="admin-context-description">{group.description}</span>}
  </div>;
}

export function AdminBreadcrumbs({ groups, entityLabel }: Readonly<{ groups: ReadonlyArray<WorkspaceNavGroup>; entityLabel?: string }>) {
  const pathname = usePathname();
  const context = activeContext(pathname, groups);
  const group = context?.group;
  const current = context?.link;
  if (!group || group.href === "/admin") return <span className="admin-breadcrumb-current">{entityLabel ?? "Επισκόπηση"}</span>;
  return <>
    <Link href="/admin">Admin</Link>
    <span aria-hidden="true">/</span>
    <Link href={group.href ?? current?.href ?? "/admin"}>{group.label}</Link>
    {current && current.href !== group.href && <><span aria-hidden="true">/</span><span className={entityLabel ? undefined : "admin-breadcrumb-current"}>{current.label}</span></>}
    {entityLabel && <><span aria-hidden="true">/</span><span className="admin-breadcrumb-current">{entityLabel}</span></>}
  </>;
}
