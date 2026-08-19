import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminPrivacyWorkspace } from "../../../lib/admin-governance-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export default async function Page({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  try { data = await adminPrivacyWorkspace(principal); } catch { redirect("/admin"); }
  const params = await searchParams;
  const customerFilter = params.customer?.trim();
  const requests = customerFilter ? data.requests.filter((request) => request.userId === customerFilter) : data.requests;
  const submitted = requests.filter((request) => request.status === "submitted").length;
  const processing = requests.filter((request) => request.status === "processing").length;
  const completed = requests.filter((request) => ["completed", "partial", "partially_completed"].includes(request.status)).length;
  const overdue = requests.filter((request) => ["submitted", "processing"].includes(request.status) && request.targetAt < Date.now()).length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">GDPR operations</div><h1>Privacy requests</h1><p className="lead">Προτεραιότητα στα overdue και submitted requests, με retention-aware completion και καθαρό processing state.</p>{customerFilter && <div className="hero-actions"><span className="status-pill">Customer {customerFilter}</span><Link className="text-link" href={`/admin/customers/${encodeURIComponent(customerFilter)}`}>Customer 360 →</Link><Link className="text-link" href="/admin/privacy">Clear filter →</Link></div>}</div></section>

    <WorkspaceMetricStrip items={[
      { label: customerFilter ? "Matching requests" : "Requests", value: requests.length },
      { label: "Submitted", value: submitted, tone: submitted ? "attention" : "default" },
      { label: "Processing", value: processing },
      { label: "Overdue", value: overdue, tone: overdue ? "attention" : completed ? "positive" : "default", hint: `${completed} completed / partial` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Data subject requests" title="Request queue" note="Completion δεν σημαίνει διαγραφή statutory records όταν υπάρχει υποχρεωτική retention." />
      {requests.length === 0 ? <WorkspaceEmptyState title={customerFilter ? "Δεν υπάρχουν privacy requests για αυτόν τον customer." : "Δεν υπάρχουν privacy requests."} /> : <div className="workspace-queue-list">{requests.map((request) => {
        const targetAt = new Date(request.targetAt);
        const isOverdue = targetAt.getTime() < Date.now() && !["completed", "partial", "partially_completed", "rejected"].includes(request.status);
        return <article className="workspace-queue-card" key={request.id}>
          <div className="workspace-queue-head"><div><strong>{request.type}</strong><small>Target {targetAt.toLocaleDateString("el-GR")}{isOverdue ? " · overdue" : ""}</small></div><span className="status-pill">{request.status}</span></div>
          <WorkspaceRecordDetails label="Request & user references"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Request ID</strong><span>{request.id}</span></div><div className="workspace-compact-row"><strong>User ID</strong><span>{request.userId}</span><small><Link className="text-link" href={`/admin/customers/${encodeURIComponent(request.userId)}`}>Customer 360 →</Link></small></div></div></WorkspaceRecordDetails>
          {!['completed', 'partial', 'partially_completed', 'rejected'].includes(request.status) && <div className="workspace-action-bar"><span>{isOverdue ? "Target date has passed — prioritise this request." : `Current state: ${request.status}`}</span><div className="workspace-action-buttons">{request.status === "submitted" && <AdminActionButton label="Start processing" endpoint="/api/admin/privacy/action" csrfToken={data.csrfToken} body={{ requestId: request.id, action: "start" }} />}{["submitted", "processing"].includes(request.status) && <><AdminActionButton label="Complete" endpoint="/api/admin/privacy/action" csrfToken={data.csrfToken} body={{ requestId: request.id, action: "complete" }} /><AdminActionButton label="Partial + retention" endpoint="/api/admin/privacy/action" csrfToken={data.csrfToken} body={{ requestId: request.id, action: "partial" }} /></>}</div></div>}
        </article>;
      })}</div>}
    </section>
  </main>;
}
