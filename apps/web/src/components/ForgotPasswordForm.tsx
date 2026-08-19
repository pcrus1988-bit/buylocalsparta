"use client";

import { useState, type FormEvent } from "react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    setResetUrl("");
    try {
      const response = await fetch("/api/account/password-reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await response.json() as { error?: string; message?: string; resetUrl?: string };
      if (!response.ok) throw new Error(data.error ?? "Το αίτημα επαναφοράς απέτυχε.");
      setSuccess(data.message ?? "Αν υπάρχει ενεργός λογαριασμός με αυτό το email, θα λάβεις σύνδεσμο επαναφοράς.");
      setResetUrl(data.resetUrl ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Το αίτημα επαναφοράς απέτυχε.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="login-form" onSubmit={submit}>
    <label htmlFor="forgot-email">Email</label>
    <input id="forgot-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
    <small>Για λόγους ασφάλειας, η ίδια απάντηση εμφανίζεται είτε υπάρχει λογαριασμός είτε όχι.</small>
    {error && <p className="form-error" role="alert">{error}</p>}
    {success && <div className="account-gate" role="status"><strong>Έλεγξε το email σου</strong><p>{success}</p>{resetUrl && <a className="text-link" href={resetUrl}>Development reset link →</a>}</div>}
    <button className="button" type="submit" disabled={busy}>{busy ? "Αποστολή…" : "Στείλε σύνδεσμο επαναφοράς"}</button>
    <p className="login-demo-note"><a className="text-link" href="/login">← Επιστροφή στη σύνδεση</a></p>
  </form>;
}
