"use client";

import { useState } from "react";

export function VendorImpersonationControl({
  vendorId,
  vendorName,
  csrfToken
}: {
  vendorId: string;
  vendorName: string;
  csrfToken: string;
}) {
  const [reason, setReason] = useState("Admin support / troubleshooting");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) {
      setError("Add a short reason for the audit trail.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/vendors/${encodeURIComponent(vendorId)}/impersonate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken
        },
        body: JSON.stringify({ reason: trimmedReason })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; redirectTo?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not start vendor impersonation");
      window.location.assign(payload.redirectTo ?? "/vendor");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start vendor impersonation");
      setBusy(false);
    }
  }

  return <form onSubmit={start} className="workspace-action-buttons" aria-label={`Impersonate ${vendorName}`}>
    <label>
      <span className="sr-only">Impersonation reason</span>
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        minLength={3}
        maxLength={240}
        required
        aria-label="Reason for impersonation"
        title="Recorded in the Admin audit trail"
        style={{ minWidth: "220px" }}
      />
    </label>
    <button className="button" type="submit" disabled={busy}>
      {busy ? "Opening…" : "Enter vendor dashboard"}
    </button>
    {error ? <small role="alert">{error}</small> : null}
  </form>;
}
