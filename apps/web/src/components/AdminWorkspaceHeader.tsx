"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const groups = [
  { label: "Operations", links: [["Overview", "/admin"], ["Orders", "/admin/orders"], ["Shipping", "/admin/shipping"], ["Jobs", "/admin/maintenance"], ["Activation", "/admin/activation"]] },
  { label: "Commerce", links: [["Research", "/admin/research-vendors"], ["Vendors", "/admin/vendors"], ["Matching", "/admin/matching"], ["Categories", "/admin/categories"], ["CMS", "/admin/content"]] },
  { label: "Trust", links: [["Trust", "/admin/trust"], ["Reviews", "/admin/reviews"], ["Recalls", "/admin/recalls"], ["Privacy", "/admin/privacy"]] },
  { label: "Intelligence", links: [["Finance", "/admin/finance"], ["Tax", "/admin/tax"], ["Fairness", "/admin/fairness"], ["Analytics", "/admin/analytics"], ["System", "/admin/operations"]] }
] as const;

export function AdminWorkspaceHeader({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  async function logout() {
    setBusy(true);
    await fetch("/api/admin/logout", { method: "POST", headers: { "x-csrf-token": csrfToken } }).catch(() => undefined);
    router.replace("/admin/login");
    router.refresh();
  }
  return <header className={`workspace-header admin-header${menuOpen ? " is-menu-open" : ""}`}>
    <div className="workspace-brand-row">
      <Link className="brand workspace-identity" href="/admin" onClick={() => setMenuOpen(false)}><span className="brand-mark">BLS</span><span><strong>Command Centre</strong><small>Governed operations</small></span></Link>
      <button className="workspace-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="admin-workspace-navigation" onClick={() => setMenuOpen((current) => !current)}><span>{menuOpen ? "Close" : "Menu"}</span><i aria-hidden="true" /></button>
    </div>
    <div className="workspace-context"><span>Platform workspace</span><strong>Operations & governance</strong><small><i aria-hidden="true" /> Secure admin session</small></div>
    <nav id="admin-workspace-navigation" className="workspace-nav workspace-nav-admin" aria-label="Admin workspace">
      {groups.map((group, groupIndex) => <div className="workspace-nav-group" key={group.label}><span className="workspace-nav-label">{group.label}</span><div>{group.links.map(([label, href], linkIndex) => {
        const active = pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
        return <Link href={href} key={href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined} onClick={() => setMenuOpen(false)}><span className="workspace-link-index" aria-hidden="true">{groupIndex + 1}.{linkIndex + 1}</span><span>{label}</span><i aria-hidden="true">→</i></Link>;
      })}</div></div>)}
    </nav>
    <div className="workspace-footer"><span className="workspace-session"><i aria-hidden="true" /> System operational</span><button className="workspace-footer-action admin-logout" type="button" onClick={logout} disabled={busy}>{busy ? "Signing out…" : "Sign out"}<span aria-hidden="true">↗</span></button></div>
  </header>;
}
