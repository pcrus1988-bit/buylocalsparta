"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type LegalKey = "terms" | "privacy";
type LegalDocument = LegalKey | null;

const LEGAL_DOCUMENTS: Record<LegalKey, { title: string; src: string }> = {
  terms: { title: "Όροι Χρήσης", src: "/terms" },
  privacy: { title: "Πολιτική Απορρήτου", src: "/privacy" }
};

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const googlePending = searchParams.get("google") === "1";
  const requested = searchParams.get("next") ?? "";
  const safeNext = requested.startsWith("/") && !requested.startsWith("//") ? requested : undefined;
  const googleHref = `/api/account/google/start${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}`;
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocument>(null);
  const [legalContent, setLegalContent] = useState<Partial<Record<LegalKey, string>>>({});
  const [legalLoadError, setLegalLoadError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!legalDocument) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLegalDocument(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [legalDocument]);

  useEffect(() => {
    if (!legalDocument || legalContent[legalDocument]) return;
    const key = legalDocument;
    const source = LEGAL_DOCUMENTS[key].src;
    let cancelled = false;
    setLegalLoadError("");

    void fetch(source, { headers: { accept: "text/html" }, credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        const parsed = new DOMParser().parseFromString(html, "text/html");
        const legalPage = parsed.querySelector("main.legal-page");
        if (!legalPage) throw new Error("Legal page content was not found");
        return legalPage.innerHTML;
      })
      .then((content) => {
        if (!cancelled) setLegalContent((current) => ({ ...current, [key]: content }));
      })
      .catch(() => {
        if (!cancelled) setLegalLoadError("Δεν ήταν δυνατή η φόρτωση του εγγράφου. Κλείσε το παράθυρο και δοκίμασε ξανά.");
      });

    return () => { cancelled = true; };
  }, [legalDocument, legalContent]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    setVerificationUrl("");
    try {
      if (googlePending) {
        const response = await fetch("/api/account/google/complete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fullName, acceptedTerms, acceptedPrivacy })
        });
        const data = await response.json() as { error?: string; next?: string };
        if (!response.ok) throw new Error(data.error ?? "Η εγγραφή με Google απέτυχε.");
        router.replace(data.next && data.next.startsWith("/") && !data.next.startsWith("//") ? data.next : "/account");
        router.refresh();
        return;
      }

      const response = await fetch("/api/account/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName, email, password, passwordConfirmation, acceptedTerms, acceptedPrivacy, next: safeNext })
      });
      const data = await response.json() as { error?: string; email?: string; resent?: boolean; verificationUrl?: string };
      if (!response.ok) throw new Error(data.error ?? "Η εγγραφή απέτυχε.");

      const registeredEmail = data.email ?? email;
      setSuccess(data.resent
        ? `Στείλαμε νέο email επιβεβαίωσης στο ${registeredEmail}.`
        : `Ο λογαριασμός δημιουργήθηκε. Έλεγξε το ${registeredEmail} για να επιβεβαιώσεις το email σου.`);
      setVerificationUrl(data.verificationUrl ?? "");
      setLegalDocument(null);
      setFullName("");
      setEmail("");
      setPassword("");
      setPasswordConfirmation("");
      setAcceptedTerms(false);
      setAcceptedPrivacy(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : googlePending ? "Η εγγραφή με Google απέτυχε." : "Η εγγραφή απέτυχε.");
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return <div className="account-gate registration-success" role="status" aria-live="polite">
      <strong>Ένα ακόμη βήμα</strong>
      <p>{success}</p>
      <p>Άνοιξε το email επιβεβαίωσης και πάτησε τον σύνδεσμο για να ενεργοποιήσεις τον λογαριασμό σου. Μετά θα μπορείς να συνδεθείς.</p>
      {verificationUrl && <a className="text-link" href={verificationUrl}>Development verification link →</a>}
    </div>;
  }

  const activeLegal = legalDocument ? LEGAL_DOCUMENTS[legalDocument] : null;
  const activeLegalContent = legalDocument ? legalContent[legalDocument] : undefined;

  return <>
    <form className="login-form" onSubmit={submit}>
      {googlePending ? <div className="account-gate" role="status">
        <strong>Ο λογαριασμός Google επιβεβαιώθηκε.</strong>
        <p>Συμπλήρωσε το ονοματεπώνυμό σου και αποδέξου τα υποχρεωτικά έγγραφα για να ολοκληρώσεις τη δημιουργία λογαριασμού ΚΟΝΤΑ ΜΟΥ.</p>
      </div> : <>
        <a className="button" href={googleHref} style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.65rem", textDecoration: "none" }}>
          <span aria-hidden="true" style={{ fontWeight: 800 }}>G</span>
          Εγγραφή με Google
        </a>
        <div aria-hidden="true" style={{ textAlign: "center", opacity: 0.65, fontSize: "0.9rem" }}>ή με email</div>
      </>}

      <label htmlFor="register-name">Ονοματεπώνυμο</label>
      <input id="register-name" type="text" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} required minLength={3} maxLength={160} placeholder="Όνομα και επώνυμο" />

      {!googlePending && <>
        <label htmlFor="register-email">Email</label>
        <input id="register-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />

        <label htmlFor="register-password">Κωδικός</label>
        <input id="register-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} aria-describedby="register-password-hint" />
        <small id="register-password-hint">Τουλάχιστον 10 χαρακτήρες. Χρησιμοποίησε έναν μοναδικό κωδικό που δεν χρησιμοποιείς αλλού.</small>

        <label htmlFor="register-password-confirmation">Επανάληψη κωδικού</label>
        <input id="register-password-confirmation" type="password" autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} required minLength={10} />
      </>}

      <div className="registration-legal-consents" aria-label="Υποχρεωτικές αποδοχές">
        <label className="checkbox-row" htmlFor="register-terms">
          <input id="register-terms" type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required />
          <span>Αποδέχομαι τους <button className="registration-legal-link" type="button" onClick={() => setLegalDocument("terms")} aria-haspopup="dialog">Όρους Χρήσης</button>.</span>
        </label>

        <label className="checkbox-row" htmlFor="register-privacy">
          <input id="register-privacy" type="checkbox" checked={acceptedPrivacy} onChange={(event) => setAcceptedPrivacy(event.target.checked)} required />
          <span>Έχω διαβάσει και αποδέχομαι την <button className="registration-legal-link" type="button" onClick={() => setLegalDocument("privacy")} aria-haspopup="dialog">Πολιτική Απορρήτου</button>.</span>
        </label>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <button className="button" type="submit" disabled={busy}>{busy ? (googlePending ? "Ολοκλήρωση…" : "Δημιουργία…") : (googlePending ? "Ολοκλήρωση εγγραφής" : "Δημιουργία λογαριασμού")}</button>
      <p className="login-demo-note">Έχεις ήδη λογαριασμό; <a className="text-link" href={`/login${safeNextQuery(searchParams.get("next"))}`}>Συνδέσου →</a></p>
    </form>

    {activeLegal && <div className="registration-legal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setLegalDocument(null);
    }}>
      <section className="registration-legal-modal" role="dialog" aria-modal="true" aria-labelledby="registration-legal-title">
        <header className="registration-legal-modal-head">
          <div>
            <span>ΚΟΝΤΑ ΜΟΥ · Νομικά έγγραφα</span>
            <h2 id="registration-legal-title">{activeLegal.title}</h2>
          </div>
          <button className="registration-legal-close" type="button" onClick={() => setLegalDocument(null)} aria-label={`Κλείσιμο: ${activeLegal.title}`}>×</button>
        </header>
        <div className="registration-legal-document">
          {legalLoadError ? <div className="registration-legal-state" role="alert">{legalLoadError}</div>
            : activeLegalContent ? <div className="legal-page registration-legal-page-content" dangerouslySetInnerHTML={{ __html: activeLegalContent }} />
              : <div className="registration-legal-state" role="status">Φόρτωση {activeLegal.title}…</div>}
        </div>
      </section>
    </div>}
  </>;
}

function safeNextQuery(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "";
  return `?next=${encodeURIComponent(value)}`;
}
