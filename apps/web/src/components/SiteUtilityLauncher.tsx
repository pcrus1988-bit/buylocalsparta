"use client";

import { useEffect, useId, useRef, useState } from "react";
import { requestAccessibilitySettings } from "./AccessibilityPreferences";
import { requestCookieSettings } from "./PrivacyConsentProvider";

const HIDDEN_KEY = "bls_site_utility_launcher_hidden_v1";

export function SiteUtilityLauncher() {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const accessibilityLauncherRef = useRef<HTMLButtonElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try { setHidden(sessionStorage.getItem(HIDDEN_KEY) === "true"); } catch { /* keep launcher visible */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    window.requestAnimationFrame(() => firstActionRef.current?.focus({ preventScroll: true }));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      window.requestAnimationFrame(() => launcherRef.current?.focus({ preventScroll: true }));
    };
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && !root.contains(event.target as Node)) setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  if (!ready || hidden) return null;

  function hideLauncher() {
    setOpen(false);
    setHidden(true);
    try { sessionStorage.setItem(HIDDEN_KEY, "true"); } catch { /* hidden for this page lifecycle */ }
  }

  function openCookies() {
    setOpen(false);
    launcherRef.current?.focus({ preventScroll: true });
    requestCookieSettings();
  }

  function openAccessibilityFromMenu() {
    setOpen(false);
    launcherRef.current?.focus({ preventScroll: true });
    requestAccessibilitySettings();
  }

  function openAccessibilityQuick() {
    setOpen(false);
    accessibilityLauncherRef.current?.focus({ preventScroll: true });
    requestAccessibilitySettings();
  }

  return <div ref={rootRef} className="site-utility-root">
    {open && <div id={menuId} className="site-utility-menu" role="group" aria-label="Ρυθμίσεις ιστοτόπου">
      <button ref={firstActionRef} type="button" onClick={openCookies}>
        <span aria-hidden="true" className="site-utility-menu-icon">C</span>
        <span>Ρυθμίσεις cookies</span>
      </button>
      <button type="button" onClick={openAccessibilityFromMenu}>
        <span aria-hidden="true" className="site-utility-menu-icon">A</span>
        <span>Προσβασιμότητα</span>
      </button>
      <button type="button" className="site-utility-hide" onClick={hideLauncher}>
        <span aria-hidden="true" className="site-utility-menu-icon">×</span>
        <span>Απόκρυψη</span>
      </button>
    </div>}

    <button
      ref={accessibilityLauncherRef}
      type="button"
      className="site-accessibility-launcher"
      aria-label="Άνοιγμα εργαλείων προσβασιμότητας"
      onClick={openAccessibilityQuick}
    >
      <span aria-hidden="true">A</span>
    </button>

    <button
      ref={launcherRef}
      type="button"
      className="site-utility-launcher"
      aria-label="Πληροφορίες, cookies και προσβασιμότητα"
      aria-expanded={open}
      aria-controls={menuId}
      onClick={() => setOpen((value) => !value)}
    >
      <span aria-hidden="true">i</span>
    </button>
  </div>;
}
