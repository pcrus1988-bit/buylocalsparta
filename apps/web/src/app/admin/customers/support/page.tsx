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

export default async function Page({ searchParams }: { searchParams: Promise<{ q?:string; status?:string; priority?:string; case?:string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const params = await searchParams;
  let data;
  try { data = await adminCustomerSupportQueue(principal, params); } catch { redirect("/admin"); }
  const canManage = hasAdminPermission(principal,"customer.manage");
  const filtered = Boolean(params.q?.trim() || params.status || params.priority);
  const selected = data.cases.find((item) => item.id === params.case || item.referenceNumber === params.case) ?? data.cases[0];
  const hrefFor = (caseId: string) => {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.status) search.set("status", params.status);
    if (params.priority) search.set("priority", params.priority);
    search.set("case", caseId);
    return `/admin/customers/support?${search.toString()}`;
  };

  return <main className="vendor-app admin-app admin-customer-support">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Customer operations · service</div>
        <h1>Υποστήριξη πελατών</h1>
        <p className="lead">Η Support Queue είναι το μοναδικό operational workspace για case ownership, customer replies, internal notes, waiting states, priority, follow-up και resolution. Το Customer 360 δίνει μόνο customer context και case creation.</p>
      </div>
      <aside className="dashboard-health-card">
        <span>Queue health</span>
        <strong>{data.metrics.open} open · {data.metrics.urgent} urgent</strong>
        <p>{data.metrics.unassigned} unassigned · {data.metrics.overdue} overdue follow-up. Work is ordered by active state, priority and follow-up urgency.</p>
      </aside>
    </section>

    <WorkspaceMetricStrip items={[
      { label:"Open cases", value:data.metrics.open, tone:data.metrics.open ? "attention" : "positive" },
      { label:"Urgent", value:data.metrics.urgent, tone:data.metrics.urgent ? "attention" : "positive" },
      { label:"Unassigned", value:data.metrics.unassigned, tone:data.metrics.unassigned ? "attention" : "positive" },
      { label:"Overdue follow-up", value:data.metrics.overdue, tone:data.metrics.overdue ? "attention" : "positive" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Support queue" title="Cases που χρειάζονται χειρισμό" note="Search σε subject, public ticket reference, customer ID, email ή όνομα. Η επιλογή case διατηρεί τα ενεργά filters." />
      <form method="get" className="admin-directory-filters admin-support-filters">
        <label><span>Search</span><input name="q" defaultValue={params.q ?? ""} placeholder="Customer, email, TKT-10001, subject" /></label>
        <label><span>Status</span><select name="status" defaultValue={params.status ?? ""}><option value="">All statuses</option>{CUSTOMER_SUPPORT_STATUSES.map((item) => <option key={item} value={item}>{statusLabel[item]}</option>)}</select></label>
        <label><span>Priority</span><select name="priority" defaultValue={params.priority ?? ""}><option value="">All priorities</option>{CUSTOMER_SUPPORT_PRIORITIES.map((item) => <option key={item} value={item}>{priorityLabel[item]}</option>)}</select></label>
        <div><button className="button button-secondary" type="submit">Filter</button>{filtered && <Link className="text-link" href="/admin/customers/support">Clear</Link>}</div>
      </form>

      {!data.databaseConfigured && <div className="workspace-inline-note">Η production βάση δεν είναι διαθέσιμη σε αυτό το preview.</div>}

      {data.cases.length === 0 ? <WorkspaceEmptyState title={filtered ? "No support cases match these filters." : "No customer support cases."} /> : <div className="admin-work-queue-split">
        <div className="admin-work-list" aria-label="Support cases">
          {data.cases.map((item) => <Link href={hrefFor(item.id)} className={`admin-work-list-row${selected?.id === item.id ? " is-selected" : ""}${item.priority === "urgent" ? " is-overdue" : ""}`} key={item.id}>
            <span><strong>{item.subject}</strong><small>{item.referenceNumber} · {item.customerName}</small></span>
            <span><b>{priorityLabel[item.priority]}</b><small>{item.assignedTo ? `Owner ${item.assignedTo}` : "Unassigned"}</small></span>
          </Link>)}
        </div>

        {selected && <article className="admin-work-detail">
          <div className="admin-work-detail-head"><div><span>{selected.referenceNumber}</span><h2>{selected.subject}</h2><p>{selected.category} · updated {dateTime(selected.updatedAt)}</p></div><span className="status-pill">{statusLabel[selected.status]}</span></div>
          <div className="admin-decision-summary">
            <div><span>Priority</span><strong>{priorityLabel[selected.priority]}</strong></div>
            <div><span>Owner</span><strong>{selected.assignedTo ?? "Unassigned"}</strong></div>
            <div><span>Follow-up</span><strong>{dateTime(selected.followUpAt)}</strong></div>
          </div>
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Customer</strong><span>{selected.customerName}</span><small>{selected.customerEmail ?? selected.customerId}</small></div>
            <div className="workspace-compact-row"><strong>Case</strong><span>{selected.referenceNumber}</span><small>{selected.id}</small></div>
            <div className="workspace-compact-row"><strong>Created</strong><span>{dateTime(selected.createdAt)}</span><small>Updated {dateTime(selected.updatedAt)}</small></div>
          </div>

          <div className="workspace-action-bar"><span>Customer context</span><div className="workspace-action-buttons"><Link className="button button-secondary" href={`/admin/customers/${encodeURIComponent(selected.customerId)}`}>Customer 360</Link><Link className="button button-secondary" href={`/admin/orders?customer=${encodeURIComponent(selected.customerId)}`}>Customer orders</Link></div></div>

          {canManage && <>
            <div className="workspace-inline-note"><strong>Reply to customer</strong> writes to the customer-visible support thread. <strong>Add internal note</strong> remains an operational case record and is not shown as a customer reply.</div>

            <div className="workspace-action-bar"><span>Communication</span><div className="workspace-action-buttons">
              {selected.status !== "closed" && <AdminActionButton label="Reply to customer" endpoint="/api/admin/customers/cases/customer-reply" csrfToken={data.csrfToken} body={{ caseId:selected.id }} extraPrompt={{ field:"message", message:"Message visible to customer" }} />}
              <AdminActionButton label="Add internal note" endpoint="/api/admin/customers/cases" csrfToken={data.csrfToken} body={{ caseId:selected.id, action:"add_note" }} reasonPrompt="Internal support note" />
            </div></div>

            <div className="workspace-action-bar"><span>Ownership</span><div className="workspace-action-buttons">
              {selected.assignedTo !== principal.userId && <AdminActionButton label="Assign to me" endpoint="/api/admin/customers/cases" csrfToken={data.csrfToken} body={{ caseId:selected.id, action:"assign_self" }} reasonPrompt="Reason for taking ownership" />}
              {selected.assignedTo && <AdminActionButton label="Unassign" endpoint="/api/admin/customers/cases" csrfToken={data.csrfToken} body={{ caseId:selected.id, action:"clear_assignee" }} reasonPrompt="Reason for clearing case ownership" />}
            </div></div>

            <div className="workspace-action-bar"><span>Case state</span><div className="workspace-action-buttons">
              {selected.status !== "open" && <AdminActionButton label="Open" endpoint="/api/admin/customers/cases" csrfToken={data.csrfToken} body={{ caseId:selected.id, action:"set_status", status:"open" }} reasonPrompt="Reason for reopening the case" />}
              {selected.status !== "waiting_customer" && <AdminActionButton label="Waiting customer" endpoint="/api/admin/customers/cases" csrfToken={data.csrfToken} body={{ caseId:selected.id, action:"set_status", status:"waiting_customer" }} reasonPrompt="What are we waiting for from the customer?" />}
              {selected.status !== "waiting_internal" && <AdminActionButton label="Waiting internal" endpoint="/api/admin/customers/cases" csrfToken={data.csrfToken} body={{ caseId:selected.id, action:"set_status", status:"waiting_internal" }} reasonPrompt="What internal action is pending?" />}
              {selected.status !== "resolved" && <AdminActionButton label="Resolve" endpoint="/api/admin/customers/cases" csrfToken={data.csrfToken} body={{ caseId:selected.id, action:"set_status", status:"resolved" }} reasonPrompt="Resolution summary" />}
              {selected.status !== "closed" && <AdminActionButton label="Close" endpoint="/api/admin/customers/cases" csrfToken={data.csrfToken} body={{ caseId:selected.id, action:"set_status", status:"closed" }} reasonPrompt="Reason for closing this support case" danger />}
            </div></div>

            <div className="workspace-action-bar"><span>Priority</span><div className="workspace-action-buttons">
              {selected.priority !== "low" && <AdminActionButton label="Low" endpoint="/api/admin/customers/cases" csrfToken={data.csrfToken} body={{ caseId:selected.id, action:"set_priority", priority:"low" }} reasonPrompt="Reason for changing priority to low" />}
              {selected.priority !== "normal" && <AdminActionButton label="Normal" endpoint="/api/admin/customers/cases" csrfToken={data.csrfToken} body={{ caseId:selected.id, action:"set_priority", priority:"normal" }} reasonPrompt="Reason for changing priority to normal" />}
              {selected.priority !== "high" && <AdminActionButton label="High" endpoint="/api/admin/customers/cases" csrfToken={data.csrfToken} body={{ caseId:selected.id, action:"set_priority", priority:"high" }} reasonPrompt="Reason for changing priority to high" />}
              {selected.priority !== "urgent" && <AdminActionButton label="Urgent" endpoint="/api/admin/customers/cases" csrfToken={data.csrfToken} body={{ caseId:selected.id, action:"set_priority", priority:"urgent" }} reasonPrompt="Reason for changing priority to urgent" danger />}
            </div></div>

            <div className="workspace-action-bar"><span>Follow-up</span><div className="workspace-action-buttons">
              <AdminActionButton label="Set follow-up" endpoint="/api/admin/customers/cases" csrfToken={data.csrfToken} body={{ caseId:selected.id, action:"set_follow_up" }} reasonPrompt="Why is follow-up needed?" extraPrompt={{ field:"followUpAt", message:"Follow-up date/time (for example 2026-08-31T10:00)" }} />
              {selected.followUpAt && <AdminActionButton label="Clear follow-up" endpoint="/api/admin/customers/cases" csrfToken={data.csrfToken} body={{ caseId:selected.id, action:"set_follow_up", followUpAt:null }} reasonPrompt="Reason for clearing the follow-up" />}
            </div></div>
          </>}
        </article>}
      </div>}
    </section>
  </main>;
}
