import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminFinanceWorkspace } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Finance", robots: { index: false, follow: false } };

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  try { data = await adminFinanceWorkspace(principal); } catch { redirect("/admin"); }

  const matched = data.procurements.filter((item) => item.status === "matched").length;
  const payable = data.procurements.filter((item) => item.status === "payable").length;
  const approvalRequired = data.settlements.filter((item) => item.status === "approval_required").length;
  const approved = data.settlements.filter((item) => item.status === "approved").length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Maker / checker</div><h1>Finance</h1><p className="lead">Procurement matching, payable approval και settlement παραμένουν ξεχωριστά στάδια με καθαρή επόμενη ενέργεια.</p></div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Procurements", value: data.procurements.length },
      { label: "Matched", value: matched, tone: matched ? "attention" : "default", hint: "awaiting payable approval" },
      { label: "Payable", value: payable, tone: payable ? "attention" : "default" },
      { label: "Checker / payout", value: approvalRequired + approved, tone: approvalRequired + approved ? "attention" : "default", hint: `${approvalRequired} approval · ${approved} payout` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Supplier accounting" title="Procurements" note="Μόνο matched procurements μπορούν να γίνουν payable." />
      {data.procurements.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν supplier procurements." body="Fulfilled customer lines θα δημιουργήσουν accruals εδώ." /> : <div className="workspace-queue-list">{data.procurements.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head"><div><strong>{item.id}</strong><small>Order {item.orderId} · Vendor {item.vendorId}</small></div><span className="status-pill">{item.status}</span></div>
        <div className="workspace-queue-primary"><span>Gross {item.grossLabel}</span><span>Payable {item.payableLabel}</span><span>Invoice {item.invoiceNumber ?? "—"}</span></div>
        <WorkspaceRecordDetails label="Accounting references"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Procurement</strong><span>{item.id}</span></div><div className="workspace-compact-row"><strong>Order / vendor</strong><span>{item.orderId} · {item.vendorId}</span></div></div></WorkspaceRecordDetails>
        <div className="workspace-action-bar"><span>State: <strong>{item.status}</strong></span><div className="workspace-action-buttons">{item.status === "matched" && <AdminActionButton label="Approve payable" endpoint="/api/admin/finance/procurement" csrfToken={data.csrfToken} body={{ procurementId: item.id }} />}</div></div>
      </article>)}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Settlement" title="Settlement batches" note="Ο maker δεν μπορεί να εγκρίνει το ίδιο payout." action={payable > 0 ? <AdminActionButton label={`Create batch · ${payable}`} endpoint="/api/admin/finance/settlement" csrfToken={data.csrfToken} body={{ kind: "create", procurementIds: data.procurements.filter((item) => item.status === "payable").map((item) => item.id) }} /> : undefined} />
      {data.settlements.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν settlement batches." body={payable ? "Υπάρχουν payable procurements διαθέσιμα για νέο batch." : "Όταν εγκριθούν payables, μπορεί να δημιουργηθεί settlement batch."} /> : <div className="workspace-queue-list">{data.settlements.map((batch) => <article className="workspace-queue-card" key={batch.id}>
        <div className="workspace-queue-head"><div><strong>{batch.batchNumber}</strong><small>{batch.lines.length} lines · Maker {batch.createdBy}</small></div><span className="status-pill">{batch.status}</span></div>
        <div className="workspace-queue-primary"><span>Total {batch.totalPayableLabel}</span><span>{batch.lines.length} procurements</span></div>
        <WorkspaceRecordDetails label="Batch details"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Batch ID</strong><span>{batch.id}</span></div><div className="workspace-compact-row"><strong>Maker</strong><span>{batch.createdBy}</span></div></div></WorkspaceRecordDetails>
        <div className="workspace-action-bar"><span>Settlement state: <strong>{batch.status}</strong></span><div className="workspace-action-buttons">
          {batch.status === "draft" && <AdminActionButton label="Submit for approval" endpoint="/api/admin/finance/settlement" csrfToken={data.csrfToken} body={{ kind: "submit", batchId: batch.id }} />}
          {batch.status === "approval_required" && <AdminActionButton label="Checker approve" endpoint="/api/admin/finance/settlement" csrfToken={data.csrfToken} body={{ kind: "approve", batchId: batch.id }} />}
          {batch.status === "approved" && <AdminActionButton label="Record payout" endpoint="/api/admin/finance/settlement" csrfToken={data.csrfToken} body={{ kind: "pay", batchId: batch.id }} extraPrompt={{ field: "payoutReference", message: "External bank / PSP payout reference" }} />}
        </div></div>
      </article>)}</div>}
    </div></section>
  </main>;
}
