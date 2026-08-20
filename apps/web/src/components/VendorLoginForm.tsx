"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function VendorLoginForm({ demoEnabled, redirectTo = "/vendor" }: { demoEnabled: boolean; redirectTo?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(demoEnabled ? "vendor1@demo.local" : "");
  const [password, setPassword] = useState(demoEnabled ? "Vendor!12345" : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isAllowedRedirect = (redirectTo.startsWith("/vendor") || redirectTo.startsWith("/daily")) && !redirectTo.startsWith("//");
  const safeRedirect = isAllowedRedirect ? redirectTo : "/vendor";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/vendor/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Η σύνδεση απέτυχε");
      router.replace(safeRedirect);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η σύνδεση απέτυχε");
    } finally { setBusy(false); }
  }

  return <form className="login-form" onSubmit={submit}>
    <label htmlFor="vendor-login-email">Email</label>
    <input id="vendor-login-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
    <label htmlFor="vendor-login-password">Κωδικός</label>
    <input id="vendor-login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button" type="submit" disabled={busy}>{busy ? "Σύνδεση…" : "Σύνδεση καταστήματος"}</button>
    {demoEnabled && <p className="login-demo-note"><strong>Development vendor:</strong> vendor1@demo.local / Vendor!12345. Τα demo καταστήματα είναι φανταστικά.</p>}
  </form>;
}
