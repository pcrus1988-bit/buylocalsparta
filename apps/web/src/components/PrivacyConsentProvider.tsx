"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  PRIVACY_CONSENT_VERSION,
  readPrivacyConsent,
  type PrivacyConsentPreferences
} from "../lib/privacy-consent";

const OPEN_EVENT = "bls:open-cookie-settings";

type DraftConsent = Readonly<{
  personalisation: boolean;
  analytics: boolean;
  marketing: boolean;
}>;
type ConsentSource = "banner" | "settings";

const OPTIONAL_OFF: DraftConsent = { personalisation: false, analytics: false, marketing: false };
const OPTIONAL_ON: DraftConsent = { personalisation: false, analytics: true, marketing: false };

export function PrivacyConsentProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [consent, setConsent] = useState<PrivacyConsentPreferences | undefined>();
  const [draft, setDraft] = useState<DraftConsent>(OPTIONAL_OFF);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const current = readPrivacyConsent(document.cookie);
    setConsent(current);
    setDraft(current ? {
      personalisation: false,
      analytics: current.analytics,
      marketing: false
    } : OPTIONAL_OFF);
    setHydrated(true);
  }, []);

  const openSettings = useCallback(() => {
    const current = readPrivacyConsent(document.cookie);
    setDraft(current ? {
      personalisation: false,
      analytics: current.analytics,
      marketing: false
    } : OPTIONAL_OFF);
    setError(undefined);
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const listener = () => openSettings();
    window.addEventListener(OPEN_EVENT, listener);
    return () => window.removeEventListener(OPEN_EVENT, listener);
  }, [openSettings]);

  async function persist(next: DraftConsent, source: ConsentSource) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/privacy/consent", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personalisation: false, analytics: next.analytics, marketing: false, source })
      });
      if (!response.ok) throw new Error("Consent update failed");
      const updated = readPrivacyConsent(document.cookie) ?? {
        version: PRIVACY_CONSENT_VERSION,
        personalisation: false,
        analytics: next.analytics,
        marketing: false,
        decidedAt: new Date().toISOString()
      };
      setConsent(updated);
      setDraft({ personalisation: false, analytics: next.analytics, marketing: false });
      dialogRef.current?.close();
      window.dispatchEvent(new CustomEvent("bls:privacy-consent-changed", { detail: updated }));
    } catch {
      setError("Δεν ήταν δυνατή η αποθήκευση των επιλογών σου. Δοκίμασε ξανά.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    {children}
    {hydrated && !consent && <aside className="privacy-consent-banner" aria-label="Ρυθμίσεις απορρήτου και cookies">
      <div className="privacy-consent-copy">
        <strong>Το απόρρητό σου, με καθαρές επιλογές.</strong>
        <p>Χρησιμοποιούμε τα απολύτως απαραίτητα για ασφάλεια και λειτουργία. Το προαιρετικό first-party Analytics παραμένει κλειστό μέχρι να το επιλέξεις. Δεν υπάρχει ενεργός marketing/remarketing tracker.</p>
        <div className="privacy-consent-links"><Link href="/cookies">Πολιτική Cookies</Link><Link href="/privacy">Πολιτική Απορρήτου</Link><Link href="/privacy-controls">Privacy controls</Link></div>
        {error && <p className="privacy-consent-error" role="alert">{error}</p>}
      </div>
      <div className="privacy-consent-actions" aria-label="Επιλογές cookies">
        <button type="button" disabled={busy} onClick={() => void persist(OPTIONAL_ON, "banner")}>Αποδοχή όλων</button>
        <button type="button" disabled={busy} onClick={() => void persist(OPTIONAL_OFF, "banner")}>Απόρριψη προαιρετικών</button>
        <button type="button" disabled={busy} onClick={openSettings}>Ρυθμίσεις</button>
      </div>
    </aside>}

    <dialog className="privacy-consent-dialog" ref={dialogRef} aria-labelledby="privacy-consent-title">
      <form method="dialog" onSubmit={(event) => event.preventDefault()}>
        <div className="privacy-consent-dialog-head">
          <div>
            <div className="eyebrow">Privacy choices</div>
            <h2 id="privacy-consent-title">Ρυθμίσεις cookies και δεδομένων</h2>
          </div>
          <button type="button" className="privacy-consent-close" onClick={() => dialogRef.current?.close()} aria-label="Κλείσιμο ρυθμίσεων">×</button>
        </div>

        <div className="privacy-consent-option">
          <div><strong>Απαραίτητα</strong><p>Ασφάλεια, σύνδεση, checkout, βασική συνέχεια υπηρεσίας και απόδειξη της επιλογής cookies.</p></div>
          <input type="checkbox" checked disabled aria-label="Απαραίτητα cookies, πάντα ενεργά" />
        </div>
        <div className="privacy-consent-option">
          <div><strong>Προσωποποίηση browser</strong><p>Δεν υπάρχει σήμερα ξεχωριστός browser tracker προσωποποίησης. Οι επιλογές recommendations/recently viewed του λογαριασμού διαχειρίζονται ξεχωριστά στα Privacy controls.</p></div>
          <input type="checkbox" checked={false} disabled aria-label="Browser προσωποποίηση, δεν χρησιμοποιείται" />
        </div>
        <label className="privacy-consent-option">
          <div><strong>Analytics</strong><p>First-party μέτρηση product views, engagement και απόδοσης. Δεν ενεργοποιείται πριν από τη συγκατάθεσή σου.</p></div>
          <input type="checkbox" checked={draft.analytics} onChange={(event) => setDraft({ personalisation: false, analytics: event.target.checked, marketing: false })} />
        </label>
        <div className="privacy-consent-option">
          <div><strong>Marketing</strong><p>Δεν υπάρχει ενεργός advertising ή remarketing tracker. Αν προστεθεί συγκεκριμένη τεχνολογία στο μέλλον, θα απαιτεί νέα ενημέρωση και κατάλληλη επιλογή πριν ενεργοποιηθεί.</p></div>
          <input type="checkbox" checked={false} disabled aria-label="Marketing trackers, δεν χρησιμοποιούνται" />
        </div>

        {error && <p className="privacy-consent-error privacy-consent-dialog-error" role="alert">{error}</p>}
        <div className="privacy-consent-dialog-actions">
          <button type="button" disabled={busy} onClick={() => void persist(OPTIONAL_OFF, "settings")}>Απόρριψη προαιρετικών</button>
          <button type="button" disabled={busy} onClick={() => void persist(draft, "settings")}>Αποθήκευση επιλογών</button>
          <button type="button" disabled={busy} onClick={() => void persist(OPTIONAL_ON, "settings")}>Αποδοχή όλων</button>
        </div>
      </form>
    </dialog>
  </>;
}

export function requestCookieSettings(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_EVENT));
}
