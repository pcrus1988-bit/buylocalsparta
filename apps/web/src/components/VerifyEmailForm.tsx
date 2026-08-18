"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

export function VerifyEmailForm({ token }: { token: string }) {
  const searchParams = useSearchParams();
  const [state, setState] = useState<"idle" | "busy" | "verified" | "error">("idle");
  const [error, setError] = useState("");

  async function verify() {
    setState("busy");
    setError("");
    try {
      const response = await fetch("/api/account/verify-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Η επιβεβαίωση απέτυχε.");
      setState("verified");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η επιβεβαίωση απέτυχε.");
      setState("error");
    }
  }

  const requested = searchParams.get("next") ?? "";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/account";
  const loginHref = `/login?verified=1&next=${encodeURIComponent(next)}`;

  if (state === "verified") {
    return <div className="account-gate" role="status">
      <strong>Το email επιβεβαιώθηκε.</strong>
      <p>Ο λογαριασμός σου είναι ενεργός. Μπορείς τώρα να συνδεθείς και να συνεχίσεις από εκεί που έμεινες.</p>
      <a className="button" href={loginHref}>Σύνδεση</a>
    </div>;
  }

  return <div className="login-form">
    <p>Για λόγους ασφαλείας, η ενεργοποίηση γίνεται μόνο αφού επιλέξεις επιβεβαίωση στη σελίδα αυτή.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button" type="button" onClick={verify} disabled={state === "busy"}>{state === "busy" ? "Επιβεβαίωση…" : "Επιβεβαίωση email"}</button>
    <a className="text-link" href="/login">Πίσω στη σύνδεση →</a>
  </div>;
}
