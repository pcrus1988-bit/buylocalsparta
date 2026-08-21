"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

const STORAGE_KEY = "bls_accessibility_preferences_v1";

type Preferences = Readonly<{
  textScale: "100" | "112" | "125";
  contrast: boolean;
  links: boolean;
  spacing: boolean;
  motion: boolean;
  focus: boolean;
}>;

const defaults: Preferences = {
  textScale: "100",
  contrast: false,
  links: false,
  spacing: false,
  motion: false,
  focus: false
};

function applyPreferences(preferences: Preferences) {
  const root = document.documentElement;
  root.dataset.a11yText = preferences.textScale;
  for (const [key, enabled] of [
    ["a11yContrast", preferences.contrast],
    ["a11yLinks", preferences.links],
    ["a11ySpacing", preferences.spacing],
    ["a11yMotion", preferences.motion],
    ["a11yFocus", preferences.focus]
  ] as const) {
    if (enabled) root.dataset[key] = "true";
    else delete root.dataset[key];
  }
}

function readPreferences(): Preferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Preferences> | null;
    if (!parsed) return defaults;
    return {
      textScale: parsed.textScale === "112" || parsed.textScale === "125" ? parsed.textScale : "100",
      contrast: parsed.contrast === true,
      links: parsed.links === true,
      spacing: parsed.spacing === true,
      motion: parsed.motion === true,
      focus: parsed.focus === true
    };
  } catch { return defaults; }
}

export function AccessibilityPreferences() {
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readPreferences();
    setPreferences(stored);
    applyPreferences(stored);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    applyPreferences(preferences);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch { /* preferences remain active for this page */ }
  }, [preferences, ready]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  function reset() { setPreferences(defaults); }

  return <div className="a11y-preferences-root">
    <button
      type="button"
      className="a11y-launcher"
      aria-expanded={open}
      aria-controls="a11y-preferences-panel"
      onClick={() => setOpen((value) => !value)}
    >
      <span aria-hidden="true">◉</span>
      <span>Προσβασιμότητα</span>
    </button>

    {open && <aside id="a11y-preferences-panel" className="a11y-preferences-panel" role="dialog" aria-modal="false" aria-labelledby={headingId}>
      <div className="a11y-preferences-head">
        <div><small>Ρυθμίσεις εμφάνισης</small><h2 id={headingId}>Προσβασιμότητα</h2></div>
        <button type="button" className="a11y-close" aria-label="Κλείσιμο ρυθμίσεων προσβασιμότητας" onClick={() => setOpen(false)}>×</button>
      </div>

      <fieldset className="a11y-fieldset">
        <legend>Μέγεθος κειμένου</legend>
        <div className="a11y-segmented">
          {(["100", "112", "125"] as const).map((value) => <button key={value} type="button" aria-pressed={preferences.textScale === value} onClick={() => update("textScale", value)}>{value}%</button>)}
        </div>
      </fieldset>

      <div className="a11y-toggle-list">
        <label><input type="checkbox" checked={preferences.contrast} onChange={(event) => update("contrast", event.target.checked)} /><span><strong>Ενισχυμένη αντίθεση</strong><small>Αυξάνει την οπτική διάκριση βασικών χρωμάτων.</small></span></label>
        <label><input type="checkbox" checked={preferences.links} onChange={(event) => update("links", event.target.checked)} /><span><strong>Υπογράμμιση συνδέσμων</strong><small>Κάνει τα links ευκολότερα αναγνωρίσιμα χωρίς να βασίζονται μόνο στο χρώμα.</small></span></label>
        <label><input type="checkbox" checked={preferences.spacing} onChange={(event) => update("spacing", event.target.checked)} /><span><strong>Περισσότερη απόσταση κειμένου</strong><small>Αυξάνει line, word και letter spacing.</small></span></label>
        <label><input type="checkbox" checked={preferences.motion} onChange={(event) => update("motion", event.target.checked)} /><span><strong>Μείωση κίνησης</strong><small>Περιορίζει animations και smooth scrolling.</small></span></label>
        <label><input type="checkbox" checked={preferences.focus} onChange={(event) => update("focus", event.target.checked)} /><span><strong>Έντονο keyboard focus</strong><small>Κάνει το focus indicator πιο εμφανές.</small></span></label>
      </div>

      <div className="a11y-preferences-actions">
        <button type="button" className="button button-secondary" onClick={reset}>Επαναφορά</button>
        <Link className="text-link" href="/accessibility" onClick={() => setOpen(false)}>Δήλωση & αναφορά προβλήματος →</Link>
      </div>
      <p className="a11y-preferences-note">Οι ρυθμίσεις αυτές είναι βοηθήματα χρήσης. Δεν αντικαθιστούν τη συμμόρφωση WCAG ούτε αποτελούν accessibility overlay/certificate.</p>
    </aside>}
  </div>;
}
