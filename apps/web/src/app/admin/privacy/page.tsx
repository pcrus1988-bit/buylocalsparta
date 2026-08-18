import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminPrivacyWorkspace } from "../../../lib/admin-governance-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  try { data = await adminPrivacyWorkspace(principal); } catch { redirect("/admin"); }
  const submitted = data.requests.filter((request) => request.status === "submitted").length;
  const processing = data.requests.filter((request) => request.status === "processing").length;
  const completed = data.requests.filter((request) => ["completed", "partial"].includes(request.status)).length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">GDPR operations</div><h1>Privacy requests</h1><p className="lead">Προτεραιότητα στα overdue και submitted requests, με retention-aware completion και καθαρό processing state.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Requests", value: data.requests.length },
      { label: "Submitted", value: submitted, tone: submitted ? "attention" : "default" },
      { label: "Processing", value: processing },
      { label: "Overdue", value: data.overdue, tone: data.overdue ? "attention" : completed ? "positive" : "default", hint: `${completed} completed / partial` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Data subject requests" title="Request queue" note="Completion δεν σημαίνει διαγραφή statutory records όταν υπάρχει υποχρεωτική retention." />
      {data.requests.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν privacy requests." /> : <div className="workspace-queue-list">{data.requests.map((request) => {
        const targetAt = new Date(request.targetAt);
        const overdue = targetAt.getTime() < Date.now() && !["completed", "partial", "rejected"].includes(request.status);
        return <article className="workspace-queue-card" key={request.id}>
          <div className="workspace-queue-head"><div><strong>{request.type}</strong><small>Target {targetAt.toLocaleDateString("el-GR")}{overdue ? " · overdue" : ""}</small></div><span className="status-pill">{request.status}</span></div>
          <WorkspaceRecordDetails label="Request & user references"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Request ID</strong><span>{request.id}</span></div><div className="workspace-compact-row"><strong>User ID</strong><span>{request.userId}</span></div></div></WorkspaceRecordDetails>
          {!['completed', 'partial', 'rejected'].includes(request.status) && <div className="workspace-action-bar"><span>{overdue ? "Target date has passed — prioritise this request." : `Current state: ${request.status}`}</span><div className="workspace-action-buttons">{request.status === "submitted" && <AdminActionButton label="Start processing" endpoint="/api/admin/privacy/action" csrfToken={data.csrfToken} body={{ requestId: request.id, action: "start" }} />}{["submitted", "processing"].includes(request.status) && <><AdminActionButton label="Complete" endpoint="/api/admin/privacy/action" csrfToken={data.csrfToken} body={{ requestId: request.id, action: "complete" }} /><AdminActionButton label="Partial + retention" endpoint="/api/admin/privacy/action" csrfToken={data.csrfToken} body={{ requestId: request.id, action: "partial" }} /></>}</div></div>}
        </article>;
      })}</div>}
    </section>
  </main>;
}
