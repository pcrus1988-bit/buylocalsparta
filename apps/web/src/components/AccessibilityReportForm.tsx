"use client";

import { FormEvent, useEffect, useState } from "react";

type Result = { ok?: boolean; publicId?: string; error?: string };

export function AccessibilityReportForm() {
  const [pagePath, setPagePath] = useState("/");
  const [consentToContact, setConsentToContact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>({});

  useEffect(() => {
    setPagePath(`${window.location.pathname}${window.location.search}`);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusy(true);
    setResult({});
    try {
      const response = await fetch("/api/accessibility/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pagePath: formData.get("pagePath"),
          barrier: formData.get("barrier"),
          expected: formData.get("expected"),
          assistiveTechnology: formData.get("assistiveTechnology"),
          browserContext: formData.get("browserContext"),
          contactEmail: consentToContact ? formData.get("contactEmail") : "",
          consentToContact,
          website: formData.get("website")
        })
      });
      const data = await response.json() as Result;
      if (!response.ok) throw new Error(data.error ?? "Η αναφορά δεν καταχωρίστηκε.");
      setResult({ ok: true, publicId: data.publicId });
      form.reset();
      setConsentToContact(false);
      setPagePath(`${window.location.pathname}${window.location.search}`);
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Η αναφορά δεν καταχωρίστηκε." });
    } finally { setBusy(false); }
  }

  if (result.ok) return <div className="a11y-report-success" role="status">
    <strong>Η αναφορά καταχωρίστηκε.</strong>
    <p>Κωδικός αναφοράς: <code>{result.publicId}</code></p>
    <button type="button" className="button button-secondary" onClick={() => setResult({})}>Νέα αναφορά</button>
  </div>;

  return <form className="a11y-report-form" onSubmit={submit}>
    <div className="a11y-form-grid">
      <label>Σελίδα / διαδρομή
        <input name="pagePath" value={pagePath} onChange={(event) => setPagePath(event.target.value)} required maxLength={500} />
      </label>
      <label>Τι σε εμπόδισε; <span aria-hidden="true">*</span>
        <textarea name="barrier" required minLength={10} maxLength={4000} rows={5} aria-describedby="a11y-barrier-help" />
        <small id="a11y-barrier-help">Περιέγραψε τη λειτουργία, το βήμα και τι συνέβη.</small>
      </label>
      <label>Τι περίμενες να μπορείς να κάνεις;
        <textarea name="expected" maxLength={2000} rows={3} />
      </label>
      <label>Assistive technology (προαιρετικά)
        <input name="assistiveTechnology" maxLength={500} placeholder="π.χ. NVDA, VoiceOver, keyboard only" />
      </label>
      <label>Browser / συσκευή (προαιρετικά)
        <input name="browserContext" maxLength={500} placeholder="Συμπλήρωσέ το μόνο αν θέλεις" />
      </label>
    </div>

    <label className="a11y-contact-consent">
      <input type="checkbox" checked={consentToContact} onChange={(event) => setConsentToContact(event.target.checked)} />
      <span>Θέλω να επικοινωνήσετε μαζί μου για αυτή την αναφορά.</span>
    </label>
    {consentToContact && <label>Email επικοινωνίας
      <input name="contactEmail" type="email" autoComplete="email" required maxLength={320} />
    </label>}

    <label className="a11y-honeypot" aria-hidden="true">Website<input name="website" type="text" tabIndex={-1} autoComplete="off" /></label>

    <div className="a11y-report-actions">
      <button className="button" type="submit" disabled={busy}>{busy ? "Καταχώριση…" : "Αποστολή αναφοράς"}</button>
      <small>Δεν συλλέγουμε IP ή fingerprint μέσω αυτής της φόρμας. Στοιχεία επικοινωνίας αποθηκεύονται μόνο αν ζητήσεις απάντηση.</small>
    </div>
    {result.error && <p className="form-error" role="alert">{result.error}</p>}
  </form>;
}
