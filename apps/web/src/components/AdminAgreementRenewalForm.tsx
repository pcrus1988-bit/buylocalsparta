"use client";

import { useState, type FormEvent } from "react";

const renewableStatuses = new Set(["active", "expired", "suspended", "terminated", "superseded"]);

export function AdminAgreementRenewalForm({
  agreementId,
  vendorId,
  agreementCode,
  agreementVersion,
  status,
  predecessorEndsAt,
  csrfToken
}: {
  agreementId: string;
  vendorId: string;
  agreementCode: string;
  agreementVersion: number;
  status: string;
  predecessorEndsAt?: string;
  csrfToken: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (!renewableStatuses.has(status)) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startsAt = String(form.get("startsAt") ?? "");
    const endsAt = String(form.get("endsAt") ?? "");
    const reason = String(form.get("reason") ?? "").trim();
    if (!startsAt || !endsAt || reason.length < 3) {
      setError("Συμπλήρωσε έναρξη, λήξη και αιτιολογία ανανέωσης.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/finance/agreements", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ action: "renew", agreementId, vendorId, startsAt, endsAt, reason })
      });
      const data = await response.json() as { error?: string; warning?: string };
      if (!response.ok) throw new Error(data.error ?? "Η ανανέωση απέτυχε");
      setMessage(data.warning ?? "Η νέα έκδοση δημιουργήθηκε. Συνέχισε με PDF → gov.gr → verification. Θα ενεργοποιηθεί μόνο όταν γίνει effective.");
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η ανανέωση απέτυχε");
    } finally {
      setBusy(false);
    }
  }

  return <form className="vendor-form-card" onSubmit={submit}>
    <div className="workspace-callout">
      <strong>Renew {agreementCode} · v{agreementVersion}</strong>
      <span>Η υπογεγραμμένη προηγούμενη έκδοση δεν αλλάζει. Δημιουργείται linked successor version και περνά ξανά από PDF, gov.gr και verification.</span>
    </div>
    {predecessorEndsAt && <p className="workspace-inline-note">Η νέα περίοδος δεν μπορεί να αρχίζει πριν από {new Date(predecessorEndsAt).toLocaleString("el-GR")}.</p>}
    <div className="form-grid">
      <label>Έναρξη νέας περιόδου<input name="startsAt" type="datetime-local" required /></label>
      <label>Λήξη νέας περιόδου<input name="endsAt" type="datetime-local" required /></label>
      <label className="form-span-2">Αιτιολογία / renewal note<textarea name="reason" rows={3} required placeholder="π.χ. Ανανέωση συνεργασίας για νέα 12μηνη περίοδο" /></label>
    </div>
    <div className="workspace-action-bar">
      <span>Future-dated renewal: καμία πρόωρη ενεργοποίηση.</span>
      <button className="button button-primary" disabled={busy}>{busy ? "Δημιουργία…" : "Create renewal successor"}</button>
    </div>
    {message && <p className="form-warning" role="status">{message}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}
