"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { CommercialAgreementWorkspace } from "../lib/admin-commercial-agreements";

function euroMinor(value: number | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(value / 100);
}

function pct(bps: number): string { return `${(bps / 100).toLocaleString("el-GR", { maximumFractionDigits: 2 })}%`; }
function localDate(value?: string): string { return value ? new Date(value).toLocaleDateString("el-GR") : "—"; }

export function AdminCommercialAgreementsClient({ initial, csrfToken }: { initial: CommercialAgreementWorkspace; csrfToken: string }) {
  const [workspace, setWorkspace] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");

  const visible = useMemo(() => workspace.agreements.filter((agreement) => !vendorFilter || agreement.vendorId === vendorFilter), [workspace, vendorFilter]);

  async function post(payload: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/finance/agreements", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(payload)
      });
      const data = await response.json() as CommercialAgreementWorkspace & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Η ενέργεια απέτυχε");
      setWorkspace(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η ενέργεια απέτυχε");
    } finally { setBusy(false); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const percent = Number(form.get("commissionPercent"));
    const taxPercent = Number(form.get("commissionTaxPercent"));
    const listingFeeEuro = String(form.get("listingFeeEuro") ?? "").trim();
    const recurringFeeEuro = String(form.get("recurringFeeEuro") ?? "").trim();
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) { setError("Η προμήθεια πρέπει να είναι από 0% έως 100%."); return; }
    if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) { setError("Ο συντελεστής ΦΠΑ προμήθειας δεν είναι έγκυρος."); return; }
    const status = String(form.get("status") ?? "draft");
    await post({
      action: "create",
      vendorId: String(form.get("vendorId") ?? ""),
      agreementCode: String(form.get("agreementCode") ?? ""),
      agreementVersion: Number(form.get("agreementVersion") ?? 1),
      startsAt: String(form.get("startsAt") ?? ""),
      endsAt: String(form.get("endsAt") ?? "") || undefined,
      signedAt: String(form.get("signedAt") ?? "") || undefined,
      status,
      commissionRateBps: Math.round(percent * 100),
      commissionTaxMode: String(form.get("commissionTaxMode") ?? "included"),
      commissionTaxRateBps: Math.round(taxPercent * 100),
      listingFeeMinor: listingFeeEuro ? Math.round(Number(listingFeeEuro) * 100) : undefined,
      recurringFeeMinor: recurringFeeEuro ? Math.round(Number(recurringFeeEuro) * 100) : undefined,
      recurringFeePeriod: String(form.get("recurringFeePeriod") ?? "") || undefined,
      sourceDocumentReference: String(form.get("sourceDocumentReference") ?? "") || undefined,
      termsSnapshot: { enteredFrom: "admin_finance_agreements", pricingPolicy: "vendor_price_is_final_customer_price" }
    });
    event.currentTarget.reset();
  }

  return <>
    <section className="shell vendor-section">
      <div className="workspace-section-heading"><div><div className="eyebrow">Individual terms</div><h2>Νέα εμπορική συμφωνία</h2><p>Η προμήθεια αποθηκεύεται ως όρος της συγκεκριμένης συμφωνίας του vendor. Δεν αλλάζει την τιμή που βλέπει ο πελάτης.</p></div></div>
      <form className="vendor-form-card" onSubmit={create}>
        <div className="form-grid">
          <label>Vendor<select name="vendorId" required defaultValue=""><option value="" disabled>Επιλέξτε vendor</option>{workspace.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name} · {vendor.status}</option>)}</select></label>
          <label>Κωδικός συμφωνίας<input name="agreementCode" required placeholder="π.χ. BLS-2026-LITTLEDREAMERS" /></label>
          <label>Version<input name="agreementVersion" type="number" min="1" step="1" defaultValue="1" required /></label>
          <label>Προμήθεια επί πώλησης %<input name="commissionPercent" type="number" min="0" max="100" step="0.01" required placeholder="5.00" /></label>
          <label>Έναρξη<input name="startsAt" type="datetime-local" required /></label>
          <label>Λήξη, αν υπάρχει<input name="endsAt" type="datetime-local" /></label>
          <label>Υπογραφή<input name="signedAt" type="datetime-local" /></label>
          <label>Κατάσταση<select name="status" defaultValue="draft"><option value="draft">Draft</option><option value="active">Active</option></select></label>
          <label>ΦΠΑ προμήθειας<select name="commissionTaxMode" defaultValue="included"><option value="included">Περιλαμβάνεται στην προμήθεια</option><option value="plus_vat">Προστίθεται στην προμήθεια</option><option value="none">Χωρίς ΦΠΑ</option></select></label>
          <label>Συντελεστής ΦΠΑ προμήθειας %<input name="commissionTaxPercent" type="number" min="0" max="100" step="0.01" defaultValue="24" /></label>
          <label>One-time / listing fee €<input name="listingFeeEuro" type="number" min="0" step="0.01" /></label>
          <label>Recurring fee €<input name="recurringFeeEuro" type="number" min="0" step="0.01" /></label>
          <label>Περίοδος recurring fee<select name="recurringFeePeriod" defaultValue=""><option value="">—</option><option value="month">Μήνας</option><option value="year">Έτος</option><option value="term">Συμφωνημένη περίοδος</option></select></label>
          <label className="form-span-2">Reference υπογεγραμμένου εγγράφου<input name="sourceDocumentReference" placeholder="Drive / contract ID / signed document reference" /></label>
        </div>
        <div className="workspace-action-bar"><span>Active συμφωνία απαιτεί ημερομηνία υπογραφής και document reference.</span><button className="button button-primary" disabled={busy}>{busy ? "Αποθήκευση…" : "Αποθήκευση συμφωνίας"}</button></div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <div className="workspace-section-heading"><div><div className="eyebrow">Commission authority</div><h2>Συμφωνίες vendors</h2><p>Το checkout διαβάζει την ενεργή συμφωνία που ισχύει την ώρα της παραγγελίας και αποθηκεύει snapshot της προμήθειας στην order line.</p></div><label>Vendor filter<select value={vendorFilter} onChange={(event) => setVendorFilter(event.target.value)}><option value="">Όλοι</option>{workspace.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label></div>
      {visible.length === 0 ? <div className="workspace-empty-state"><strong>Δεν υπάρχουν συμφωνίες.</strong><span>Καμία προμήθεια δεν θα θεωρηθεί δεδομένη χωρίς καταχωρημένη συμφωνία.</span></div> : <div className="workspace-queue-list">{visible.map((agreement) => <article className="workspace-queue-card" key={agreement.id}>
        <div className="workspace-queue-head"><div><strong>{agreement.vendorName}</strong><small>{agreement.agreementCode} · v{agreement.agreementVersion}</small></div><span className="status-pill">{agreement.status}</span></div>
        <div className="workspace-queue-primary"><span>Commission <strong>{pct(agreement.commissionRateBps)}</strong></span><span>{agreement.commissionTaxMode} · VAT {pct(agreement.commissionTaxRateBps)}</span><span>{localDate(agreement.startsAt)} → {localDate(agreement.endsAt)}</span></div>
        <details className="workspace-record-details"><summary>Commercial terms</summary><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Agreement ID</strong><span>{agreement.id}</span></div><div className="workspace-compact-row"><strong>Signed</strong><span>{localDate(agreement.signedAt)}</span></div><div className="workspace-compact-row"><strong>Document</strong><span>{agreement.sourceDocumentReference ?? "—"}</span></div><div className="workspace-compact-row"><strong>Listing fee</strong><span>{euroMinor(agreement.listingFeeMinor)}</span></div><div className="workspace-compact-row"><strong>Recurring</strong><span>{euroMinor(agreement.recurringFeeMinor)} {agreement.recurringFeePeriod ?? ""}</span></div></div></details>
        <div className="workspace-action-bar"><span>Updated {new Date(agreement.updatedAt).toLocaleString("el-GR")}</span><div className="workspace-action-buttons">
          {agreement.status === "draft" && <button type="button" className="button button-secondary" disabled={busy} onClick={() => { const signedAt = window.prompt("Signed at (ISO date/time)", new Date().toISOString()); if (!signedAt) return; const sourceDocumentReference = window.prompt("Signed agreement document reference"); if (!sourceDocumentReference) return; void post({ action: "status", agreementId: agreement.id, status: "active", signedAt, sourceDocumentReference }); }}>Activate</button>}
          {agreement.status === "active" && <button type="button" className="button button-secondary" disabled={busy} onClick={() => void post({ action: "status", agreementId: agreement.id, status: "suspended" })}>Suspend</button>}
          {agreement.status === "suspended" && <button type="button" className="button button-secondary" disabled={busy} onClick={() => void post({ action: "status", agreementId: agreement.id, status: "active" })}>Reactivate</button>}
          {["draft","active","suspended"].includes(agreement.status) && <button type="button" className="button admin-danger" disabled={busy} onClick={() => { if (window.confirm("Terminate this agreement?")) void post({ action: "status", agreementId: agreement.id, status: "terminated", endsAt: new Date().toISOString() }); }}>Terminate</button>}
        </div></div>
      </article>)}</div>}
    </div></section>
  </>;
}
