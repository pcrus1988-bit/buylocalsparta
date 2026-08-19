"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function VendorToggleControl({
  label,
  checked,
  endpoint,
  csrfToken,
  field,
  disabled = false,
  reasonPrompt
}: Readonly<{
  label: string;
  checked: boolean;
  endpoint: string;
  csrfToken: string;
  field: "active" | "visible";
  disabled?: boolean;
  reasonPrompt?: string;
}>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function toggle() {
    if (disabled || busy) return;
    const next = !checked;
    let reason: string | undefined;
    if (reasonPrompt) {
      const supplied = window.prompt(reasonPrompt);
      if (supplied === null) return;
      reason = supplied.trim();
      if (reason.length < 3) {
        setError("Χρειάζεται σύντομη αιτιολόγηση.");
        return;
      }
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ [field]: next, reason })
      });
      const payload = await response.json() as { error?: string; notificationWarning?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η αλλαγή απέτυχε");
      if (payload.notificationWarning) setError(`Η αλλαγή ολοκληρώθηκε, αλλά το email δεν στάλθηκε: ${payload.notificationWarning}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η αλλαγή απέτυχε");
    } finally {
      setBusy(false);
    }
  }

  async function resendAccess() {
    if (disabled || busy || field !== "active" || !checked) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const accessEndpoint = endpoint.replace(/\/operational$/, "/access-invite");
      const response = await fetch(accessEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({})
      });
      const payload = await response.json() as { error?: string; destination?: string; passwordSetupRequired?: boolean };
      if (!response.ok) throw new Error(payload.error ?? "Η αποστολή email πρόσβασης απέτυχε");
      setNotice(payload.passwordSetupRequired
        ? `Στάλθηκε νέος σύνδεσμος δημιουργίας κωδικού${payload.destination ? ` στο ${payload.destination}` : ""}.`
        : `Στάλθηκε email πρόσβασης${payload.destination ? ` στο ${payload.destination}` : ""}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η αποστολή email πρόσβασης απέτυχε");
    } finally {
      setBusy(false);
    }
  }

  return <span className="admin-action-wrap">
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`button ${checked ? "" : "button-secondary"}`}
      onClick={toggle}
      disabled={disabled || busy}
      title={disabled ? "Η επιλογή δεν είναι διαθέσιμη στην τρέχουσα κατάσταση." : undefined}
    >
      {busy ? "…" : `${label}: ${checked ? "ON" : "OFF"}`}
    </button>
    {field === "active" && checked && <button type="button" className="button button-secondary" onClick={resendAccess} disabled={disabled || busy}>Resend access email</button>}
    {notice && <small role="status">{notice}</small>}
    {error && <small className="form-error" role="alert">{error}</small>}
  </span>;
}
