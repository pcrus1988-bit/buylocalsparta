"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

function minorFromEuro(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return Number.NaN;
  return Math.round(parsed * 100);
}

export function VendorAgreementForm({
  vendorId,
  csrfToken,
  defaults
}: Readonly<{
  vendorId: string;
  csrfToken: string;
  defaults?: Readonly<{
    code?: string;
    commissionRateBps?: number;
    listingFeeMinor?: number;
    recurringFeeMinor?: number;
    recurringFeePeriod?: string;
    sourceDocumentReference?: string;
  }>;
}>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const listingFeeMinor = minorFromEuro(String(form.get("listingFee") ?? ""));
    const recurringFeeMinor = minorFromEuro(String(form.get("recurringFee") ?? ""));
    if (Number.isNaN(listingFeeMinor) || Number.isNaN(recurringFeeMinor)) {
      setError("Τα ποσά πρέπει να είναι θετικοί αριθμοί.");
      return;
    }
    const commissionPercent = Number(String(form.get("commissionPercent") ?? "").replace(",", "."));
    if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
      setError("Η προμήθεια πρέπει να είναι από 0% έως 100%.");
      return;
    }

    const payload = {
      agreementCode: String(form.get("agreementCode") ?? "").trim(),
      status: String(form.get("status") ?? "draft"),
      sourceDocumentReference: String(form.get("documentReference") ?? "").trim() || undefined,
      commissionRateBps: Math.round(commissionPercent * 100),
      listingFeeMinor,
      recurringFeeMinor,
      recurringFeePeriod: String(form.get("recurringPeriod") ?? "") || undefined,
      startsAt: String(form.get("startsAt") ?? "") || undefined,
      endsAt: String(form.get("endsAt") ?? "") || undefined,
      reason: String(form.get("reason") ?? "").trim()
    };

    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/vendors/${encodeURIComponent(vendorId)}/agreement`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(payload)
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Η καταχώριση συμφωνίας απέτυχε");
      formElement.reset();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η καταχώριση συμφωνίας απέτυχε");
    } finally {
      setBusy(false);
    }
  }

  return <form className="workspace-tool-body" onSubmit={submit}>
    <div className="workspace-compact-list">
      <label className="workspace-compact-row"><strong>Agreement code</strong><input name="agreementCode" required defaultValue={defaults?.code ?? ""} placeholder="π.χ. BLS-2026-001" /></label>
      <label className="workspace-compact-row"><strong>Document reference</strong><input name="documentReference" defaultValue={defaults?.sourceDocumentReference ?? ""} placeholder="Drive/Doc ID, URL ή signed file reference" /></label>
      <label className="workspace-compact-row"><strong>Status</strong><select name="status" defaultValue="active"><option value="active">Active / signed</option><option value="draft">Draft</option><option value="suspended">Suspended</option><option value="expired">Expired</option><option value="terminated">Terminated</option></select></label>
      <label className="workspace-compact-row"><strong>Sales commission %</strong><input name="commissionPercent" type="number" min="0" max="100" step="0.01" required defaultValue={((defaults?.commissionRateBps ?? 0) / 100).toFixed(2)} /></label>
      <label className="workspace-compact-row"><strong>One-time listing fee €</strong><input name="listingFee" type="number" min="0" step="0.01" defaultValue={defaults?.listingFeeMinor === undefined ? "" : (defaults.listingFeeMinor / 100).toFixed(2)} /></label>
      <label className="workspace-compact-row"><strong>Recurring fee €</strong><input name="recurringFee" type="number" min="0" step="0.01" defaultValue={defaults?.recurringFeeMinor === undefined ? "" : (defaults.recurringFeeMinor / 100).toFixed(2)} /></label>
      <label className="workspace-compact-row"><strong>Recurring period</strong><select name="recurringPeriod" defaultValue={defaults?.recurringFeePeriod ?? ""}><option value="">None</option><option value="month">Monthly</option><option value="year">Yearly</option><option value="term">Fixed term</option></select></label>
      <label className="workspace-compact-row"><strong>Starts</strong><input name="startsAt" type="date" /></label>
      <label className="workspace-compact-row"><strong>Ends</strong><input name="endsAt" type="date" /></label>
      <label className="workspace-compact-row"><strong>Audit reason</strong><input name="reason" required minLength={3} placeholder="π.χ. Signed cooperation agreement received" /></label>
    </div>
    <div className="workspace-form-actions"><button className="button" type="submit" disabled={busy}>{busy ? "Καταχώριση…" : "Καταχώριση νέας έκδοσης συμφωνίας"}</button></div>
    {error && <small className="form-error" role="alert">{error}</small>}
  </form>;
}
