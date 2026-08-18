"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

export function RegisterForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    setVerificationUrl("");
    try {
      const requested = searchParams.get("next") ?? "";
      const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : undefined;
      const response = await fetch("/api/account/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, passwordConfirmation, acceptedPrivacy, next })
      });
      const data = await response.json() as { error?: string; email?: string; resent?: boolean; verificationUrl?: string };
      if (!response.ok) throw new Error(data.error ?? "Η εγγραφή απέτυχε.");
      setSuccess(data.resent
        ? `Στείλαμε νέο email επιβεβαίωσης στο ${data.email ?? email}.`
        : `Ο λογαριασμός δημιουργήθηκε. Έλεγξε το ${data.email ?? email} για να επιβεβαιώσεις το email σου.`);
      setVerificationUrl(data.verificationUrl ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η εγγραφή απέτυχε.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="login-form" onSubmit={submit}>
    <label htmlFor="register-email">Email</label>
    <input id="register-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />

    <label htmlFor="register-password">Κωδικός</label>
    <input id="register-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} aria-describedby="register-password-hint" />
    <small id="register-password-hint">Τουλάχιστον 10 χαρακτήρες. Χρησιμοποίησε έναν μοναδικό κωδικό που δεν χρησιμοποιείς αλλού.</small>

    <label htmlFor="register-password-confirmation">Επανάληψη κωδικού</label>
    <input id="register-password-confirmation" type="password" autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} required minLength={10} />

    <label className="checkbox-row" htmlFor="register-privacy">
      <input id="register-privacy" type="checkbox" checked={acceptedPrivacy} onChange={(event) => setAcceptedPrivacy(event.target.checked)} required />
      <span>Συμφωνώ με την επεξεργασία των στοιχείων μου για τη δημιουργία λογαριασμού και έχω διαβάσει τα <a href="/privacy-controls">privacy controls</a>.</span>
    </label>

    {error && <p className="form-error" role="alert">{error}</p>}
    {success && <div className="account-gate" role="status"><strong>Ένα ακόμη βήμα</strong><p>{success}</p>{verificationUrl && <a className="text-link" href={verificationUrl}>Development verification link →</a>}</div>}

    <button className="button" type="submit" disabled={busy || Boolean(success)}>{busy ? "Δημιουργία…" : "Δημιουργία λογαριασμού"}</button>
    <p className="login-demo-note">Έχεις ήδη λογαριασμό; <a className="text-link" href={`/login${safeNextQuery(searchParams.get("next"))}`}>Συνδέσου →</a></p>
  </form>;
}

function safeNextQuery(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "";
  return `?next=${encodeURIComponent(value)}`;
}
