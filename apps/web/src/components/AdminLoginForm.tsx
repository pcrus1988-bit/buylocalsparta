"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function AdminLoginForm({ demoEnabled }: { demoEnabled: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState(demoEnabled ? "admin@demo.local" : "");
  const [password, setPassword] = useState(demoEnabled ? "AdminStrong!123" : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Admin login failed");
      router.replace("/admin"); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Admin login failed"); }
    finally { setBusy(false); }
  }
  return <form className="login-form" onSubmit={submit}>
    <label htmlFor="admin-email">Email</label><input id="admin-email" type="email" autoComplete="username" value={email} onChange={(e)=>setEmail(e.target.value)} required />
    <label htmlFor="admin-password">Password</label><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(e)=>setPassword(e.target.value)} required minLength={10} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in to Admin"}</button>
    {demoEnabled && <p className="login-demo-note"><strong>Development admin:</strong> admin@demo.local / AdminStrong!123<br/><strong>Finance checker:</strong> finance@demo.local / FinanceStrong!123</p>}
  </form>;
}
