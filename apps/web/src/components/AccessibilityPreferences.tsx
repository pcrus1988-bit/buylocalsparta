"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

const STORAGE_KEY = "bls_accessibility_preferences_v1";
const OPEN_EVENT = "bls:open-accessibility-settings";

type Preferences = Readonly<{
  textScale: "100" | "112" | "125";
  contrast: boolean;
  links: boolean;
  spacing: boolean;
  lineHeight: boolean;
  motion: boolean;
  focus: boolean;
  readableFont: boolean;
  hideImages: boolean;
  grayscale: boolean;
  lowSaturation: boolean;
}>;

type ToolToggleProps = Readonly<{
  icon: string;
  title: string;
  description: string;
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
}>;

const defaults: Preferences = {
  textScale: "100",
  contrast: false,
  links: false,
  spacing: false,
  lineHeight: false,
  motion: false,
  focus: false,
  readableFont: false,
  hideImages: false,
  grayscale: false,
  lowSaturation: false
};

function ToolToggle({ icon, title, description, pressed, onClick, disabled = false }: ToolToggleProps) {
  return <button
    type="button"
    className="a11y-tool-toggle"
    aria-pressed={pressed}
    disabled={disabled}
    onClick={onClick}
  >
    <span className="a11y-tool-icon" aria-hidden="true">{icon}</span>
    <span className="a11y-tool-copy"><strong>{title}</strong><small>{description}</small></span>
  </button>;
}

function applyPreferences(preferences: Preferences) {
  const root = document.documentElement;
  root.dataset.a11yText = preferences.textScale;
  for (const [key, enabled] of [
    ["a11yContrast", preferences.contrast],
    ["a11yLinks", preferences.links],
    ["a11ySpacing", preferences.spacing],
    ["a11yLineHeight", preferences.lineHeight],
    ["a11yMotion", preferences.motion],
    ["a11yFocus", preferences.focus],
    ["a11yReadableFont", preferences.readableFont],
    ["a11yHideImages", preferences.hideImages],
    ["a11yGrayscale", preferences.grayscale],
    ["a11yLowSaturation", preferences.lowSaturation]
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
      lineHeight: parsed.lineHeight === true,
      motion: parsed.motion === true,
      focus: parsed.focus === true,
      readableFont: parsed.readableFont === true,
      hideImages: parsed.hideImages === true,
      grayscale: parsed.grayscale === true,
      lowSaturation: parsed.lowSaturation === true
    };
  } catch { return defaults; }
}

export function AccessibilityPreferences() {
  const headingId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [ready, setReady] = useState(false);
  const [reading, setReading] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);

  useEffect(() => {
    const stored = readPreferences();
    setPreferences(stored);
    applyPreferences(stored);
    setSpeechAvailable(typeof window.speechSynthesis !== "undefined");
    setReady(true);

    return () => {
      if (typeof window.speechSynthesis !== "undefined") window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    applyPreferences(preferences);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch { /* preferences remain active for this page */ }
  }, [preferences, ready]);

  useEffect(() => {
    const listener = () => {
      const activeElement = document.activeElement;
      returnFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, listener);
    return () => window.removeEventListener(OPEN_EVENT, listener);
  }, []);

  useEffect(() => {
    if (!open) return;

    window.requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      window.requestAnimationFrame(() => {
        const target = returnFocusRef.current;
        if (target?.isConnected) target.focus({ preventScroll: true });
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    if (speechAvailable) window.speechSynthesis.cancel();
    setReading(false);
    setPreferences(defaults);
  }

  function toggleReading() {
    if (!speechAvailable) return;
    const engine = window.speechSynthesis;
    if (reading || engine.speaking) {
      engine.cancel();
      setReading(false);
      return;
    }

    const main = document.getElementById("main-content");
    const text = main?.innerText.replace(/\s+/g, " ").trim();
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text.slice(0, 60000));
    utterance.lang = document.documentElement.lang === "en" ? "en-US" : "el-GR";
    utterance.rate = 0.95;
    utterance.onend = () => setReading(false);
    utterance.onerror = () => setReading(false);
    engine.cancel();
    engine.speak(utterance);
    setReading(true);
  }

  function closeAndRestoreFocus() {
    setOpen(false);
    window.requestAnimationFrame(() => {
      const target = returnFocusRef.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
    });
  }

  return <div className="a11y-preferences-root">
    {open && <aside
      id="a11y-preferences-panel"
      className="a11y-preferences-panel"
      role="dialog"
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
    >
      <div className="a11y-preferences-head">
        <div>
          <small>Βοηθήματα χρήσης</small>
          <h2 id={headingId}>Προσβασιμότητα</h2>
        </div>
        <button ref={closeButtonRef} type="button" className="a11y-close" aria-label="Κλείσιμο ρυθμίσεων προσβασιμότητας" onClick={closeAndRestoreFocus}>×</button>
      </div>
      <p id={descriptionId} className="a11y-preferences-intro">Προσαρμόστε την ανάγνωση και την εμφάνιση του ΚΟΝΤΑ ΜΟΥ στις ανάγκες σας.</p>

      <fieldset className="a11y-fieldset">
        <legend>Μέγεθος κειμένου</legend>
        <div className="a11y-segmented">
          {(["100", "112", "125"] as const).map((value) => <button key={value} type="button" aria-pressed={preferences.textScale === value} onClick={() => update("textScale", value)}>{value}%</button>)}
        </div>
      </fieldset>

      <div className="a11y-tool-grid">
        <ToolToggle
          icon={reading ? "■" : "▶"}
          title={reading ? "Διακοπή ανάγνωσης" : "Ανάγνωση σελίδας"}
          description={speechAvailable ? "Χρησιμοποιεί τη φωνητική ανάγνωση του browser ή της συσκευής." : "Η φωνητική ανάγνωση δεν υποστηρίζεται από αυτόν τον browser."}
          pressed={reading}
          onClick={toggleReading}
          disabled={!speechAvailable}
        />
        <ToolToggle icon="◐" title="Αντίθεση+" description="Αυξάνει τη διάκριση βασικών χρωμάτων και ορίων." pressed={preferences.contrast} onClick={() => update("contrast", !preferences.contrast)} />
        <ToolToggle icon="↗" title="Επισήμανση συνδέσμων" description="Υπογραμμίζει links ώστε να μη βασίζονται μόνο στο χρώμα." pressed={preferences.links} onClick={() => update("links", !preferences.links)} />
        <ToolToggle icon="↔" title="Απόσταση κειμένου" description="Αυξάνει letter και word spacing για πιο άνετη ανάγνωση." pressed={preferences.spacing} onClick={() => update("spacing", !preferences.spacing)} />
        <ToolToggle icon="↕" title="Ύψος γραμμής" description="Αυξάνει το κενό ανάμεσα στις γραμμές κειμένου." pressed={preferences.lineHeight} onClick={() => update("lineHeight", !preferences.lineHeight)} />
        <ToolToggle icon="Ⅱ" title="Παύση κίνησης" description="Περιορίζει animations, transitions και smooth scrolling." pressed={preferences.motion} onClick={() => update("motion", !preferences.motion)} />
        <ToolToggle icon="Aa" title="Ευανάγνωστη γραμματοσειρά" description="Χρησιμοποιεί απλή system sans-serif γραμματοσειρά στο περιεχόμενο." pressed={preferences.readableFont} onClick={() => update("readableFont", !preferences.readableFont)} />
        <ToolToggle icon="▧" title="Απόκρυψη εικόνων" description="Κρύβει εικόνες και video χωρίς να αλλάζει τη διάταξη της σελίδας." pressed={preferences.hideImages} onClick={() => update("hideImages", !preferences.hideImages)} />
        <ToolToggle icon="◌" title="Κλίμακα του γκρι" description="Αφαιρεί το χρώμα από το κύριο περιεχόμενο." pressed={preferences.grayscale} onClick={() => update("grayscale", !preferences.grayscale)} />
        <ToolToggle icon="◒" title="Χαμηλός κορεσμός" description="Μειώνει την ένταση των χρωμάτων στο κύριο περιεχόμενο." pressed={preferences.lowSaturation} onClick={() => update("lowSaturation", !preferences.lowSaturation)} />
        <ToolToggle icon="◎" title="Έντονο keyboard focus" description="Κάνει τον δείκτη focus ιδιαίτερα εμφανή κατά την πλοήγηση με πληκτρολόγιο." pressed={preferences.focus} onClick={() => update("focus", !preferences.focus)} />
      </div>

      <div className="a11y-preferences-actions">
        <button type="button" className="button button-secondary" onClick={reset}>Επαναφορά όλων</button>
        <Link className="text-link" href="/accessibility" onClick={() => setOpen(false)}>Δήλωση & αναφορά προβλήματος →</Link>
      </div>
      <p className="a11y-preferences-note">Τα εργαλεία αυτά είναι προαιρετικά βοηθήματα εξατομίκευσης. Η προσβασιμότητα του ΚΟΝΤΑ ΜΟΥ υλοποιείται στο ίδιο το προϊόν και δεν βασίζεται στο widget για συμμόρφωση WCAG.</p>
    </aside>}
  </div>;
}

export function requestAccessibilitySettings(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_EVENT));
}
