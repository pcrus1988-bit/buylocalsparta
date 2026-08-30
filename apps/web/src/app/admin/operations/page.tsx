import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminOperationsWorkspace } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · System Health & Audit", robots: { index: false, follow: false } };

const HEALTHY_STATES = new Set(["ready", "healthy", "ok", "disabled"]);
const STRICT_HEALTHY_STATES = new Set(["ready", "healthy", "ok"]);

function checkNeedsAttention(state: unknown) {
  return !HEALTHY_STATES.has(String(state).toLowerCase());
}

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await adminOperationsWorkspace(principal);
  const nonReady = data.health.checks.filter((check) => checkNeedsAttention(check.state)).length;
  const criticalIssues = data.health.checks.filter((check) => check.critical && !STRICT_HEALTHY_STATES.has(String(check.state).toLowerCase())).length;
  const personalDataEvents = data.security.events.filter((event) => event.type.startsWith("personal_data."));
  const highSecurityEvents = data.security.events.filter((event) => ["high", "critical"].includes(String(event.severity).toLowerCase()) && event.occurredAt >= Date.now() - 24 * 60 * 60 * 1000);
  const slowest = [...data.health.checks].sort((a, b) => b.latencyMs - a.latencyMs)[0];
  const attentionChecks = [...data.health.checks]
    .filter((check) => checkNeedsAttention(check.state))
    .sort((a, b) => Number(b.critical) - Number(a.critical) || b.latencyMs - a.latencyMs);
  const missionState = criticalIssues > 0 ? "RED" : nonReady > 0 || highSecurityEvents.length > 0 ? "AMBER" : "GREEN";
  const missionNote = missionState === "RED"
    ? "Critical dependency failure: customer-facing commerce should be treated as degraded until cleared."
    : missionState === "AMBER"
      ? "Core commerce is reachable, but at least one operational signal needs attention."
      : "No current dependency or high-severity security signal requires operator action.";

  return <main className="vendor-app admin-app admin-platform-health">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Platform · Health & Audit</div><h1>System Health & Audit</h1><p className="lead">Incident-focused view of live dependencies, security telemetry, audit evidence and privacy-access accountability. Platform Overview owns the technical summary; this workspace owns investigation evidence.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Platform state", value: missionState, tone: missionState === "GREEN" ? "positive" : "attention", hint: missionNote },
      { label: "Checks", value: data.health.checks.length },
      { label: "Needs attention", value: nonReady, tone: nonReady ? "attention" : "positive" },
      { label: "Critical issues", value: criticalIssues, tone: criticalIssues ? "attention" : "positive" },
      { label: "Slowest check", value: slowest ? `${slowest.latencyMs} ms` : "—", hint: slowest?.name },
      { label: "High security · 24h", value: highSecurityEvents.length, tone: highSecurityEvents.length ? "attention" : "positive" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Active signals" title={missionState === "GREEN" ? "No active operational incident" : `${attentionChecks.length} signal${attentionChecks.length === 1 ? "" : "s"} need attention`} note={missionNote} />
      {attentionChecks.length === 0 ? <WorkspaceEmptyState title="System health is green." body="All current dependency checks are healthy or intentionally disabled, and no high-severity security signal is present in the current window." /> : <div className="workspace-queue-list">{attentionChecks.map((check) => <article className="workspace-queue-card" key={`incident-${check.name}`}>
        <div className="workspace-queue-head"><div><strong>{check.critical ? "Critical" : "Operational"} · {check.name}</strong><small>{check.message ?? "Dependency reported a non-ready state."}</small></div><span className="status-pill needs-attention">{check.state}</span></div>
        <div className="workspace-queue-primary"><span>{check.latencyMs} ms</span><span>{check.critical ? "commerce gate" : "follow-up required"}</span></div>
      </article>)}</div>}
      <div className="workspace-inline-actions">
        <a className="button button-secondary" href="/admin/platform">Platform Overview</a>
        <a className="button button-secondary" href="/admin/activation">Production Readiness</a>
        <a className="button button-secondary" href="/admin/delivery">Delivery</a>
        <a className="button button-secondary" href="/admin/catalogue-crawler">Crawler</a>
        <a className="button button-secondary" href="/admin/finance">Finance</a>
        <a className="button button-secondary" href="/admin/email-lab">Email</a>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Live dependencies" title="Readiness checks" note="These checks are read from the production operational runtime. Disabled non-critical integrations remain visible as configuration state instead of being misreported as outages." />
      <div className="workspace-queue-list">{data.health.checks.map((check) => {
        const healthy = HEALTHY_STATES.has(String(check.state).toLowerCase());
        return <article className="workspace-queue-card" key={check.name}>
          <div className="workspace-queue-head"><div><strong>{check.name}</strong><small>{check.message ?? (check.critical ? "Critical dependency" : "Non-critical dependency")}</small></div><span className={`status-pill${healthy ? "" : " needs-attention"}`}>{check.state}</span></div>
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
