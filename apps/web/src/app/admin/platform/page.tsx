import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminActivationWorkspace, adminOperationsWorkspace, hasAdminPermission } from "../../../lib/admin-runtime";
import { adminMaintenanceWorkspace } from "../../../lib/admin-governance-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { boxNowShippingEnabled } from "../../../lib/boxnow-shipping-runtime";
import { WEB_BUILD_VERSION } from "../../../lib/build";

export const metadata: Metadata = { title: "Admin · Platform Overview", robots: { index: false, follow: false } };

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "admin.audit.read")) redirect("/admin");

  const [operations, maintenance, activation] = await Promise.all([
    adminOperationsWorkspace(principal),
    adminMaintenanceWorkspace(principal),
    adminActivationWorkspace(principal)
  ]);

  const now = Date.now();
  const criticalIssues = operations.health.checks.filter((check) => check.critical && !["ready", "healthy", "ok"].includes(String(check.state).toLowerCase())).length;
  const nonReadyChecks = operations.health.checks.filter((check) => !["ready", "healthy", "ok", "disabled"].includes(String(check.state).toLowerCase())).length;
  const failingJobs = maintenance.jobNames.filter((job) => (job.state?.consecutiveFailures ?? 0) > 0).length;
  const dueJobs = maintenance.jobNames.filter((job) => !job.state || job.state.nextRunAt <= now).length;
  const currentBuild = activation.evidence.filter((row) => row.buildVersion === WEB_BUILD_VERSION);
  const currentEvidenceIssues = currentBuild.filter((row) => row.status !== "passed" || Boolean(row.expiresAt && row.expiresAt <= now)).length;
  const boxNow = boxNowShippingEnabled();
  const canManageShipping = hasAdminPermission(principal, "fulfilment.write");
  const platformState = criticalIssues > 0 ? "RED" : nonReadyChecks > 0 || failingJobs > 0 || currentEvidenceIssues > 0 ? "AMBER" : "GREEN";
  const attentionTotal = criticalIssues + failingJobs + currentEvidenceIssues;

  return <main className="vendor-app admin-app admin-platform-overview">
    <AdminWorkspaceHeader csrfToken={operations.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Platform · Overview</div>
        <h1>Platform operations</h1>
        <p className="lead">Τεχνική υγεία, runtime jobs, integrations και production evidence σε ένα control hub. Το marketplace operations, οι παραγγελίες και τα customer/vendor workflows παραμένουν στα δικά τους operational workspaces.</p>
      </div>
      <aside className={platformState === "GREEN" ? "dashboard-health-card" : "dashboard-health-card needs-attention"}>
        <span>Platform state</span><strong>{platformState}</strong><p>{platformState === "GREEN" ? "No current platform control needs intervention." : `${attentionTotal} control signal${attentionTotal === 1 ? "" : "s"} need follow-up.`}</p>
      </aside>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Health issues", value: nonReadyChecks, tone: nonReadyChecks ? "attention" : "positive", hint: `${criticalIssues} critical` },
      { label: "Failing jobs", value: failingJobs, tone: failingJobs ? "attention" : "positive", hint: `${dueJobs} due` },
      { label: "Production evidence issues", value: currentEvidenceIssues, tone: currentEvidenceIssues ? "attention" : "positive", hint: `build ${WEB_BUILD_VERSION}` },
      { label: "BOX NOW", value: boxNow ? "ON" : "OFF", hint: boxNow ? "Provider configured" : "Provider disabled" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Platform attention" title={attentionTotal ? `${attentionTotal} control signal${attentionTotal === 1 ? "" : "s"} need attention` : "No active platform control issue"} note="Incidents, failing maintenance and stale/failed production evidence are the priority. Stable configuration stays available below without competing with active problems." />
      {attentionTotal === 0 ? <WorkspaceEmptyState title="Platform controls are clear." body="No critical health issue, failing maintenance job or current-build production-evidence issue requires follow-up." /> : <div className="platform-attention-grid">
        {criticalIssues > 0 && <Link className="admin-domain-card needs-attention" href="/admin/operations"><span>Incident</span><strong>System Health & Audit</strong><p>Critical dependency checks need investigation.</p><b>{criticalIssues}</b><i>Investigate →</i></Link>}
        {failingJobs > 0 && <Link className="admin-domain-card needs-attention" href="/admin/maintenance"><span>Runtime</span><strong>Jobs & projections</strong><p>Scheduled maintenance has consecutive failures.</p><b>{failingJobs}</b><i>Inspect jobs →</i></Link>}
        {currentEvidenceIssues > 0 && <Link className="admin-domain-card needs-attention" href="/admin/activation"><span>Production</span><strong>Production Readiness</strong><p>Current-build evidence is missing, stale, failed or blocked.</p><b>{currentEvidenceIssues}</b><i>Review evidence →</i></Link>}
      </div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Platform workspaces" title="Open the control you need" note="Each specialist workspace owns one technical responsibility. The Platform overview summarizes state; it does not duplicate their execution controls." />
      <div className="admin-domain-card-grid platform-workspace-grid">
        <Link className={`admin-domain-card${nonReadyChecks ? " needs-attention" : ""}`} href="/admin/operations"><span>Health & governance</span><strong>System Health & Audit</strong><p>Live dependencies, security telemetry, audit trail and privacy-access evidence.</p><b>{nonReadyChecks}</b><i>Open health →</i></Link>
        <Link className={`admin-domain-card${failingJobs ? " needs-attention" : ""}`} href="/admin/maintenance"><span>Runtime</span><strong>Jobs & projections</strong><p>Scheduler state, due maintenance, failures and canonical search projection.</p><b>{failingJobs}</b><i>Open runtime →</i></Link>
        {canManageShipping && <Link className="admin-domain-card" href="/admin/shipping"><span>Integration</span><strong>BOX NOW</strong><p>Courier-provider state and Vendor fulfilment-origin mapping.</p><b>{boxNow ? "ON" : "OFF"}</b><i>Configure →</i></Link>}
        <Link className={`admin-domain-card${currentEvidenceIssues ? " needs-attention" : ""}`} href="/admin/activation"><span>Production evidence</span><strong>Production Readiness</strong><p>Build-scoped provider checks and durable evidence for live-commerce readiness.</p><b>{currentEvidenceIssues}</b><i>Open readiness →</i></Link>
      </div>
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Ownership boundary" title="Platform controls infrastructure — not marketplace work" note="Order fulfilment, delivery execution and SLA escalation stay under Operations. Platform owns technical health, maintenance, integration configuration and production-readiness evidence." />
      <div className="workspace-inline-actions"><Link className="button button-secondary" href="/admin/work">Open marketplace operations</Link></div>
    </section>
  </main>;
}
