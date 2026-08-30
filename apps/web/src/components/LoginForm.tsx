"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm({ demoEnabled }: { demoEnabled: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(demoEnabled ? "customer@demo.local" : "");
  const [password, setPassword] = useState(demoEnabled ? "Customer!123" : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const verified = searchParams.get("verified") === "1";
  const reset = searchParams.get("reset") === "1";
  const emailChanged = searchParams.get("emailChanged") === "1";
  const googleError = searchParams.get("googleError");
  const requestedNext = searchParams.get("next");
  const safeNext = requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : undefined;
  const registerHref = safeNext ? `/register?next=${encodeURIComponent(safeNext)}` : "/register";
  const googleHref = `/api/account/google/start${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Η σύνδεση απέτυχε");
      const next = safeNext ?? "/account";
      router.replace(next);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η σύνδεση απέτυχε");
    } finally {
      setBusy(false);
    }
  }

  return <form className="login-form" onSubmit={submit}>
    {verified && <div className="account-gate" role="status"><strong>Το email επιβεβαιώθηκε.</strong><p>Συνδέσου για να συνεχίσεις.</p></div>}
    {reset && <div className="account-gate" role="status"><strong>Ο κωδικός άλλαξε.</strong><p>Συνδέσου τώρα με τον νέο κωδικό σου.</p></div>}
    {emailChanged && <div className="account-gate" role="status"><strong>Το email σύνδεσης άλλαξε.</strong><p>Συνδέσου με τη νέα διεύθυνση email και τον υπάρχοντα κωδικό σου.</p></div>}
    {googleError && <div className="account-gate" role="alert"><strong>Η σύνδεση με Google δεν ολοκληρώθηκε.</strong><p>{googleError === "cancelled" ? "Η διαδικασία ακυρώθηκε. Μπορείς να δοκιμάσεις ξανά." : googleError === "unavailable" ? "Η σύνδεση με Google δεν είναι διαθέσιμη αυτή τη στιγμή." : "Δοκίμασε ξανά ή συνδέσου με email και κωδικό."}</p></div>}

    <a className="button" href={googleHref} style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.65rem", textDecoration: "none" }}>
      <span aria-hidden="true" style={{ fontWeight: 800 }}>G</span>
      Συνέχεια με Google
    </a>
    <div aria-hidden="true" style={{ textAlign: "center", opacity: 0.65, fontSize: "0.9rem" }}>ή με email</div>

    <label htmlFor="login-email">Email</label>
    <input id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
    <label htmlFor="login-password">Κωδικός</label>
    <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} />
    <div><a className="text-link" href="/forgot-password">Ξέχασες τον κωδικό; →</a></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button" type="submit" disabled={busy}>{busy ? "Σύνδεση…" : "Σύνδεση"}</button>
    <p className="login-demo-note">Δεν έχεις λογαριασμό; <a className="text-link" href={registerHref}>Δημιούργησε λογαριασμό →</a></p>
    {demoEnabled && <p className="login-demo-note"><strong>Development account:</strong> τα πεδία είναι προσυμπληρωμένα μόνο για development/preview. Όταν υπάρχει DATABASE_URL, οι πραγματικοί λογαριασμοί και τα sessions αποθηκεύονται σε PostgreSQL.</p>}
  </form>;
}
