import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceFilterBar, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading, WorkspaceStatusBadge } from "../../../components/WorkspacePagePrimitives";
import { adminFinanceWorkspace } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Finance", robots: { index: false, follow: false } };
type PageSearchParams = Promise<{ q?: string | string[]; status?: string | string[]; view?: string | string[] }>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
const procurementPriority: Record<string, number> = { matched: 0, payable: 1, accrued: 2, invoiced: 3, settled: 4, paid: 5 };
const settlementPriority: Record<string, number> = { approval_required: 0, approved: 1, draft: 2, submitted: 3, paid: 4, closed: 5 };

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  try { data = await adminFinanceWorkspace(principal); } catch { redirect("/admin"); }

  const params = await searchParams;
  const query = one(params.q).trim();
  const status = one(params.status) || "all";
  const view = one(params.view) || "all";
  const needle = query.toLocaleLowerCase("el");
  const matched = data.procurements.filter((item) => item.status === "matched").length;
  const payable = data.procurements.filter((item) => item.status === "payable").length;
  const approvalRequired = data.settlements.filter((item) => item.status === "approval_required").length;
  const approved = data.settlements.filter((item) => item.status === "approved").length;
  const statuses = [...new Set([...data.procurements.map((item) => item.status), ...data.settlements.map((item) => item.status)].filter(Boolean))].sort((a, b) => a.localeCompare(b, "el"));

  const filteredProcurements = data.procurements
    .filter((item) => {
      if (view === "settlements") return false;
      if (status !== "all" && item.status !== status) return false;
      if (!needle) return true;
      return [item.id, item.orderId, item.vendorId, item.status, item.invoiceNumber, item.grossLabel, item.payableLabel].filter(Boolean).join(" ").toLocaleLowerCase("el").includes(needle);
    })
    .sort((a, b) => (procurementPriority[a.status] ?? 99) - (procurementPriority[b.status] ?? 99) || a.id.localeCompare(b.id));

  const filteredSettlements = data.settlements
    .filter((batch) => {
      if (view === "procurements") return false;
      if (status !== "all" && batch.status !== status) return false;
      if (!needle) return true;
      return [batch.batchNumber, batch.id, batch.status, batch.createdBy, batch.totalPayableLabel]
        .filter(Boolean).join(" ").toLocaleLowerCase("el").includes(needle);
    })
    .sort((a, b) => (settlementPriority[a.status] ?? 99) - (settlementPriority[b.status] ?? 99) || a.batchNumber.localeCompare(b.batchNumber));

  const visibleCount = filteredProcurements.length + filteredSettlements.length;
  const sourceCount = view === "procurements" ? data.procurements.length : view === "settlements" ? data.settlements.length : data.procurements.length + data.settlements.length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Maker / checker</div><h1>Finance</h1><p className="lead">Δες πρώτα matched payables και checker approvals. Τα ολοκληρωμένα records μένουν διαθέσιμα χωρίς να γεμίζουν την πρώτη οθόνη.</p></div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Procurements", value: data.procurements.length },
      { label: "Matched", value: matched, tone: matched ? "attention" : "default", hint: "awaiting payable approval" },
      { label: "Payable", value: payable, tone: payable ? "attention" : "default" },
      { label: "Checker / payout", value: approvalRequired + approved, tone: approvalRequired + approved ? "attention" : "default", hint: `${approvalRequired} approval · ${approved} payout` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Finance queue" title="Approvals & settlement" note="Φίλτραρε ανά στάδιο. Τα records που απαιτούν ανθρώπινη απόφαση ταξινομούνται πρώτα." />
      <WorkspaceFilterBar
        action="/admin/finance"
        query={query}
        queryPlaceholder="Procurement, order, vendor, invoice, batch…"
        filters={[
          { name: "view", label: "Workflow", value: view, options: [{ value: "all", label: "Όλα" }, { value: "procurements", label: "Procurements" }, { value: "settlements", label: "Settlements" }] },
          { name: "status", label: "Κατάσταση", value: status, options: [{ value: "all", label: "Όλες" }, ...statuses.map((value) => ({ value, label: value.replaceAll("_", " ") }))] }
        ]}
        resultLabel={`${visibleCount} από ${sourceCount} finance records`}
        resetHref="/admin/finance"
      />

      {view !== "settlements" && <div className="workspace-queue-subsection">
        <WorkspaceSectionHeading eyebrow="Supplier accounting" title="Procurements" note="Μόνο matched procurements μπορούν να γίνουν payable." />
        {data.procurements.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν supplier procurements." body="Fulfilled customer lines θα δημιουργήσουν accruals εδώ." /> : filteredProcurements.length === 0 ? <WorkspaceEmptyState eyebrow="Χωρίς αποτελέσματα" title="Δεν υπάρχουν procurements με αυτά τα φίλτρα." /> : <div className="workspace-queue-list">{filteredProcurements.map((item) => <article className="workspace-queue-card" key={item.id}>
          <div className="workspace-queue-head"><div><strong>{item.id}</strong><small>Order {item.orderId} · Vendor {item.vendorId}</small></div><WorkspaceStatusBadge status={item.status} /></div>
          <div className="workspace-queue-primary"><span>Gross {item.grossLabel}</span><span>Payable {item.payableLabel}</span><span>Invoice {item.invoiceNumber ?? "—"}</span></div>
          <WorkspaceRecordDetails label="Accounting references"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Procurement</strong><span>{item.id}</span></div><div className="workspace-compact-row"><strong>Order / vendor</strong><span>{item.orderId} · {item.vendorId}</span></div></div></WorkspaceRecordDetails>
          <div className="workspace-action-bar"><span>State: <strong>{item.status}</strong></span><div className="workspace-action-buttons">{item.status === "matched" && <AdminActionButton label="Approve payable" endpoint="/api/admin/finance/procurement" csrfToken={data.csrfToken} body={{ procurementId: item.id }} />}</div></div>
        </article>)}</div>}
      </div>}

      {view !== "procurements" && <div className="workspace-queue-subsection">
        <WorkspaceSectionHeading eyebrow="Settlement" title="Settlement batches" note="Ο maker δεν μπορεί να εγκρίνει το ίδιο payout." action={payable > 0 ? <AdminActionButton label={`Create batch · ${payable}`} endpoint="/api/admin/finance/settlement" csrfToken={data.csrfToken} body={{ kind: "create", procurementIds: data.procurements.filter((item) => item.status === "payable").map((item) => item.id) }} /> : undefined} />
        {data.settlements.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν settlement batches." body={payable ? "Υπάρχουν payable procurements διαθέσιμα για νέο batch." : "Όταν εγκριθούν payables, μπορεί να δημιουργηθεί settlement batch."} /> : filteredSettlements.length === 0 ? <WorkspaceEmptyState eyebrow="Χωρίς αποτελέσματα" title="Δεν υπάρχουν settlement batches με αυτά τα φίλτρα." /> : <div className="workspace-queue-list">{filteredSettlements.map((batch) => <article className="workspace-queue-card" key={batch.id}>
          <div className="workspace-queue-head"><div><strong>{batch.batchNumber}</strong><small>{batch.lines.length} lines · Maker {batch.createdBy}</small></div><WorkspaceStatusBadge status={batch.status} /></div>
          <div className="workspace-queue-primary"><span>Total {batch.totalPayableLabel}</span><span>{batch.lines.length} procurements</span></div>
          <WorkspaceRecordDetails label="Batch details"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Batch ID</strong><span>{batch.id}</span></div><div className="workspace-compact-row"><strong>Maker</strong><span>{batch.createdBy}</span></div></div></WorkspaceRecordDetails>
          <div className="workspace-action-bar"><span>Settlement state: <strong>{batch.status}</strong></span><div className="workspace-action-buttons">
            {batch.status === "draft" && <AdminActionButton label="Submit for approval" endpoint="/api/admin/finance/settlement" csrfToken={data.csrfToken} body={{ kind: "submit", batchId: batch.id }} />}
            {batch.status === "approval_required" && <AdminActionButton label="Checker approve" endpoint="/api/admin/finance/settlement" csrfToken={data.csrfToken} body={{ kind: "approve", batchId: batch.id }} />}
            {batch.status === "approved" && <AdminActionButton label="Record payout" endpoint="/api/admin/finance/settlement" csrfToken={data.csrfToken} body={{ kind: "pay", batchId: batch.id }} extraPrompt={{ field: "payoutReference", message: "External bank / PSP payout reference" }} />}
          </div></div>
        </article>)}</div>}
      </div>}
    </section>
  </main>;
}
