import Link from "next/link";
import type { SeoCrawlHistorySnapshot } from "../lib/seo-crawl-history";
import { AdminActionButton } from "./AdminActionButton";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

function localTime(value: string) {
  return new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));
}

function durationMs(startedAt: string, completedAt: string) {
  return Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime());
}

export function AdminSeoCrawlHistory({ history, csrfToken, canWrite }: {
  history: SeoCrawlHistorySnapshot;
  csrfToken: string;
  canWrite: boolean;
}) {
  return <>
    <section id="crawl-history" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Durable evidence" title="Crawl history" note="The latest 25 operator-triggered runs are retained here as immutable summaries. Per-route result and issue observations remain stored after lifecycle resolution." />
      <WorkspaceMetricStrip items={[
        { label: "Open issues", value: history.metrics.open, tone: history.metrics.open ? "attention" : "positive" },
        { label: "Critical open", value: history.metrics.criticalOpen, tone: history.metrics.criticalOpen ? "attention" : "positive" },
        { label: "Ignored", value: history.metrics.ignored, tone: "default" },
        { label: "Resolved", value: history.metrics.resolved, tone: "positive", hint: `${history.metrics.latestRunIssues} issue-bearing URLs in latest run` }
      ]} />
      {!history.persistenceAvailable
        ? <div className="workspace-empty-state"><strong>Persistent crawl history is unavailable.</strong><span>Live verification can still run, but PostgreSQL must be available before a crawl becomes durable evidence.</span></div>
        : history.runs.length === 0
          ? <div className="workspace-empty-state"><strong>No persisted crawl runs yet.</strong><span>Run Live HTTP Verification above to create the first immutable crawl snapshot.</span></div>
          : <div className="workspace-queue-list">{history.runs.map((run) => <article className="workspace-queue-card" key={run.id}>
              <div className="workspace-queue-head"><div><strong>{localTime(run.completedAt)}</strong><small>{run.id} · {run.actorId ?? "system"}</small></div><span className="status-pill">{run.withIssues ? `${run.withIssues} with issues` : "Healthy"}</span></div>
              <div className="workspace-queue-primary"><span>{run.completed}/{run.requested} checked · {run.healthy} healthy · limit {run.requestedLimit} · {durationMs(run.startedAt, run.completedAt)} ms</span></div>
              <details className="workspace-tool-panel" style={{ marginTop: 10 }}><summary><span><strong>Run evidence</strong><small>Origin and exact timestamps.</small></span></summary><div className="workspace-tool-body"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Origin</strong><span>{run.origin}</span></div><div className="workspace-compact-row"><strong>Started</strong><span>{run.startedAt}</span></div><div className="workspace-compact-row"><strong>Completed</strong><span>{run.completedAt}</span></div></div></div></details>
            </article>)}</div>}
    </section>

    <section id="crawl-issues" className="vendor-section section-tint admin-anchor-section"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Issue lifecycle" title="Recurring URL-level SEO problems" note="Each market + route + issue code has one durable fingerprint. Recurrence accumulates evidence; a reliable clean re-crawl may auto-resolve open findings; ignored findings remain suppressed until an operator changes their lifecycle state." />
      {history.issues.length === 0
        ? <div className="workspace-empty-state"><strong>No persisted SEO issues.</strong><span>There is no URL-level crawl issue history yet.</span></div>
        : <div className="workspace-queue-list">{history.issues.map((issue) => <article className="workspace-queue-card" key={issue.id}>
            <div className="workspace-queue-head"><div><strong>{issue.route}</strong><small>{issue.code} · last seen {localTime(issue.lastSeenAt)} · {issue.occurrenceCount} occurrence{issue.occurrenceCount === 1 ? "" : "s"}</small></div><span className="status-pill">{issue.severity} · {issue.status}</span></div>
            <div className="workspace-queue-primary"><span>{issue.detail}</span></div>
            <details className="workspace-tool-panel" style={{ marginTop: 10 }}><summary><span><strong>Lifecycle evidence</strong><small>First/last seen, latest crawl and resolution context.</small></span></summary><div className="workspace-tool-body"><div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Issue ID</strong><span>{issue.id}</span></div>
              <div className="workspace-compact-row"><strong>First seen</strong><span>{localTime(issue.firstSeenAt)}</span></div>
              <div className="workspace-compact-row"><strong>Latest run</strong><span>{issue.latestRunId}</span></div>
              {issue.resolvedAt && <div className="workspace-compact-row"><strong>Resolved</strong><span>{localTime(issue.resolvedAt)} · {issue.resolvedBy ?? "automatic"}</span></div>}
              {issue.resolutionNote && <div className="workspace-compact-row"><strong>Lifecycle note</strong><span>{issue.resolutionNote}</span></div>}
            </div></div></details>
            <div className="workspace-action-bar"><span><Link className="text-link" href={issue.route} target="_blank">Open public page ↗</Link></span>{canWrite && <div className="workspace-action-buttons">
              {issue.status === "open" && <AdminActionButton label="Ignore" endpoint="/api/admin/seo/crawl/issues/action" csrfToken={csrfToken} body={{ issueId: issue.id, action: "ignore" }} reasonPrompt="Why should this SEO issue be ignored? Minimum 5 characters." />}
              {issue.status !== "resolved" && <AdminActionButton label="Resolve" endpoint="/api/admin/seo/crawl/issues/action" csrfToken={csrfToken} body={{ issueId: issue.id, action: "resolve" }} reasonPrompt="Resolution evidence or reason. Minimum 5 characters." />}
              {issue.status !== "open" && <AdminActionButton label="Reopen" endpoint="/api/admin/seo/crawl/issues/action" csrfToken={csrfToken} body={{ issueId: issue.id, action: "reopen" }} reasonPrompt="Why is this issue being reopened? Minimum 5 characters." />}
            </div>}</div>
          </article>)}</div>}
      {history.events.length > 0 && <details className="workspace-tool-panel" style={{ marginTop: 18 }}><summary><span><strong>Recent issue events</strong><small>Append-only opened, seen, auto-resolved, ignored, resolved and reopened transitions.</small></span></summary><div className="workspace-tool-body"><div className="workspace-compact-list">{history.events.map((event) => <div className="workspace-compact-row" key={event.id}><strong>{event.eventType} · {event.route}</strong><span>{localTime(event.createdAt)} · {event.detail}{event.actorId ? ` · ${event.actorId}` : ""}</span></div>)}</div></div></details>}
    </div></section>
  </>;
}