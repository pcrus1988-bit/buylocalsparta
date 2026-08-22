"use client";

import { useState } from "react";

export function ConfirmEmailChangeForm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "confirmed" | "error">("idle");
  const [error, setError] = useState("");
  const [newEmail, setNewEmail] = useState("");

  async function confirm() {
    setState("busy");
    setError("");
    try {
      const response = await fetch("/api/account/security/email-change/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token })
      });
      const body = await response.json() as { newEmail?: string; error?: string };
      if (!response.ok || !body.newEmail) throw new Error(body.error ?? "Η αλλαγή email δεν ολοκληρώθηκε.");
      setNewEmail(body.newEmail);
      setState("confirmed");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η αλλαγή email δεν ολοκληρώθηκε.");
      setState("error");
    }
  }

  if (state === "confirmed") {
    return <div className="account-gate" role="status">
      <strong>Το νέο email επιβεβαιώθηκε.</strong>
      <p>Το email σύνδεσης είναι πλέον <strong>{newEmail}</strong>. Για λόγους ασφαλείας όλες οι προηγούμενες συνεδρίες αποσυνδέθηκαν.</p>
      <a className="button" href="/login?emailChanged=1">Σύνδεση με το νέο email</a>
    </div>;
  }

  return <div className="login-form">
    <p>Η επιβεβαίωση θα αντικαταστήσει το email σύνδεσης και θα αποσυνδέσει όλες τις ενεργές συνεδρίες.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button" type="button" onClick={() => void confirm()} disabled={state === "busy"}>{state === "busy" ? "Επιβεβαίωση…" : "Επιβεβαίωση νέου email"}</button>
    <a className="text-link" href="/login">Πίσω στη σύνδεση →</a>
  </div>;
}
