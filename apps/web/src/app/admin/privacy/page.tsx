import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminPrivacyRequestAutomation } from "../../../components/AdminPrivacyRequestAutomation";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminPrivacyOperationalWorkspace, privacyResponsePreview } from "../../../lib/admin-privacy-operations";
import { getAdminSession } from "../../../lib/admin-session";
import { hasAdminPermission } from "../../../lib/admin-runtime";
import { PROCESSING_ACTIVITIES, PROVIDER_GOVERNANCE, RETENTION_RULES, governanceCounts } from "../../../lib/privacy-governance";

function value(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value || "—";
  return JSON.stringify(value);
}

export default async function Page({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  try { data = await adminPrivacyOperationalWorkspace(principal); } catch { redirect("/admin"); }
  const params = await searchParams;
  const customerFilter = params.customer?.trim();
  const requests = customerFilter ? data.requests.filter((request) => request.userId === customerFilter) : data.requests;
  const canManage = hasAdminPermission(principal, "privacy.manage");
  const submitted = requests.filter((request) => request.status === "submitted").length;
  const processing = requests.filter((request) => request.status === "processing").length;
  const completed = requests.filter((request) => ["completed", "partial", "partially_completed"].includes(request.status)).length;
  const overdue = requests.filter((request) => ["submitted", "processing"].includes(request.status) && request.targetAt < Date.now()).length;
  const governance = governanceCounts();

  return <main className="vendor-app admin-app admin-privacy-ops">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">GDPR operations</div>
        <h1>Privacy requests that can actually be completed.</h1>
        <p className="lead">Κάθε αίτημα συνδέεται με customer/support context. Ο Admin εκτελεί την κατάλληλη ενέργεια, παράγει report όπου χρειάζεται, ελέγχει το αποτέλεσμα και η τελική απάντηση email αποστέλλεται μόνο μετά από ρητή χειροκίνητη επιβεβαίωση.</p>
        <div className="hero-actions">
          <Link className="button button-secondary" href="/admin/customers/support?status=open">Customer Support</Link>
          <Link className="button button-secondary" href="/admin/trust">Trust</Link>
          {customerFilter && <><Link className="button button-secondary" href={`/admin/customers/${encodeURIComponent(customerFilter)}`}>Customer 360</Link><Link className="text-link" href="/admin/privacy">Clear filter →</Link></>}
        </div>
      </div>
      <aside className="dashboard-health-card">
        <span>GDPR queue</span>
        <strong>{submitted + processing} active · {overdue} overdue</strong>
        <p>{completed} completed in the current view. Report generation and account actions are audited as privacy operations.</p>
      </aside>
    </section>

    <WorkspaceMetricStrip items={[
      { label: customerFilter ? "Matching requests" : "Requests", value: requests.length },
      { label: "Submitted", value: submitted, tone: submitted ? "attention" : "default" },
      { label: "Processing", value: processing, tone: processing ? "attention" : "default" },
      { label: "Overdue", value: overdue, tone: overdue ? "attention" : completed ? "positive" : "default" },
      { label: "ROPA activities", value: governance.activities, hint: `${governance.activitiesNeedingReview} partial / review` },
      { label: "Retention rules", value: governance.retentionRules, hint: `${governance.retentionNeedingReview} partial / review` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Data subject requests" title="Operational GDPR queue" note="Linked support case → request-specific execution → report/review → manual email confirmation → completion." />
      {requests.length === 0 ? <WorkspaceEmptyState title={customerFilter ? "Δεν υπάρχουν privacy requests για αυτόν τον customer." : "Δεν υπάρχουν privacy requests."} /> : <div className="workspace-queue-list">{requests.map((request) => {
        const targetAt = new Date(request.targetAt);
        const isTerminal = ["completed","partially_completed","cancelled"].includes(request.status);
        const isOverdue = targetAt.getTime() < Date.now() && !isTerminal;
        const note = typeof request.details.note === "string" ? request.details.note : undefined;
        const automation = request.outcome.automation && typeof request.outcome.automation === "object" && !Array.isArray(request.outcome.automation) ? request.outcome.automation as Record<string, unknown> : {};
        const response = request.outcome.response && typeof request.outcome.response === "object" && !Array.isArray(request.outcome.response) ? request.outcome.response as Record<string, unknown> : {};
        return <article className={`workspace-queue-card admin-privacy-request-card${isOverdue ? " is-overdue" : ""}`} key={request.id}>
          <div className="workspace-queue-head">
            <div><strong>{request.referenceNumber}</strong><small>{request.type} · Target {targetAt.toLocaleDateString("el-GR")}{isOverdue ? " · overdue" : ""}</small></div>
            <span className="status-pill">{request.status}</span>
          </div>

          <div className="admin-privacy-customer-strip">
            <div><span>Customer</span><strong>{request.customerName}</strong><small>{request.customerEmail ?? request.userId}</small></div>
            <div><span>Account</span><strong>{request.accountStatus}</strong><small>{request.userId}</small></div>
            <div><span>Support case</span><strong>{request.supportCaseReference ?? "Not linked"}</strong><small>{request.supportCaseStatus ?? "—"}</small></div>
          </div>

          <WorkspaceRecordDetails label="Request context">
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Type</strong><span>{request.type}</span><small>Submitted {new Date(request.submittedAt).toLocaleString("el-GR")}</small></div>
              <div className="workspace-compact-row"><strong>Customer</strong><span>{request.customerName}</span><small><Link className="text-link" href={`/admin/customers/${encodeURIComponent(request.userId)}`}>Customer 360 →</Link></small></div>
              {request.supportCaseId && <div className="workspace-compact-row"><strong>Linked support</strong><span>{request.supportCaseReference}</span><small><Link className="text-link" href={`/admin/customers/support?case=${encodeURIComponent(request.supportCaseId)}`}>Open support case →</Link></small></div>}
              {note && <div className="workspace-compact-row"><strong>Customer note</strong><span>{note}</span></div>}
              {request.details.correction !== undefined && <div className="workspace-compact-row"><strong>Requested correction</strong><span>{value(request.details.correction)}</span></div>}
            </div>
          </WorkspaceRecordDetails>

          {Object.keys(automation).length > 0 && <WorkspaceRecordDetails label="Automated operation result">
            <div className="workspace-compact-list">{Object.entries(automation).map(([key,item])=><div className="workspace-compact-row" key={key}><strong>{key}</strong><span>{value(item)}</span></div>)}</div>
          </WorkspaceRecordDetails>}

          {Object.keys(response).length > 0 && <WorkspaceRecordDetails label="Customer response">
            <div className="workspace-compact-list">{Object.entries(response).map(([key,item])=><div className="workspace-compact-row" key={key}><strong>{key}</strong><span>{value(item)}</span></div>)}</div>
          </WorkspaceRecordDetails>}

          {canManage ? <AdminPrivacyRequestAutomation
            csrfToken={data.csrfToken}
            requestId={request.id}
            requestType={request.type}
            status={request.status}
            customerId={request.userId}
            details={request.details}
            outcome={request.outcome}
            responsePreview={privacyResponsePreview(request)}
          /> : <div className="workspace-inline-note">Read-only access. privacy.manage permission is required to execute or respond.</div>}
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
        <WorkspaceSectionHeading eyebrow="Privacy by default" title="Legacy personalization review" note="Existing choices are not silently overwritten; remediation requires evidence and audit." />
        <div className="workspace-queue-list"><article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Existing implicit defaults require an explicit remediation decision</strong><small>Use personalization_updated_at as provenance evidence before changing an existing profile.</small></div><span className="status-pill">review</span></div><WorkspaceRecordDetails label="Rule"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>New profiles</strong><span>Recommendations OFF · Recently viewed OFF.</span></div><div className="workspace-compact-row"><strong>Existing profiles</strong><span>Do not silently overwrite. Distinguish explicit customer changes from legacy defaults and document the remediation decision.</span></div></div></WorkspaceRecordDetails></article></div>
      </section>
    </>}
  </main>;
}
