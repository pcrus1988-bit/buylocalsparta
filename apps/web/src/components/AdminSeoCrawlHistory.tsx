import type { SeoCrawlHistorySnapshot } from "../lib/seo-crawl-history";
import { AdminSeoIssueQueue } from "./AdminSeoIssueQueue";
import { WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

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
    <AdminSeoIssueQueue history={history} csrfToken={csrfToken} canWrite={canWrite} embedded />
  </>;
}