import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { adminCustomerSupportQueue } from "../../../../lib/admin-customer-support-queue";
import { CUSTOMER_SUPPORT_PRIORITIES, CUSTOMER_SUPPORT_STATUSES, type CustomerSupportPriority, type CustomerSupportStatus } from "../../../../lib/admin-customer-support";
import { getAdminSession } from "../../../../lib/admin-session";
import { hasAdminPermission } from "../../../../lib/admin-runtime";

export const metadata: Metadata = { title: "Admin · Customer support", robots: { index:false, follow:false } };

const statusLabel: Record<CustomerSupportStatus,string> = { open:"Open", waiting_customer:"Waiting customer", waiting_internal:"Waiting internal", resolved:"Resolved", closed:"Closed" };
const priorityLabel: Record<CustomerSupportPriority,string> = { low:"Low", normal:"Normal", high:"High", urgent:"Urgent" };
function dateTime(value?: number) { return value ? new Date(value).toLocaleString("el-GR") : "—"; }

export default async function Page({ searchParams }: { searchParams: Promise<{ q?:string; status?:string; priority?:string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const params = await searchParams;
  let data;
  try { data = await adminCustomerSupportQueue(principal, params); } catch { redirect("/admin"); }
  const canManage = hasAdminPermission(principal,"customer.manage");
  const filtered = Boolean(params.q?.trim() || params.status || params.priority);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Customer operations · support queue</div>
      <h1>Customer support</h1>
      <p className="lead">Όλα τα customer support cases σε μία ουρά, με προτεραιότητα, ownership και follow-up.</p>
      <div className="hero-actions"><Link className="button button-secondary" href="/admin">← Command Centre</Link><Link className="text-link" href="/admin/customers">Customer directory →</Link></div>
    </div></section>

    <WorkspaceMetricStrip items={[
      { label:"Open cases", value:data.metrics.open, tone:data.metrics.open ? "attention" : "positive" },
      { label:"Urgent", value:data.metrics.urgent, tone:data.metrics.urgent ? "attention" : "positive" },
      { label:"Unassigned", value:data.metrics.unassigned, tone:data.metrics.unassigned ? "attention" : "positive" },
      { label:"Overdue follow-up", value:data.metrics.overdue, tone:data.metrics.overdue ? "attention" : "positive" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Support queue" title="Cases που χρειάζονται χειρισμό" note="Search σε subject, case ID, customer ID, email ή όνομα. Τα ενεργά/urgent/overdue cases εμφανίζονται πρώτα." />
      {!data.databaseConfigured && <div className="workspace-inline-note">Η production βάση δεν είναι διαθέσιμη σε αυτό το preview.</div>}
      <form method="get" className="workspace-tool-panel" style={{ display:"grid", gridTemplateColumns:"minmax(220px,1fr) minmax(170px,220px) minmax(150px,200px) auto", gap:12, alignItems:"end", padding:16, marginBottom:18 }}>
        <label><span>Search</span><input name="q" defaultValue={params.q ?? ""} placeholder="Customer, email, case ID, subject" /></label>
        <label><span>Status</span><select name="status" defaultValue={params.status ?? ""}><option value="">All statuses</option>{CUSTOMER_SUPPORT_STATUSES.map((item) => <option key={item} value={item}>{statusLabel[item]}</option>)}</select></label>
        <label><span>Priority</span><select name="priority" defaultValue={params.priority ?? ""}><option value="">All priorities</option>{CUSTOMER_SUPPORT_PRIORITIES.map((item) => <option key={item} value={item}>{priorityLabel[item]}</option>)}</select></label>
        <div style={{ display:"flex", gap:8 }}><button className="button button-secondary" type="submit">Filter</button>{filtered && <Link className="text-link" href="/admin/customers/support">Clear</Link>}</div>
      </form>

      {data.cases.length === 0 ? <WorkspaceEmptyState title={filtered ? "No support cases match these filters." : "No customer support cases."} body={filtered ? "Try another status, priority or search term." : "New cases created from Customer 360 will appear here automatically."} /> : <div className="workspace-queue-list">{data.cases.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head"><div><strong>{item.subject}</strong><small>{item.id} · {item.category} · updated {dateTime(item.updatedAt)}</small></div><span className="status-pill">{statusLabel[item.status]}</span></div>
        <div className="workspace-queue-primary"><span>{priorityLabel[item.priority]} priority</span><span>{item.customerName}</span><span>{item.assignedTo ? `Owner ${item.assignedTo}` : "Unassigned"}</span><span>Follow-up {dateTime(item.followUpAt)}</span></div>
        <div className="workspace-action-bar"><span>{item.customerEmail ?? item.customerId}</span><div className="workspace-action-buttons">
          <Link className="button button-secondary" href={`/admin/customers/${encodeURIComponent(item.customerId)}`}>Customer 360</Link>
          <Link className="button button-secondary" href={`/admin/customers/${encodeURIComponent(item.customerId)}/manage`}>Profile & security</Link>
          {canManage && item.assignedTo !== principal.userId && <AdminActionButton label="Assign to me" endpoint="/api/admin/customers/cases" csrfToken={data.csrfToken} body={{ caseId:item.id, action:"assign_self" }} reasonPrompt="Reason for taking ownership" />}
          {canManage && item.status !== "resolved" && <AdminActionButton label="Resolve" endpoint="/api/admin/customers/cases" csrfToken={data.csrfToken} body={{ caseId:item.id, action:"set_status", status:"resolved" }} reasonPrompt="Resolution summary" />}
          {canManage && item.priority !== "urgent" && <AdminActionButton label="Urgent" endpoint="/api/admin/customers/cases" csrfToken={data.csrfToken} body={{ caseId:item.id, action:"set_priority", priority:"urgent" }} reasonPrompt="Reason for changing priority to urgent" danger />}
        </div></div>
      </article>)}</div>}
    </section>
  </main>;
}
