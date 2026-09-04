"use client";

import { useEffect, useId, useRef, useState } from "react";
import { requestAccessibilitySettings } from "./AccessibilityPreferences";
import { requestCookieSettings } from "./PrivacyConsentProvider";

const HIDDEN_KEY = "bls_site_utility_launcher_hidden_v1";

function CookieIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 12.7A8.2 8.2 0 1 1 11.3 4a4 4 0 0 0 4.7 4.7A4 4 0 0 0 20 12.7Z" />
    <circle cx="8.1" cy="10" r=".8" fill="currentColor" stroke="none" />
    <circle cx="10.2" cy="15.2" r=".8" fill="currentColor" stroke="none" />
    <circle cx="14.7" cy="13.3" r=".8" fill="currentColor" stroke="none" />
  </svg>;
}

function AccessibilityPersonIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="5" r="2.25" />
    <path d="M5.5 9.5h13M12 8.5v6.25M12 14.75l-4 5M12 14.75l4 5" />
  </svg>;
}

export function SiteUtilityLauncher() {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
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

  return <div ref={rootRef} className="site-utility-root">
    {open && <div id={menuId} className="site-utility-menu" role="group" aria-label="Ρυθμίσεις ιστοτόπου">
      <button ref={firstActionRef} type="button" onClick={openCookies}>
        <span aria-hidden="true" className="site-utility-menu-icon"><CookieIcon /></span>
        <span>Ρυθμίσεις cookies</span>
      </button>
      <button type="button" onClick={openAccessibilityFromMenu}>
        <span aria-hidden="true" className="site-utility-menu-icon"><AccessibilityPersonIcon /></span>
        <span>Προσβασιμότητα</span>
      </button>
      <button type="button" className="site-utility-hide" onClick={hideLauncher}>
        <span aria-hidden="true" className="site-utility-menu-icon">×</span>
        <span>Απόκρυψη</span>
      </button>
    </div>}

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
