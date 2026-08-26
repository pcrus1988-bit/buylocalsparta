"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { WorkspaceNavGroup } from "../lib/workspace-navigation";
import { AdminBreadcrumbs, AdminContextNavigation, AdminDomainNavigation } from "./AdminDomainNavigation";

const SHORTCUTS = [
  { href: "/admin/orders", label: "Παραγγελίες" },
  { href: "/admin/delivery", label: "Delivery" },
  { href: "/admin/quickadd", label: "Quick Add" }
] as const;

export function AdminWorkspaceHeaderClient({ csrfToken, groups, entityLabel }: { csrfToken: string; groups: ReadonlyArray<WorkspaceNavGroup>; entityLabel?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const availableRoutes = new Set(groups.flatMap((group) => group.links.map((link) => link.href)));
  const shortcuts = SHORTCUTS.filter((shortcut) => availableRoutes.has(shortcut.href));

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function logout() {
    setBusy(true);
    await fetch("/api/admin/logout", { method: "POST", headers: { "x-csrf-token": csrfToken } }).catch(() => undefined);
    router.replace("/admin/login");
    router.refresh();
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchRef.current?.value.trim();
    if (!query) return;
    setMenuOpen(false);
    router.push(`/admin/search?q=${encodeURIComponent(query)}`);
  }

  return <>
    <header className={`workspace-header admin-header${menuOpen ? " is-menu-open" : ""}`}>
      <div className="workspace-brand-row">
        <Link className="brand workspace-identity" href="/admin" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark">KM</span>
          <span><strong>ΚΟΝΤΑ ΜΟΥ</strong><small>Admin Control Centre</small></span>
        </Link>
        <button className="workspace-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="admin-workspace-navigation" onClick={() => setMenuOpen((current) => !current)}><span>{menuOpen ? "Κλείσιμο" : "Μενού"}</span><i aria-hidden="true" /></button>
      </div>
      <AdminDomainNavigation id="admin-workspace-navigation" groups={groups} onNavigate={() => setMenuOpen(false)} />
      <div className="workspace-footer workspace-footer-stacked">
        <span className="workspace-session"><i aria-hidden="true" /> Admin · ασφαλής συνεδρία</span>
        <div className="workspace-footer-actions">
          <Link className="workspace-footer-action" href="/" onClick={() => setMenuOpen(false)}>Δημόσιο site <span aria-hidden="true">↗</span></Link>
          <button className="workspace-footer-action admin-logout" type="button" onClick={logout} disabled={busy}>{busy ? "Έξοδος…" : "Αποσύνδεση"}</button>
        </div>
      </div>
    </header>
    <div className="admin-topbar">
      <div className="admin-topbar-main">
        <div className="admin-breadcrumbs"><AdminBreadcrumbs groups={groups} entityLabel={entityLabel} /></div>
        <div className="admin-topbar-tools">
          {shortcuts.length ? <nav className="admin-topbar-shortcuts" aria-label="Γρήγορες ενέργειες">{shortcuts.map((shortcut) => <Link href={shortcut.href} key={shortcut.href}>{shortcut.label}</Link>)}</nav> : null}
          <form className="admin-global-search" role="search" onSubmit={search}>
            <span aria-hidden="true">⌕</span>
            <input ref={searchRef} name="q" aria-label="Αναζήτηση στο Admin" placeholder="Παραγγελία, πελάτης, συνεργάτης, ticket…" autoComplete="off" />
            <kbd>⌘K</kbd>
          </form>
        </div>
      </div>
      <AdminContextNavigation groups={groups} />
    </div>
  </>;
}
