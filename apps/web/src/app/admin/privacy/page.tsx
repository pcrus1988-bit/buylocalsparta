import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminPrivacyWorkspace } from "../../../lib/admin-governance-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { marketplaceReferenceMap } from "../../../lib/public-reference-service";
import { PROCESSING_ACTIVITIES, PROVIDER_GOVERNANCE, RETENTION_RULES, governanceCounts } from "../../../lib/privacy-governance";

export default async function Page({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  try { data = await adminPrivacyWorkspace(principal); } catch { redirect("/admin"); }
  const params = await searchParams;
  const customerFilter = params.customer?.trim();
  const requests = customerFilter ? data.requests.filter((request) => request.userId === customerFilter) : data.requests;
  const requestReferences = await marketplaceReferenceMap("privacy", requests.map((request) => request.id));
  const submitted = requests.filter((request) => request.status === "submitted").length;
  const processing = requests.filter((request) => request.status === "processing").length;
  const completed = requests.filter((request) => ["completed", "partial", "partially_completed"].includes(request.status)).length;
  const overdue = requests.filter((request) => ["submitted", "processing"].includes(request.status) && request.targetAt < Date.now()).length;
  const governance = governanceCounts();

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">GDPR operations</div><h1>Privacy & data governance</h1><p className="lead">DSAR operations, ROPA, retention και provider governance σε ένα ελεγχόμενο workspace. Τα entries με review state δεν παρουσιάζονται ως ολοκληρωμένα μέχρι να υπάρχει τεχνική και νομική τεκμηρίωση.</p>{customerFilter && <div className="hero-actions"><span className="status-pill">Customer filter</span><Link className="text-link" href={`/admin/customers/${encodeURIComponent(customerFilter)}`}>Customer 360 →</Link><Link className="text-link" href="/admin/privacy">Clear filter →</Link></div>}</div></section>

    <WorkspaceMetricStrip items={[
      { label: customerFilter ? "Matching requests" : "Requests", value: requests.length },
      { label: "Submitted", value: submitted, tone: submitted ? "attention" : "default" },
      { label: "Overdue", value: overdue, tone: overdue ? "attention" : completed ? "positive" : "default", hint: `${processing} processing` },
      { label: "ROPA activities", value: governance.activities, hint: `${governance.activitiesNeedingReview} partial / review` },
      { label: "Retention rules", value: governance.retentionRules, hint: `${governance.retentionNeedingReview} partial / review` },
      { label: "Providers", value: governance.providers, hint: `${governance.providersNeedingContractReview} contract/role reviews` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Data subject requests" title="Request queue" note="Completion δεν σημαίνει διαγραφή statutory records όταν υπάρχει υποχρεωτική retention." />
      {requests.length === 0 ? <WorkspaceEmptyState title={customerFilter ? "Δεν υπάρχουν privacy requests για αυτόν τον customer." : "Δεν υπάρχουν privacy requests."} /> : <div className="workspace-queue-list">{requests.map((request) => {
        const targetAt = new Date(request.targetAt);
        const isOverdue = targetAt.getTime() < Date.now() && !["completed", "partial", "partially_completed", "rejected"].includes(request.status);
        return <article className="workspace-queue-card" key={request.id}>
          <div className="workspace-queue-head"><div><strong>{requestReferences.get(request.id) ?? request.id}</strong><small>{request.type} · Target {targetAt.toLocaleDateString("el-GR")}{isOverdue ? " · overdue" : ""}</small></div><span className="status-pill">{request.status}</span></div>
          <WorkspaceRecordDetails label="Request context"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Type</strong><span>{request.type}</span></div><div className="workspace-compact-row"><strong>Customer</strong><span>Customer account</span><small><Link className="text-link" href={`/admin/customers/${encodeURIComponent(request.userId)}`}>Customer 360 →</Link></small></div></div></WorkspaceRecordDetails>
          {!['completed', 'partial', 'partially_completed', 'rejected'].includes(request.status) && <div className="workspace-action-bar"><span>{isOverdue ? "Target date has passed — prioritise this request." : `Current state: ${request.status}`}</span><div className="workspace-action-buttons">{request.status === "submitted" && <AdminActionButton label="Start processing" endpoint="/api/admin/privacy/action" csrfToken={data.csrfToken} body={{ requestId: request.id, action: "start" }} />}{["submitted", "processing"].includes(request.status) && <><AdminActionButton label="Complete" endpoint="/api/admin/privacy/action" csrfToken={data.csrfToken} body={{ requestId: request.id, action: "complete" }} /><AdminActionButton label="Partial + retention" endpoint="/api/admin/privacy/action" csrfToken={data.csrfToken} body={{ requestId: request.id, action: "partial" }} /></>}</div></div>}
        </article>;
      })}</div>}
    </section>

    {!customerFilter && <>
      <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow="ROPA" title="Processing activities" note="Machine-readable source of truth for purpose, lawful basis, systems, recipients, access and retention linkage." />
        <div className="workspace-queue-list">{PROCESSING_ACTIVITIES.map((activity) => <article className="workspace-queue-card" key={activity.id}>
          <div className="workspace-queue-head"><div><strong>{activity.name}</strong><small>{activity.id} · retention: {activity.retentionKey}</small></div><span className="status-pill">{activity.state}</span></div>
          <WorkspaceRecordDetails label="Purpose & lawful basis"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Purpose</strong><span>{activity.purpose}</span></div><div className="workspace-compact-row"><strong>Basis</strong><span>{activity.lawfulBases.join(" · ")}</span></div><div className="workspace-compact-row"><strong>Data</strong><span>{activity.dataCategories.join(" · ")}</span></div><div className="workspace-compact-row"><strong>Recipients</strong><span>{activity.recipients.join(" · ")}</span></div><div className="workspace-compact-row"><strong>Access</strong><span>{activity.access.join(" · ")}</span></div><div className="workspace-compact-row"><strong>Systems</strong><span>{activity.systems.join(" · ")}</span></div></div></WorkspaceRecordDetails>
        </article>)}</div>
      </section>

      <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow="Retention" title="Retention registry" note="Fixed/implemented rules are separated from statutory or workflow schedules that still require approval." />
        <div className="workspace-queue-list">{RETENTION_RULES.map((rule) => <article className="workspace-queue-card" key={rule.key}>
          <div className="workspace-queue-head"><div><strong>{rule.label}</strong><small>{rule.key} · {rule.mode}</small></div><span className="status-pill">{rule.state}</span></div>
          <WorkspaceRecordDetails label="Retention rule"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Rule</strong><span>{rule.rule}</span></div><div className="workspace-compact-row"><strong>Enforcement</strong><span>{rule.enforcement}</span></div></div></WorkspaceRecordDetails>
        </article>)}</div>
      </section>

      <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow="Processors / recipients" title="Provider governance" note="A provider is not labelled a processor merely because it receives data; role allocation follows the actual purpose and legal/contractual duties." />
        <div className="workspace-queue-list">{PROVIDER_GOVERNANCE.map((provider) => <article className="workspace-queue-card" key={provider.name}>
          <div className="workspace-queue-head"><div><strong>{provider.name}</strong><small>{provider.purpose}</small></div><span className="status-pill">{provider.roleStatus}</span></div>
          <WorkspaceRecordDetails label="Provider review"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Data</strong><span>{provider.data}</span></div><div className="workspace-compact-row"><strong>Contract / role review</strong><span>{provider.contractReview}</span></div></div></WorkspaceRecordDetails>
        </article>)}</div>
      </section>

      <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow="Privacy by default" title="Legacy personalization review" note="Migration 0098 changes future database defaults only; it deliberately does not rewrite existing customer choices or legacy values." />
        <div className="workspace-queue-list"><article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Existing implicit defaults require an explicit remediation decision</strong><small>Use personalization_updated_at as provenance evidence before changing an existing profile.</small></div><span className="status-pill">review</span></div><WorkspaceRecordDetails label="Rule"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>New profiles</strong><span>Recommendations OFF · Recently viewed OFF.</span></div><div className="workspace-compact-row"><strong>Existing profiles</strong><span>Do not silently overwrite. Distinguish explicit customer changes from legacy defaults and document the remediation decision.</span></div></div></WorkspaceRecordDetails></article></div>
      </section>
    </>}
  </main>;
}
