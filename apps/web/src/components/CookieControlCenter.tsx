"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PRIVACY_CONSENT_CHANGED_EVENT,
  type PrivacyConsentPreferences
} from "../lib/privacy-consent";

type StatusResponse = Readonly<{ consent?: PrivacyConsentPreferences | null }>;

export function CookieControlCenter() {
  const [consent, setConsent] = useState<PrivacyConsentPreferences | undefined>();
  const [analytics, setAnalytics] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/privacy/consent", { method: "GET", credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("status");
      const data = await response.json() as StatusResponse;
      const value = data.consent ?? undefined;
      setConsent(value);
      setAnalytics(value?.analytics === true);
    } catch {
      setConsent(undefined);
      setAnalytics(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const listener = () => void refresh();
    window.addEventListener(PRIVACY_CONSENT_CHANGED_EVENT, listener);
    return () => window.removeEventListener(PRIVACY_CONSENT_CHANGED_EVENT, listener);
  }, [refresh]);

  async function save(nextAnalytics: boolean) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/privacy/consent", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personalisation: false, analytics: nextAnalytics, marketing: false, source: "settings" })
      });
      if (!response.ok) throw new Error("save");
      const data = await response.json() as StatusResponse;
      const value = data.consent ?? undefined;
      if (!value) throw new Error("save_response");
      setConsent(value);
      setAnalytics(value.analytics === true);
      setReady(true);
      window.dispatchEvent(new CustomEvent(PRIVACY_CONSENT_CHANGED_EVENT, { detail: value }));
      setNotice(nextAnalytics
        ? "Τα Analytics ενεργοποιήθηκαν. Η επιλογή επαληθεύτηκε και αποθηκεύτηκε."
        : "Τα προαιρετικά Analytics απενεργοποιήθηκαν και τα σχετικά analytics identifiers καθαρίζονται.");
    } catch {
      setNotice("Δεν μπορέσαμε να αποθηκεύσουμε την επιλογή. Δοκίμασε ξανά.");
    } finally {
      setBusy(false);
    }
  }

  const status = !ready ? "Έλεγχος…" : !consent ? "Δεν έχει αποθηκευτεί επιλογή" : consent.analytics ? "Analytics ενεργά" : "Μόνο απαραίτητα";

  return <section className="cookie-control-center" aria-labelledby="cookie-control-title">
    <div className="cookie-control-head">
      <div>
        <div className="eyebrow">Live Cookie Control</div>
        <h2 id="cookie-control-title">Δες τι είναι ενεργό τώρα και άλλαξέ το.</h2>
        <p>Η ένδειξη παρακάτω δεν διαβάζει απλώς ένα UI cookie. Η κατάσταση επιβεβαιώνεται από την υπογεγραμμένη consent receipt του server.</p>
      </div>
      <div className={`cookie-control-status ${consent?.analytics ? "is-on" : "is-off"}`}><span>Τρέχουσα κατάσταση</span><strong>{status}</strong></div>
    </div>

    <div className="cookie-control-options">
      <article>
        <div><strong>Απαραίτητα</strong><p>Login, checkout, ασφάλεια, marketplace continuity και αποθήκευση της επιλογής σου.</p></div>
        <span className="cookie-control-lock">Πάντα ενεργά</span>
      </article>

      <label>
        <div><strong>Analytics</strong><p>First-party product analytics, Vercel Analytics, Speed Insights και Google Analytics 4.</p></div>
        <span className="cookie-switch"><input type="checkbox" checked={analytics} disabled={!ready || busy} onChange={(event) => setAnalytics(event.target.checked)} /><i aria-hidden="true" /></span>
      </label>

      <article>
        <div><strong>Marketing</strong><p>Δεν χρησιμοποιούμε σήμερα advertising ή remarketing tracker.</p></div>
        <span className="cookie-control-lock">Δεν χρησιμοποιείται</span>
      </article>
    </div>

    <div className="cookie-control-actions">
      <button className="button button-secondary" type="button" disabled={!ready || busy} onClick={() => void save(false)}>Μόνο απαραίτητα</button>
      <button className="button" type="button" disabled={!ready || busy || analytics === (consent?.analytics === true)} onClick={() => void save(analytics)}>Αποθήκευση επιλογής</button>
    </div>
    {notice && <p className="cookie-control-notice" role="status">{notice}</p>}
  </section>;
}
