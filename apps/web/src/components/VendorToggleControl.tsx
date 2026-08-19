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
    {error && <small className="form-error" role="alert">{error}</small>}
  </span>;
}
