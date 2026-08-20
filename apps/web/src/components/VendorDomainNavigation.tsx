"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { WorkspaceNavGroup, WorkspaceNavLink } from "../lib/workspace-navigation";

function matches(pathname: string, href: string) {
  if (href === "/vendor") return pathname === href;
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

export function VendorDomainNavigation({ id, groups, onNavigate }: Readonly<{ id: string; groups: ReadonlyArray<WorkspaceNavGroup>; onNavigate?: () => void }>) {
  const pathname = usePathname();
  const current = activeContext(pathname, groups);
  return <nav id={id} className="vendor-domain-nav" aria-label="Χώρος συνεργάτη">
    {groups.map((group) => {
      const href = group.href ?? group.links.find((link) => !link.contextHidden)?.href ?? group.links[0]?.href ?? "/vendor";
      const active = current?.group.label === group.label;
      return <Link href={href} key={group.label} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined} onClick={onNavigate}>
        <span className="vendor-domain-icon" aria-hidden="true">{group.icon ?? group.links[0]?.icon ?? "·"}</span>
        <span>{group.label}</span>
        <i aria-hidden="true">›</i>
      </Link>;
    })}
  </nav>;
}

export function VendorContextNavigation({ groups }: Readonly<{ groups: ReadonlyArray<WorkspaceNavGroup> }>) {
  const pathname = usePathname();
  const group = activeContext(pathname, groups)?.group;
  if (!group) return null;
  const links = group.links.filter((link) => !link.contextHidden);
  if (links.length <= 1) return null;
  const current = activeLink(pathname, links);
  return <nav className="vendor-context-nav" aria-label={`${group.label} sections`}>
    {links.map((link) => <Link href={link.href} key={link.href} className={current?.href === link.href ? "is-active" : undefined} aria-current={current?.href === link.href ? "page" : undefined}>{link.label}</Link>)}
  </nav>;
}

export function VendorBreadcrumbs({ groups }: Readonly<{ groups: ReadonlyArray<WorkspaceNavGroup> }>) {
  const pathname = usePathname();
  const context = activeContext(pathname, groups);
  const group = context?.group;
  const current = context?.link;
  if (!group || group.href === "/vendor") return <span className="vendor-breadcrumb-current">Αρχική</span>;
  return <>
    <Link href="/vendor">Συνεργάτης</Link>
    <span aria-hidden="true">/</span>
    <Link href={group.href ?? current?.href ?? "/vendor"}>{group.label}</Link>
    {current && current.href !== group.href && <>
      <span aria-hidden="true">/</span>
      <span className="vendor-breadcrumb-current">{current.label}</span>
    </>}
  </>;
}
