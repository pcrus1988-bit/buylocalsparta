"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { WorkspaceNavGroup } from "../lib/workspace-navigation";

export function WorkspaceNavigation({
  id,
  ariaLabel,
  groups,
  onNavigate
}: Readonly<{
  id: string;
  ariaLabel: string;
  groups: ReadonlyArray<WorkspaceNavGroup>;
  onNavigate?: () => void;
}>) {
  const pathname = usePathname();

  return <nav id={id} className="workspace-nav" aria-label={ariaLabel}>
    {groups.map((group, groupIndex) => {
      const activeInGroup = group.links.some((link) => pathname === link.href || (link.href !== "/vendor" && link.href !== "/admin" && pathname.startsWith(`${link.href}/`)));
      return <details className="workspace-nav-group" key={group.label} open={activeInGroup || groupIndex === 0}>
        <summary>
          <span>{group.label}</span>
          <small>{group.links.length}</small>
        </summary>
        <div>
          {group.links.map((link) => {
            const active = pathname === link.href || ((link.href !== "/vendor" && link.href !== "/admin") && pathname.startsWith(`${link.href}/`));
            return <Link
              href={link.href}
              key={link.href}
              className={active ? "is-active" : undefined}
              aria-current={active ? "page" : undefined}
              title={link.label}
              onClick={onNavigate}
            >
              <span className="workspace-link-icon" aria-hidden="true">{link.icon}</span>
              <span>{link.label}</span>
              <i aria-hidden="true">→</i>
            </Link>;
          })}
        </div>
      </details>;
    })}
  </nav>;
}
