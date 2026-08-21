"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function VendorLoginForm({ demoEnabled, redirectTo = "/vendor" }: { demoEnabled: boolean; redirectTo?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(demoEnabled ? "vendor1@demo.local" : "");
  const [password, setPassword] = useState(demoEnabled ? "Vendor!12345" : "");
  const [showPassword, setShowPassword] = useState(false);
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
      await response.json().catch(() => ({}));
      if (!response.ok) throw new Error("Δεν μπορέσαμε να σε συνδέσουμε. Έλεγξε το email και τον κωδικό ή επιβεβαίωσε ότι ο λογαριασμός του καταστήματος είναι ενεργός.");
      router.replace(safeRedirect);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν μπορέσαμε να σε συνδέσουμε. Δοκίμασε ξανά.");
    } finally { setBusy(false); }
  }

  return <form className="login-form" onSubmit={submit}>
    <label htmlFor="vendor-login-email">Email συνεργάτη</label>
    <input id="vendor-login-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
    <label htmlFor="vendor-login-password">Κωδικός</label>
    <div className="vendor-login-password-row">
      <input id="vendor-login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} />
      <button className="button button-secondary" type="button" aria-pressed={showPassword} onClick={() => setShowPassword((current) => !current)}>{showPassword ? "Απόκρυψη" : "Εμφάνιση"}</button>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button" type="submit" disabled={busy}>{busy ? "Σύνδεση…" : "Σύνδεση στον χώρο συνεργάτη"}</button>
    {demoEnabled && <p className="login-demo-note"><strong>Development vendor:</strong> vendor1@demo.local / Vendor!12345. Τα demo καταστήματα είναι φανταστικά.</p>}
  </form>;
}
