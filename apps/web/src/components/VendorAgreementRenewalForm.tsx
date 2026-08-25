"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

function localInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function initialDates(currentEndsAt: string) {
  const now = new Date();
  const predecessorEnd = new Date(currentEndsAt);
  const start = predecessorEnd.getTime() > now.getTime() ? predecessorEnd : now;
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  return { start: localInputValue(start), end: localInputValue(end) };
}

export function VendorAgreementRenewalForm({
  vendorId,
  agreementId,
  agreementCode,
  currentEndsAt,
  csrfToken
}: {
  vendorId: string;
  agreementId: string;
  agreementCode: string;
  currentEndsAt: string;
  csrfToken: string;
}) {
  const router = useRouter();
  const defaults = useMemo(() => initialDates(currentEndsAt), [currentEndsAt]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/finance/agreements", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          action: "renew",
          vendorId,
          predecessorAgreementId: agreementId,
          startsAt: String(form.get("startsAt") ?? ""),
          endsAt: String(form.get("endsAt") ?? "")
        })
      });
      const data = await response.json() as { error?: string; warning?: string };
      if (!response.ok) throw new Error(data.error ?? "Renewal creation failed");
      setSuccess(data.warning ?? "Renewal created as a new linked agreement. The current signed agreement was left unchanged.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Renewal creation failed");
    } finally {
      setBusy(false);
    }
  }

  return <form className="vendor-form" onSubmit={submit}>
    <div className="workspace-inline-note">
      Renew <strong>{agreementCode}</strong> by creating a separate successor agreement. Commercial terms are copied from the current signed agreement; the predecessor is never edited.
    </div>
    <div className="form-grid form-grid-compact">
      <label><span>Renewal starts</span><input name="startsAt" type="datetime-local" defaultValue={defaults.start} required /></label>
      <label><span>Renewal ends</span><input name="endsAt" type="datetime-local" defaultValue={defaults.end} required /></label>
    </div>
    <p className="muted">For an agreement that has not yet expired, the start defaults to the existing end time. A fully signed and gov.gr-verified future renewal is scheduled and activates automatically when its term begins.</p>
    {error && <div className="workspace-inline-note" role="alert">{error}</div>}
    {success && <div className="workspace-inline-note" role="status">{success}</div>}
    <button className="button button-secondary" type="submit" disabled={busy}>{busy ? "Creating renewal…" : "Create renewal / extension"}</button>
  </form>;
}
