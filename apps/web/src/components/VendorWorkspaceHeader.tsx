"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { VENDOR_WORKSPACE_NAVIGATION } from "../lib/workspace-navigation";
import { VendorBreadcrumbs, VendorContextNavigation, VendorDomainNavigation } from "./VendorDomainNavigation";

// Replaces the older WorkspaceNavigation accordion with domain navigation while preserving every existing route.

export function VendorWorkspaceHeader() {
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

  return <>
    <header className={`workspace-header vendor-header${menuOpen ? " is-menu-open" : ""}`}>
      <div className="workspace-brand-row">
        <Link className="brand workspace-identity" href="/vendor" onClick={() => setMenuOpen(false)}>
          <img src="/brand/kontamou-sparta-logo.webp" alt="ΚΟΝΤΑ ΜΟΥ Sparta" width={78} height={52} style={{ display: "block", width: "78px", height: "52px", objectFit: "contain" }} />
          <span><strong>Χώρος συνεργάτη</strong><small>ΚΟΝΤΑ ΜΟΥ Sparta</small></span>
        </Link>
        <button className="workspace-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="vendor-workspace-navigation" onClick={() => setMenuOpen((current) => !current)}>
          <span>{menuOpen ? "Κλείσιμο" : "Μενού"}</span><i aria-hidden="true" />
        </button>
      </div>
      <VendorDomainNavigation id="vendor-workspace-navigation" groups={VENDOR_WORKSPACE_NAVIGATION} onNavigate={() => setMenuOpen(false)} />
      <div className="workspace-footer workspace-footer-stacked">
        <span className="workspace-session"><i aria-hidden="true" /> Online · ιδιωτικό scope</span>
        <div className="workspace-footer-actions">
          <Link className="workspace-footer-action workspace-public-link" href="/" onClick={() => setMenuOpen(false)}>Δημόσιο site <span aria-hidden="true">↗</span></Link>
          <button className="workspace-footer-action" type="button" onClick={logout} disabled={busy}>{busy ? "Έξοδος…" : "Αποσύνδεση"}<span aria-hidden="true">↗</span></button>
        </div>
      </div>
    </header>
    <div className="vendor-topbar">
      <div className="vendor-topbar-main">
        <div className="vendor-breadcrumbs"><VendorBreadcrumbs groups={VENDOR_WORKSPACE_NAVIGATION} /></div>
        <Link className="vendor-daily-launch" href="/daily">Άνοιγμα KONTA MOY Daily <span aria-hidden="true">↗</span></Link>
      </div>
      <VendorContextNavigation groups={VENDOR_WORKSPACE_NAVIGATION} />
    </div>
  </>;
}
