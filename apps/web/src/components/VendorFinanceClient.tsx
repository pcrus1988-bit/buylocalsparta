"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

type Workspace = { csrfToken: string; procurements: readonly any[]; settlements: readonly any[] };

export function VendorFinanceClient({ initial }: { initial: Workspace }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const invoiceNeeded = initial.procurements.filter((item) => ["accrued", "matched", "disputed"].includes(item.status) && !item.invoiceNumber).length;
  const payable = initial.procurements.filter((item) => item.status === "payable").length;
  const paid = initial.settlements.filter((item) => ["paid", "settled"].includes(item.status)).length;

  async function submit(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(id);
    setError("");
    try {
      const response = await fetch("/api/vendor/finance/invoices", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": initial.csrfToken },
        body: JSON.stringify({ procurementId: id, invoiceNumber: form.get("number"), invoiceGrossMinor: Number(form.get("gross")) })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Η υποβολή invoice απέτυχε");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η υποβολή invoice απέτυχε");
    } finally { setBusy(""); }
  }

  return <>
    {error && <div className="shell form-error vendor-error" role="alert">{error}</div>}

    <WorkspaceMetricStrip items={[
      { label: "Procurements", value: initial.procurements.length },
      { label: "Invoice needed", value: invoiceNeeded, tone: invoiceNeeded ? "attention" : "default" },
      { label: "Payable", value: payable, tone: payable ? "positive" : "default" },
      { label: "Settled batches", value: paid, tone: paid ? "positive" : "default" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Supplier invoices" title="Procurements" note="Το invoice υποβάλλεται έναντι συγκεκριμένου procurement. Approval και payout παραμένουν platform-controlled." />
      {initial.procurements.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν fulfilled procurements." body="Νέα supplier accruals θα εμφανιστούν εδώ όταν ολοκληρωθούν ανατεθειμένες γραμμές παραγγελιών." /> : <div className="workspace-queue-list">{initial.procurements.map((item) => {
        const needsInvoice = ["accrued", "matched", "disputed"].includes(item.status) && !item.invoiceNumber;
        return <article className="workspace-queue-card" key={item.id}>
          <div className="workspace-queue-head"><div><strong>Order {item.orderId}</strong><small>{item.invoiceNumber ? `Invoice ${item.invoiceNumber}` : "Invoice not submitted"}</small></div><span className="status-pill">{item.status}</span></div>
          <div className="workspace-queue-primary"><span>Gross {item.gross}</span><span>Payable {item.payable}</span><span>Fee {item.serviceFeeGross}</span></div>
          <WorkspaceRecordDetails label="Accounting breakdown & references">
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Procurement ID</strong><span>{item.id}</span></div>
              <div className="workspace-compact-row"><strong>Shipping reimbursement</strong><span>{item.shippingReimbursement}</span></div>
              <div className="workspace-compact-row"><strong>Last update</strong><span>{new Date(item.updatedAt).toLocaleString("el-GR")}</span></div>
            </div>
          </WorkspaceRecordDetails>
          {needsInvoice && <details className="workspace-tool-panel" style={{ marginTop: 12 }}>
            <summary><span><strong>Υποβολή invoice</strong><small>Χρειάζεται invoice number και gross amount σε cents.</small></span></summary>
            <div className="workspace-tool-body"><form onSubmit={(event) => void submit(event, item.id)}><div className="workspace-form-grid"><div className="workspace-form-field"><label htmlFor={`invoice-number-${item.id}`}>Invoice number</label><input id={`invoice-number-${item.id}`} name="number" required /></div><div className="workspace-form-field"><label htmlFor={`invoice-gross-${item.id}`}>Gross · cents</label><input id={`invoice-gross-${item.id}`} name="gross" required type="number" min="0" step="1" /></div></div><div className="workspace-form-actions"><button className="button" disabled={busy === item.id}>{busy === item.id ? "Υποβολή…" : "Submit invoice"}</button></div></form></div>
          </details>}
        </article>;
      })}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Read-only payout tracking" title="Settlements" note="Η σελίδα δείχνει την κατάσταση batch και payout reference χωρίς vendor approval controls." />
      {initial.settlements.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχει settlement batch για το κατάστημά σου." /> : <div className="workspace-queue-list">{initial.settlements.map((settlement) => <article className="workspace-queue-card" key={settlement.id}>
        <div className="workspace-queue-head"><div><strong>{settlement.batchNumber}</strong><small>{settlement.payoutReference ?? "Payout reference pending"}</small></div><span className="status-pill">{settlement.status}</span></div>
        <div className="workspace-queue-primary"><span>{settlement.totalPayable}</span></div>
        <WorkspaceRecordDetails label="Settlement reference"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Batch ID</strong><span>{settlement.id}</span></div>{settlement.payoutReference && <div className="workspace-compact-row"><strong>Payout reference</strong><span>{settlement.payoutReference}</span></div>}</div></WorkspaceRecordDetails>
      </article>)}</div>}
    </div></section>
  </>;
}
