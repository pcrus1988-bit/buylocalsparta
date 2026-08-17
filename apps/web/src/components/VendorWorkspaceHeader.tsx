"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const groups = [
  { label: "Operations", links: [["Επισκόπηση", "/vendor"], ["Κατάλογος", "/vendor/catalog"], ["Advice", "/vendor/advice"], ["Shipping", "/vendor/shipping"], ["Returns", "/vendor/returns"]] },
  { label: "Business", links: [["Trust", "/vendor/trust"], ["Finance", "/vendor/finance"], ["Analytics", "/vendor/analytics"]] }
] as const;

export function VendorWorkspaceHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className={`workspace-header${menuOpen ? " is-menu-open" : ""}`}>
    <div className="workspace-brand-row">
      <Link className="brand workspace-identity" href="/vendor" onClick={() => setMenuOpen(false)}><span className="brand-mark">BLS</span><span><strong>Vendor workspace</strong><small>Buy Local Sparta</small></span></Link>
      <button className="workspace-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="vendor-workspace-navigation" onClick={() => setMenuOpen((current) => !current)}><span>{menuOpen ? "Κλείσιμο" : "Μενού"}</span><i aria-hidden="true" /></button>
    </div>
    <div className="workspace-context"><span>Merchant workspace</span><strong>Daily operations</strong><small><i aria-hidden="true" /> Private vendor scope</small></div>
    <nav id="vendor-workspace-navigation" className="workspace-nav" aria-label="Vendor workspace">
      {groups.map((group, groupIndex) => <div className="workspace-nav-group" key={group.label}><span className="workspace-nav-label">{group.label}</span><div>{group.links.map(([label, href], linkIndex) => {
        const active = pathname === href || (href !== "/vendor" && pathname.startsWith(`${href}/`));
        return <Link href={href} key={href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined} onClick={() => setMenuOpen(false)}><span className="workspace-link-index" aria-hidden="true">{groupIndex + 1}.{linkIndex + 1}</span><span>{label}</span><i aria-hidden="true">→</i></Link>;
      })}</div></div>)}
    </nav>
    <div className="workspace-footer"><span className="workspace-session"><i aria-hidden="true" /> Workspace online</span><Link className="workspace-footer-action workspace-public-link" href="/" onClick={() => setMenuOpen(false)}>Public site <span aria-hidden="true">↗</span></Link></div>
  </header>;
}
