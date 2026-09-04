import { redirect } from "next/navigation";
import type { Metadata } from "next";
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
import { adminOpenIcecatIngestionStatus } from "../../../lib/admin-open-icecat-ingestion";
import { adminIcecatWorkspace } from "../../../lib/admin-icecat-control";
import { hasAdminPermission } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · Icecat Control Center", robots: { index: false, follow: false, nocache: true } };

function ageLabel(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

function dateLabel(value?: string | number): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("el-GR") : String(value);
}

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "catalog.read")) redirect("/admin");

  const [workspace, health, ingestion] = await Promise.all([
    adminIcecatWorkspace(principal),
    adminOpenIcecatHealth(principal),
    adminOpenIcecatIngestionStatus(principal)
      .then((data) => ({ state: "available" as const, data }))
      .catch(() => ({ state: "unavailable" as const }))
  ]);
  const writable = hasAdminPermission(principal, "catalog.write");

  return <main className="vendor-app admin-app admin-icecat-control">
    <AdminWorkspaceHeader csrfToken={workspace.csrfToken} entityLabel="Icecat Control Center" />

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
        body="Provider credentials remain isolated on the Icecat workers. Admin reads only governed source and queue state from PostgreSQL."
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
          note="The Admin web process never receives Icecat usernames, passwords, API tokens or content tokens."
        />
        <div className="catalogue-attention-grid">
          <article className="workspace-queue-card">
            <div className="workspace-queue-head">
              <div><strong>Source & worker evidence</strong><small>{workspace.sourceName} · source {workspace.sourceActive ? "active" : "inactive"}</small></div>
              <WorkspaceStatusBadge status={health.state === "available" && workspace.sourceActive ? "active" : "attention"} label={health.state === "available" && workspace.sourceActive ? "Operational evidence available" : "Check worker/source"} tone={health.state === "available" && workspace.sourceActive ? "positive" : "attention"} />
            </div>
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Source configuration</strong><span>{workspace.sourceActive ? "Active" : "Inactive"}</span></div>
              <div className="workspace-compact-row"><strong>Operational metrics</strong><span>{health.state === "available" ? "Available" : health.state === "not_configured" ? "Not configured" : "Unavailable"}</span></div>
              <div className="workspace-compact-row"><strong>Secret scope</strong><span>Isolated Icecat workers only</span></div>
              <div className="workspace-compact-row"><strong>Admin exposure</strong><span>No credentials · no raw provider payloads</span></div>
            </div>
            <div className="workspace-action-bar"><span>Worker secrets are deployment-managed and intentionally cannot be read or edited from Admin.</span></div>
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
        <WorkspaceSectionHeading eyebrow="Index ingestion" title="Provider run history" note="The latest 12 full and daily runs stay here with their durable checkpoint, source fingerprint and reconciliation result." />
        {ingestion.state === "unavailable" ? <WorkspaceEmptyState eyebrow="Temporarily unavailable" title="Icecat run history could not be loaded." body="Source settings remain usable above. Retry this page to reload the isolated ingestion history read." /> : ingestion.data.runs.length === 0 ? <WorkspaceEmptyState eyebrow="No runs" title="No bulk ingestion run is recorded yet." body="Once the index worker completes or fails a provider run, its state will appear here." /> : <div className="catalogue-attention-grid">
          {ingestion.data.runs.map((run) => <article className="workspace-queue-card" key={run.runId}>
            <div className="workspace-queue-head">
              <div><strong>{run.importKind === "full" ? "Full index" : "Daily index"}</strong><small>Started {dateLabel(run.startedAt)} · {run.sourceName}</small></div>
              <WorkspaceStatusBadge status={run.status} label={run.status} tone={run.status === "completed" ? "positive" : run.status === "failed" ? "danger" : "attention"} />
            </div>
            <div className="workspace-queue-primary">
              <span><strong>{run.checkpoint}</strong> checkpoint</span>
              <span><strong>{run.sourceRows}</strong> rows</span>
              <span><strong>{run.persisted}</strong> persisted</span>
              <span><strong>{run.removed}</strong> removed</span>
              <span><strong>{run.rejected}</strong> rejected</span>
              <span><strong>{run.filtered}</strong> filtered</span>
            </div>
            <WorkspaceRecordDetails label="Run details"><div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Current index</strong><span>{run.activeIndexProducts} active · {run.removedIndexProducts} removed</span></div>
              <div className="workspace-compact-row"><strong>Processing version</strong><span>{run.processingVersion}</span></div>
              <div className="workspace-compact-row"><strong>Source fingerprint</strong><span title={run.sourceFingerprint}>{run.sourceFingerprint.length > 36 ? `${run.sourceFingerprint.slice(0, 33)}…` : run.sourceFingerprint}</span></div>
              <div className="workspace-compact-row"><strong>Last update</strong><span>{dateLabel(run.updatedAt)}</span></div>
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
          <div className="workspace-compact-row"><strong>Secrets</strong><span>Never stored in catalogue metadata, never sent to Vercel Admin, and never rendered in the browser.</span></div>
        </div>
      </section>
    </>}
  </main>;
}
