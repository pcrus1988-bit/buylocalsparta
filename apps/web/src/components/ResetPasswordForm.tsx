"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!token) throw new Error("Ο σύνδεσμος επαναφοράς λείπει. Ζήτησε νέο σύνδεσμο.");
      if (password !== password.trim()) throw new Error("Ο κωδικός δεν μπορεί να αρχίζει ή να τελειώνει με κενό.");
      if (password !== passwordConfirmation) throw new Error("Οι δύο κωδικοί δεν ταιριάζουν.");
      const response = await fetch("/api/account/password-reset/consume", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password, passwordConfirmation })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Η επαναφορά κωδικού απέτυχε.");
      router.replace("/login?reset=1");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η επαναφορά κωδικού απέτυχε.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="login-form" onSubmit={submit}>
    {!token && <div className="account-gate"><strong>Ο σύνδεσμος δεν είναι πλήρης.</strong><p>Ζήτησε νέο email επαναφοράς για να συνεχίσεις.</p><a className="text-link" href="/forgot-password">Νέος σύνδεσμος →</a></div>}
    <label htmlFor="reset-password">Νέος κωδικός</label>
    <input id="reset-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} aria-describedby="reset-password-hint" />
    <small id="reset-password-hint">Τουλάχιστον 10 χαρακτήρες. Μην αφήνεις κενό στην αρχή ή στο τέλος.</small>
    <label htmlFor="reset-password-confirmation">Επανάληψη νέου κωδικού</label>
    <input id="reset-password-confirmation" type="password" autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} required minLength={10} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button" type="submit" disabled={busy || !token}>{busy ? "Αλλαγή…" : "Αλλαγή κωδικού"}</button>
    <p className="login-demo-note"><a className="text-link" href="/forgot-password">Χρειάζεσαι νέο σύνδεσμο; →</a></p>
  </form>;
}
