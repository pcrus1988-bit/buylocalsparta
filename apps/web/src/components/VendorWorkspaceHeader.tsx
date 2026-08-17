"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const groups = [
  { label: "Operations", links: [["Επισκόπηση", "/vendor"], ["Κατάλογος", "/vendor/catalog"], ["Advice", "/vendor/advice"], ["Shipping", "/vendor/shipping"], ["Returns", "/vendor/returns"]] },
  { label: "Business", links: [["Trust", "/vendor/trust"], ["Finance", "/vendor/finance"], ["Analytics", "/vendor/analytics"]] }
] as const;

export function VendorWorkspaceHeader() {
  const pathname = usePathname();
  return <header className="workspace-header shell">
    <Link className="brand workspace-identity" href="/vendor"><span className="brand-mark">BLS</span><span><strong>Vendor workspace</strong><small>Buy Local Sparta</small></span></Link>
    <nav className="workspace-nav" aria-label="Vendor workspace">
      {groups.map((group) => <div className="workspace-nav-group" key={group.label}><span className="workspace-nav-label">{group.label}</span><div>{group.links.map(([label, href]) => {
        const active = pathname === href || (href !== "/vendor" && pathname.startsWith(`${href}/`));
        return <Link href={href} key={href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>{label}</Link>;
      })}</div></div>)}
    </nav>
    <Link className="workspace-public-link" href="/">Public site ↗</Link>
  </header>;
}
