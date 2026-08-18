"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { VENDOR_WORKSPACE_NAVIGATION } from "../lib/workspace-navigation";

export function VendorWorkspaceHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      const session = await fetch("/api/vendor/session", { cache: "no-store" });
      if (!session.ok) {
        router.replace("/vendor/login");
        router.refresh();
        return;
      }
      const payload = await session.json() as { csrfToken?: string };
      if (!payload.csrfToken) throw new Error("vendor_session_missing_csrf");
      await fetch("/api/vendor/logout", { method: "POST", headers: { "x-csrf-token": payload.csrfToken } });
      router.replace("/vendor/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return <header className={`workspace-header${menuOpen ? " is-menu-open" : ""}`}>
    <div className="workspace-brand-row">
      <Link className="brand workspace-identity" href="/vendor" onClick={() => setMenuOpen(false)}><span className="brand-mark">BLS</span><span><strong>Χώρος συνεργάτη</strong><small>Buy Local Sparta</small></span></Link>
      <button className="workspace-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="vendor-workspace-navigation" onClick={() => setMenuOpen((current) => !current)}><span>{menuOpen ? "Κλείσιμο" : "Μενού"}</span><i aria-hidden="true" /></button>
    </div>
    <div className="workspace-context"><span>Merchant workspace</span><strong>Καθημερινή λειτουργία</strong><small><i aria-hidden="true" /> Ιδιωτικό scope καταστήματος</small></div>
    <nav id="vendor-workspace-navigation" className="workspace-nav" aria-label="Χώρος συνεργάτη">
      {VENDOR_WORKSPACE_NAVIGATION.map((group, groupIndex) => <div className="workspace-nav-group" key={group.label}><span className="workspace-nav-label">{group.label}</span><div>{group.links.map((link, linkIndex) => {
        const active = pathname === link.href || (link.href !== "/vendor" && pathname.startsWith(`${link.href}/`));
        return <Link href={link.href} key={link.href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined} onClick={() => setMenuOpen(false)}><span className="workspace-link-index" aria-hidden="true">{groupIndex + 1}.{linkIndex + 1}</span><span>{link.label}</span><i aria-hidden="true">→</i></Link>;
      })}</div></div>)}
    </nav>
    <div className="workspace-footer workspace-footer-stacked">
      <span className="workspace-session"><i aria-hidden="true" /> Workspace online</span>
      <div className="workspace-footer-actions"><Link className="workspace-footer-action workspace-public-link" href="/" onClick={() => setMenuOpen(false)}>Δημόσιο site <span aria-hidden="true">↗</span></Link><button className="workspace-footer-action" type="button" onClick={logout} disabled={busy}>{busy ? "Έξοδος…" : "Αποσύνδεση"}<span aria-hidden="true">↗</span></button></div>
    </div>
  </header>;
}
