import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminOperationsWorkspace } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · System Health & Audit", robots: { index: false, follow: false } };

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await adminOperationsWorkspace(principal);
  const nonReady = data.health.checks.filter((check) => !["ready", "healthy", "ok", "disabled"].includes(String(check.state).toLowerCase())).length;
  const criticalIssues = data.health.checks.filter((check) => check.critical && !["ready", "healthy", "ok"].includes(String(check.state).toLowerCase())).length;
  const personalDataEvents = data.security.events.filter((event) => event.type.startsWith("personal_data."));

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Platform · health & governance</div><h1>System Health & Audit</h1><p className="lead">Dependency readiness, security telemetry και audit trail σε μία τεχνική επιφάνεια, ξεχωριστά από τις καθημερινές marketplace operations.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Readiness checks", value: data.health.checks.length },
      { label: "Needs attention", value: nonReady, tone: nonReady ? "attention" : "positive" },
      { label: "Critical issues", value: criticalIssues, tone: criticalIssues ? "attention" : "positive" },
      { label: "Security events · 24h", value: data.security.summary.total }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Dependencies" title="Readiness" note="Disabled non-critical integrations are shown as configuration state, not as false production failures." />
      <div className="workspace-queue-list">{data.health.checks.map((check) => {
        const healthy = ["ready", "healthy", "ok", "disabled"].includes(String(check.state).toLowerCase());
        return <article className="workspace-queue-card" key={check.name}>
          <div className="workspace-queue-head"><div><strong>{check.name}</strong><small>{check.critical ? "Critical dependency" : "Non-critical dependency"}</small></div><span className={`status-pill${healthy ? "" : " needs-attention"}`}>{check.state}</span></div>
          <div className="workspace-queue-primary"><span>{check.latencyMs} ms</span><span>{check.critical ? "critical" : "non-critical"}</span></div>
        </article>;
      })}</div>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <div className="workspace-dual-grid">
        <article className="workspace-queue-card">
          <WorkspaceSectionHeading eyebrow="Security · 24h" title={`${data.security.summary.total} events`} />
          {Object.keys(data.security.summary.byType).length ? <div className="workspace-compact-list">{Object.entries(data.security.summary.byType).map(([type, count]) => <div className="workspace-compact-row" key={type}><strong>{type}</strong><span>{count}</span></div>)}</div> : <p className="workspace-queue-summary">No security events in the current window.</p>}
          <p className="workspace-inline-note">Security telemetry remains privacy-minimised; raw passwords, cookies and session secrets do not belong in event detail.</p>
        </article>
        <article className="workspace-queue-card">
          <WorkspaceSectionHeading eyebrow="Audit" title={`${data.audit.length} recent entries`} />
          {data.audit.length ? <div className="workspace-compact-list">{data.audit.slice(0, 8).map((entry) => <div className="workspace-compact-row" key={entry.id}><strong>{entry.action}</strong><span>{entry.entityType} · {entry.actorRole ?? "role"}</span><small>{entry.entityId}</small></div>)}</div> : <p className="workspace-queue-summary">No recent audit entries.</p>}
          {data.audit.length > 8 && <WorkspaceRecordDetails label={`Show ${data.audit.length - 8} more audit entries`}><div className="workspace-compact-list">{data.audit.slice(8).map((entry) => <div className="workspace-compact-row" key={entry.id}><strong>{entry.action}</strong><span>{entry.entityType} · {entry.actorRole ?? "role"}</span><small>{entry.entityId}</small></div>)}</div></WorkspaceRecordDetails>}
        </article>
      </div>
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Privacy access audit · 7d" title="Personal data access" note="Actor, purpose and data classes are retained for accountability. Customer identifiers and raw contact/address values are intentionally not shown in this log." />
      {personalDataEvents.length === 0 ? <WorkspaceEmptyState title="No personal-data access events in the current seven-day window." /> : <div className="workspace-queue-list">{personalDataEvents.map((event) => {
        const postgresActor = "actorUserId" in event ? event.actorUserId : undefined;
        const memoryActor = "actorId" in event ? event.actorId : undefined;
        const actorUserId = postgresActor ?? memoryActor;
        return <article className="workspace-queue-card" key={event.id}>
          <div className="workspace-queue-head"><div><strong>{event.type}</strong><small>{new Date(event.occurredAt).toLocaleString("el-GR")} · {event.route ?? "route unavailable"}</small></div><span className="status-pill">{event.severity}</span></div>
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Actor</strong><span>{actorUserId ?? "system"}</span><small>Authenticated platform identity</small></div>
            <div className="workspace-compact-row"><strong>Purpose</strong><span>{String(event.details?.purpose ?? "—")}</span><small>{String(event.details?.resourceType ?? "resource")}</small></div>
            <div className="workspace-compact-row"><strong>Data classes</strong><span>{String(event.details?.dataClasses ?? "—")}</span><small>{String(event.details?.accessScope ?? "individual")} · {String(event.details?.recordCount ?? 1)} record(s)</small></div>
          </div>
        </article>;
      })}</div>}
    </section>
  </main>;
}
