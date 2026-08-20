"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function DailyLoginForm({ demoEnabled }: { demoEnabled: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState(demoEnabled ? "vendor1@demo.local" : "");
  const [password, setPassword] = useState(demoEnabled ? "Vendor!12345" : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/daily/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Η σύνδεση απέτυχε");
      router.replace("/daily");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η σύνδεση απέτυχε");
    } finally { setBusy(false); }
  }

  return <form className="login-form" onSubmit={submit}>
    <label htmlFor="daily-login-email">Email</label>
    <input id="daily-login-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
    <label htmlFor="daily-login-password">Κωδικός</label>
    <input id="daily-login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button" type="submit" disabled={busy}>{busy ? "Σύνδεση…" : "Άνοιγμα KONTA MOY Daily"}</button>
    {demoEnabled && <p className="login-demo-note"><strong>Development vendor:</strong> vendor1@demo.local / Vendor!12345.</p>}
  </form>;
}
