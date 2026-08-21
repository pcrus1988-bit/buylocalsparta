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

const OPTIONAL_OFF: DraftConsent = { personalisation: false, analytics: false, marketing: false };
const OPTIONAL_ON: DraftConsent = { personalisation: true, analytics: true, marketing: true };

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
      personalisation: current.personalisation,
      analytics: current.analytics,
      marketing: current.marketing
    } : OPTIONAL_OFF);
    setHydrated(true);
  }, []);

  const openSettings = useCallback(() => {
    const current = readPrivacyConsent(document.cookie);
    setDraft(current ? {
      personalisation: current.personalisation,
      analytics: current.analytics,
      marketing: current.marketing
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

  async function persist(next: DraftConsent) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/privacy/consent", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next)
      });
      if (!response.ok) throw new Error("Consent update failed");
      const updated = readPrivacyConsent(document.cookie) ?? {
        version: PRIVACY_CONSENT_VERSION,
        ...next,
        decidedAt: new Date().toISOString()
      };
      setConsent(updated);
      setDraft(next);
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
        <p>Χρησιμοποιούμε τα απολύτως απαραίτητα για ασφάλεια και λειτουργία. Προαιρετικές τεχνολογίες προσωπικοποίησης, analytics και marketing ενεργοποιούνται μόνο αν τις επιλέξεις.</p>
        <Link href="/privacy-controls">Έλεγχοι ιδιωτικότητας</Link>
        {error && <p className="privacy-consent-error" role="alert">{error}</p>}
      </div>
      <div className="privacy-consent-actions" aria-label="Επιλογές cookies">
        <button type="button" disabled={busy} onClick={() => void persist(OPTIONAL_ON)}>Αποδοχή όλων</button>
        <button type="button" disabled={busy} onClick={() => void persist(OPTIONAL_OFF)}>Απόρριψη προαιρετικών</button>
        <button type="button" disabled={busy} onClick={openSettings}>Ρυθμίσεις</button>
      </div>
    </aside>}

    {hydrated && consent && <button type="button" className="privacy-consent-manage-floating" onClick={openSettings}>Ρυθμίσεις cookies</button>}

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
          <div><strong>Απαραίτητα</strong><p>Ασφάλεια, σύνδεση, checkout και βασική συνέχεια της υπηρεσίας.</p></div>
          <input type="checkbox" checked disabled aria-label="Απαραίτητα cookies, πάντα ενεργά" />
        </div>
        <label className="privacy-consent-option">
          <div><strong>Προσωποποίηση</strong><p>Προαιρετικές browser-level επιλογές εξατομίκευσης. Οι ρυθμίσεις του λογαριασμού σου παραμένουν ξεχωριστές στα Privacy controls.</p></div>
          <input type="checkbox" checked={draft.personalisation} onChange={(event) => setDraft({ ...draft, personalisation: event.target.checked })} />
        </label>
        <label className="privacy-consent-option">
          <div><strong>Analytics</strong><p>Μέτρηση χρήσης και απόδοσης προϊόντων. Δεν ενεργοποιείται πριν από τη συγκατάθεσή σου.</p></div>
          <input type="checkbox" checked={draft.analytics} onChange={(event) => setDraft({ ...draft, analytics: event.target.checked })} />
        </label>
        <label className="privacy-consent-option">
          <div><strong>Marketing</strong><p>Μελλοντική διαφήμιση ή remarketing. Παραμένει ανενεργό αν δεν το επιλέξεις.</p></div>
          <input type="checkbox" checked={draft.marketing} onChange={(event) => setDraft({ ...draft, marketing: event.target.checked })} />
        </label>

        {error && <p className="privacy-consent-error privacy-consent-dialog-error" role="alert">{error}</p>}
        <div className="privacy-consent-dialog-actions">
          <button type="button" disabled={busy} onClick={() => void persist(OPTIONAL_OFF)}>Απόρριψη προαιρετικών</button>
          <button type="button" disabled={busy} onClick={() => void persist(draft)}>Αποθήκευση επιλογών</button>
          <button type="button" disabled={busy} onClick={() => void persist(OPTIONAL_ON)}>Αποδοχή όλων</button>
        </div>
      </form>
    </dialog>
  </>;
}

export function requestCookieSettings(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_EVENT));
}
