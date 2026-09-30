"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { WorkspaceNavGroup } from "../lib/workspace-navigation";
import { AdminCatalogueSuiteNavigation } from "./AdminCatalogueSuiteNavigation";
import { AdminBreadcrumbs, AdminContextNavigation, AdminDomainNavigation } from "./AdminDomainNavigation";
import { AdminNavIcon } from "./AdminNavIcon";

const SHORTCUTS = [
  { href: "/admin/orders", label: "Παραγγελίες" },
  { href: "/admin/delivery", label: "Delivery" },
  { href: "/admin/quickadd", label: "Quick Add" }
] as const;

type AdminCommand = Readonly<{
  href: string;
  label: string;
  groupLabel: string;
  description?: string;
  icon?: string;
}>;

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("el").trim();
}

function commandScore(command: AdminCommand, query: string) {
  if (!query) return 1;
  const label = normalizeSearch(command.label);
  const group = normalizeSearch(command.groupLabel);
  const description = normalizeSearch(command.description ?? "");
  const href = normalizeSearch(command.href);
  if (label === query) return 120;
  if (label.startsWith(query)) return 100;
  if (group.startsWith(query)) return 80;
  if (label.includes(query)) return 70;
  if (description.includes(query)) return 45;
  if (href.includes(query)) return 35;
  return 0;
}

export function AdminWorkspaceHeaderClient({ csrfToken, groups, entityLabel }: { csrfToken: string; groups: ReadonlyArray<WorkspaceNavGroup>; entityLabel?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchShellRef = useRef<HTMLDivElement>(null);
  const availableRoutes = new Set(groups.flatMap((group) => group.links.map((link) => link.href)));
  const shortcuts = SHORTCUTS.filter((shortcut) => availableRoutes.has(shortcut.href));

  const commands = useMemo(() => {
    const seen = new Set<string>();
    return groups.flatMap((group) => group.links.flatMap((link): AdminCommand[] => {
      if (seen.has(link.href) || link.href === "/admin/search") return [];
      seen.add(link.href);
      return [{
        href: link.href,
        label: link.label,
        groupLabel: group.label,
        description: group.description,
        icon: group.icon
      }];
    }));
  }, [groups]);

  const normalizedQuery = normalizeSearch(query);
  const routeResults = useMemo(() => {
    if (!normalizedQuery) {
      const preferred = groups.flatMap((group) => {
        const landing = commands.find((command) => command.href === group.href)
          ?? commands.find((command) => command.groupLabel === group.label);
        return landing ? [landing] : [];
      });
      return preferred.slice(0, 7);
    }
    return commands
      .map((command) => ({ command, score: commandScore(command, normalizedQuery) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.command.label.localeCompare(b.command.label, "el"))
      .slice(0, 8)
      .map((item) => item.command);
  }, [commands, groups, normalizedQuery]);

  const menuItemCount = routeResults.length + (normalizedQuery ? 1 : 0);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setMenuOpen(false);
        setSearchOpen(false);
        setActiveIndex(-1);
      }
    }
    function onPointerDown(event: PointerEvent) {
      if (searchShellRef.current && !searchShellRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
        setActiveIndex(-1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  async function logout() {
    setBusy(true);
    await fetch("/api/admin/logout", { method: "POST", headers: { "x-csrf-token": csrfToken } }).catch(() => undefined);
    router.replace("/admin/login");
    router.refresh();
  }

  function navigate(href: string) {
    setSearchOpen(false);
    setActiveIndex(-1);
    setMenuOpen(false);
    router.push(href);
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (activeIndex >= 0 && activeIndex < routeResults.length) {
      navigate(routeResults[activeIndex].href);
      return;
    }
    if (!trimmed) return;
    navigate(`/admin/search?q=${encodeURIComponent(trimmed)}`);
  }

  function onSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!searchOpen || menuItemCount === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => current >= menuItemCount - 1 ? 0 : current + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => current <= 0 ? menuItemCount - 1 : current - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setSearchOpen(false);
      setActiveIndex(-1);
    }
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
          <div className="admin-global-search-shell" ref={searchShellRef}>
            <form className="admin-global-search" role="search" onSubmit={search}>
              <span aria-hidden="true">⌕</span>
              <input
                ref={searchRef}
                name="q"
                value={query}
                onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); setActiveIndex(-1); }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={onSearchKeyDown}
                aria-label="Αναζήτηση λειτουργίας ή δεδομένων στο Admin"
                aria-expanded={searchOpen}
                aria-controls="admin-command-menu"
                aria-autocomplete="list"
                aria-activedescendant={activeIndex >= 0 ? `admin-command-${activeIndex}` : undefined}
                placeholder="Λειτουργία, παραγγελία, πελάτης, συνεργάτης…"
                autoComplete="off"
              />
              <kbd>⌘K</kbd>
            </form>
            {searchOpen ? <div className="admin-command-menu" id="admin-command-menu" role="listbox" aria-label="Admin search suggestions">
              <div className="admin-command-menu-head">
                <span>{normalizedQuery ? "Λειτουργίες που ταιριάζουν" : "Γρήγορη πρόσβαση"}</span>
                <small>{normalizedQuery ? "↑↓ επιλογή · Enter άνοιγμα" : "Αναζήτησε οποιαδήποτε λειτουργία του Admin"}</small>
              </div>
              <div className="admin-command-results">
                {routeResults.length ? routeResults.map((command, index) => <button
                  id={`admin-command-${index}`}
                  className={activeIndex === index ? "is-active" : undefined}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === index}
                  key={command.href}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => navigate(command.href)}
                >
                  <span className="admin-command-icon" aria-hidden="true"><AdminNavIcon name={command.icon ?? "overview"} /></span>
                  <span className="admin-command-copy"><strong>{command.label}</strong><small>{command.groupLabel}{command.description ? ` · ${command.description}` : ""}</small></span>
                  <code>{command.href.replace("/admin", "") || "/"}</code>
                  <i aria-hidden="true">↗</i>
                </button>) : <div className="admin-command-empty">Δεν βρέθηκε λειτουργία με αυτόν τον όρο.</div>}
                {normalizedQuery ? <button
                  id={`admin-command-${routeResults.length}`}
                  className={activeIndex === routeResults.length ? "is-active admin-command-data-search" : "admin-command-data-search"}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === routeResults.length}
                  onMouseEnter={() => setActiveIndex(routeResults.length)}
                  onClick={() => navigate(`/admin/search?q=${encodeURIComponent(query.trim())}`)}
                >
                  <span className="admin-command-icon is-search" aria-hidden="true"><AdminNavIcon name="search" /></span>
                  <span className="admin-command-copy"><strong>Αναζήτηση δεδομένων για “{query.trim()}”</strong><small>Παραγγελίες, πελάτες, συνεργάτες, applications και support</small></span>
                  <i aria-hidden="true">→</i>
                </button> : null}
              </div>
              <div className="admin-command-footer"><span><kbd>⌘K</kbd> άνοιγμα</span><span><kbd>Esc</kbd> κλείσιμο</span><span>Μόνο λειτουργίες που επιτρέπουν τα δικαιώματά σου</span></div>
            </div> : null}
          </div>
        </div>
      </div>
      <AdminContextNavigation groups={groups} />
    </div>
    <AdminCatalogueSuiteNavigation availableRoutes={availableRoutes} />
  </>;
}
