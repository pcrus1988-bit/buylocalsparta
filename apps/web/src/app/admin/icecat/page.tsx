import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { IcecatSettingsForm } from "../../../components/IcecatSettingsForm";
import {
  WorkspaceEmptyState,
  WorkspaceMetricStrip,
  WorkspaceRecordDetails,
  WorkspaceSectionHeading,
  WorkspaceStatusBadge
} from "../../../components/WorkspacePagePrimitives";
import { adminOpenIcecatHealth } from "../../../lib/admin-open-icecat-health";
import { adminIcecatWorkspace } from "../../../lib/admin-icecat-control";
import { hasAdminPermission } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const dynamic = "force-dynamic";

function ageLabel(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

function dateLabel(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("el-GR") : value;
}

function credentialTone(configured: boolean) { return configured ? "positive" as const : "attention" as const; }

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "catalog.read")) redirect("/admin");

  const [workspace, health] = await Promise.all([
    adminIcecatWorkspace(principal),
    adminOpenIcecatHealth(principal)
  ]);
  const writable = hasAdminPermission(principal, "catalog.write");

  return <main className="vendor-app admin-app admin-icecat-control">
    <AdminWorkspaceHeader csrfToken={workspace.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalogue · provider operations</div>
        <h1>Icecat Control Center</h1>
        <p className="lead">Live operational dashboard, queue health and governed runtime settings for Open Icecat. Settings are persisted centrally and consumed by the running workers without a redeploy.</p>
      </div>
    </section>

    {workspace.state !== "available" ? <section className="shell vendor-section">
      <WorkspaceEmptyState
        eyebrow={workspace.state === "not_configured" ? "Not configured" : "Unavailable"}
        title={workspace.state === "not_configured" ? "Open Icecat source is not configured for Sparta." : "Icecat operational state is temporarily unavailable."}
        body="No secret values are exposed here. Provider credentials stay in deployment secrets; operational controls live in the governed source configuration."
      />
    </section> : <>
      <WorkspaceMetricStrip
        ariaLabel="Icecat operational summary"
        items={health.state === "available" ? [
          { label: "Index products", value: health.activeIndexProducts, hint: `${health.queueableProducts} queueable · ${health.missingGtinPct}% without GTIN` },
          { label: "Detail coverage", value: `${health.detailCoveragePct}%`, hint: `${health.detailProcessed} detail records processed` },
          { label: "Greek-ready", value: `${health.readyCoveragePct}%`, tone: health.readyCoveragePct >= 90 ? "positive" : "default", hint: `${health.queue.ready} ready · ${health.queue.needsEnrichment} need enrichment` },
          { label: "Backlog", value: health.actionableBacklog, tone: health.queue.failed || health.queue.retry ? "attention" : "default", hint: `${health.completedLastHour} completed last hour` }
        ] : [
          { label: "Provider", value: "Open Icecat", hint: workspace.sourceName ?? "Configured source" },
          { label: "Index worker", value: workspace.settings.indexEnabled ? "Enabled" : "Paused", tone: workspace.settings.indexEnabled ? "positive" : "attention" },
          { label: "Detail worker", value: workspace.settings.detailEnabled ? "Enabled" : "Paused", tone: workspace.settings.detailEnabled ? "positive" : "attention" },
          { label: "Health", value: health.state === "not_configured" ? "Not configured" : "Unavailable", tone: "attention" }
        ]}
      />

      <section className="shell vendor-section">
        <WorkspaceSectionHeading
          eyebrow="Runtime"
          title="Provider & worker health"
          note="Credential values are never returned to the browser. Only configuration presence is shown."
        />
        <div className="catalogue-attention-grid">
          <article className="workspace-queue-card">
            <div className="workspace-queue-head">
              <div><strong>Connection readiness</strong><small>{workspace.sourceName} · source {workspace.sourceActive ? "active" : "inactive"}</small></div>
              <WorkspaceStatusBadge status={workspace.credentials.usernameConfigured && workspace.credentials.apiTokenConfigured ? "active" : "attention"} label={workspace.credentials.usernameConfigured && workspace.credentials.apiTokenConfigured ? "Credentials present" : "Credentials incomplete"} tone={workspace.credentials.usernameConfigured && workspace.credentials.apiTokenConfigured ? "positive" : "attention"} />
            </div>
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Username</strong><span>{workspace.credentials.usernameConfigured ? "Configured" : "Missing"}</span></div>
              <div className="workspace-compact-row"><strong>API token</strong><span>{workspace.credentials.apiTokenConfigured ? "Configured" : "Missing"}</span></div>
              <div className="workspace-compact-row"><strong>Content token</strong><span>{workspace.credentials.contentTokenConfigured ? "Configured" : "Missing / optional"}</span></div>
              <div className="workspace-compact-row"><strong>Password fallback</strong><span>{workspace.credentials.passwordConfigured ? "Configured" : "Not used"}</span></div>
            </div>
            <div className="workspace-action-bar"><span>Secrets are deployment-managed and intentionally cannot be edited from Admin.</span></div>
          </article>

          <article className="workspace-queue-card">
            <div className="workspace-queue-head">
              <div><strong>Processing contract</strong><small>Source evidence only; canonical publication remains separately governed.</small></div>
              <WorkspaceStatusBadge status="active" label="Governed" tone="positive" />
            </div>
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Bulk processing</strong><span>{workspace.processing.bulkVersion}</span></div>
              <div className="workspace-compact-row"><strong>Detail processing</strong><span>{workspace.processing.detailVersion}</span></div>
              <div className="workspace-compact-row"><strong>Settings revision</strong><span>{workspace.settings.revision === "default" ? "Deployment defaults" : dateLabel(workspace.settings.revision)}</span></div>
              {health.state === "available" && <div className="workspace-compact-row"><strong>Oldest actionable job</strong><span>{ageLabel(health.oldestActionableAgeSeconds)}</span></div>}
            </div>
          </article>
        </div>
      </section>

      {health.state === "available" && <section className="vendor-section section-tint"><div className="shell">
        <WorkspaceSectionHeading eyebrow="Queue" title="Detail enrichment pipeline" note="Ready is provider evidence quality, not product publication approval." />
        <article className="workspace-queue-card">
          <div className="workspace-queue-primary">
            <span><strong>{health.queue.pending}</strong> pending</span>
            <span><strong>{health.queue.processing}</strong> processing</span>
            <span><strong>{health.queue.retry}</strong> retry</span>
            <span><strong>{health.queue.ready}</strong> ready</span>
            <span><strong>{health.queue.needsEnrichment}</strong> needs enrichment</span>
            <span><strong>{health.queue.failed}</strong> failed</span>
            <span><strong>{health.queue.skipped}</strong> skipped</span>
          </div>
        </article>
      </div></section>}

      <section className="shell vendor-section">
        <WorkspaceSectionHeading
          eyebrow="Settings"
          title="Live Icecat behavior"
          note="Pause/resume, cadence, throughput, retry behavior and Greek quality threshold. The workers hot-reload this source configuration."
        />
        <IcecatSettingsForm csrfToken={workspace.csrfToken} settings={workspace.settings} writable={writable} />
      </section>

      <section className="vendor-section section-tint"><div className="shell">
        <WorkspaceSectionHeading eyebrow="Index ingestion" title="Latest provider runs" note="The newest full and daily runs are shown independently so recovery and freshness are visible at a glance." />
        {workspace.latestRuns.length === 0 ? <WorkspaceEmptyState eyebrow="No runs" title="No bulk ingestion run is recorded yet." body="Once the index worker completes or fails a provider run, its state will appear here." /> : <div className="catalogue-attention-grid">
          {workspace.latestRuns.map((run) => <article className="workspace-queue-card" key={run.kind}>
            <div className="workspace-queue-head">
              <div><strong>{run.kind === "full" ? "Full index" : "Daily index"}</strong><small>Started {dateLabel(run.startedAt)}</small></div>
              <WorkspaceStatusBadge status={run.status} label={run.status} tone={run.status === "completed" ? "positive" : run.status === "failed" ? "danger" : "attention"} />
            </div>
            <div className="workspace-queue-primary">
              <span><strong>{run.sourceRows}</strong> rows</span>
              <span><strong>{run.persisted}</strong> persisted</span>
              <span><strong>{run.removed}</strong> removed</span>
              <span><strong>{run.rejected}</strong> rejected</span>
              <span><strong>{run.filtered}</strong> filtered</span>
            </div>
            <WorkspaceRecordDetails label="Run details"><div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Completed</strong><span>{dateLabel(run.completedAt)}</span></div>
              <div className="workspace-compact-row"><strong>Failed</strong><span>{dateLabel(run.failedAt)}</span></div>
              <div className="workspace-compact-row"><strong>Last error</strong><span>{run.lastError ?? "—"}</span></div>
            </div></WorkspaceRecordDetails>
          </article>)}
        </div>}
      </div></section>

      <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow="Safety boundary" title="What this page can and cannot change" note="Icecat remains an evidence provider, not a publication authority." />
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Can change live</strong><span>Worker enablement, cadence, batching, timeouts, retries, lease budget and Greek quality threshold.</span></div>
          <div className="workspace-compact-row"><strong>Cannot bypass</strong><span>Canonical matching, taxonomy governance, product safety, vendor offer rules, stock, pricing or publication approval.</span></div>
          <div className="workspace-compact-row"><strong>Secrets</strong><span>Never stored in catalogue metadata and never rendered in Admin.</span></div>
        </div>
      </section>
    </>}
  </main>;
}
