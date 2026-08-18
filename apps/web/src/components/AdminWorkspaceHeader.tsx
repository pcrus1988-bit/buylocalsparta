"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ADMIN_WORKSPACE_NAVIGATION } from "../lib/workspace-navigation";

// Production invariant: activation evidence remains exposed through the canonical /admin/activation workspace route.
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
      <button className="workspace-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="admin-workspace-navigation" onClick={() => setMenuOpen((current) => !current)}><span>{menuOpen ? "Κλείσιμο" : "Μενού"}</span><i aria-hidden="true" /></button>
    </div>
    <div className="workspace-context"><span>Platform workspace</span><strong>Λειτουργία & διακυβέρνηση</strong><small><i aria-hidden="true" /> Ασφαλής admin συνεδρία</small></div>
    <nav id="admin-workspace-navigation" className="workspace-nav workspace-nav-admin" aria-label="Admin workspace">
      {ADMIN_WORKSPACE_NAVIGATION.map((group, groupIndex) => <div className="workspace-nav-group" key={group.label}><span className="workspace-nav-label">{group.label}</span><div>{group.links.map((link, linkIndex) => {
        const active = pathname === link.href || (link.href !== "/admin" && pathname.startsWith(`${link.href}/`));
        return <Link href={link.href} key={link.href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined} onClick={() => setMenuOpen(false)}><span className="workspace-link-index" aria-hidden="true">{groupIndex + 1}.{linkIndex + 1}</span><span>{link.label}</span><i aria-hidden="true">→</i></Link>;
      })}</div></div>)}
    </nav>
    <div className="workspace-footer workspace-footer-stacked"><span className="workspace-session"><i aria-hidden="true" /> System operational</span><div className="workspace-footer-actions"><Link className="workspace-footer-action" href="/" onClick={() => setMenuOpen(false)}>Δημόσιο site <span aria-hidden="true">↗</span></Link><button className="workspace-footer-action admin-logout" type="button" onClick={logout} disabled={busy}>{busy ? "Έξοδος…" : "Αποσύνδεση"}<span aria-hidden="true">↗</span></button></div></div>
  </header>;
}
