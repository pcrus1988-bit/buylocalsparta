"use client";

import { useState } from "react";

type Row = Readonly<{
  route: string;
  url: string;
  status?: number;
  finalUrl?: string;
  responseTimeMs: number;
  title?: string;
  canonical?: string;
  robots?: string;
  h1Count?: number;
  issues: readonly string[];
}>;

type Report = Readonly<{
  generatedAt: string;
  requested: number;
  completed: number;
  healthy: number;
  withIssues: number;
  rows: readonly Row[];
}>;

export function AdminSeoLiveCrawler({ csrfToken, enabled }: { csrfToken: string; enabled: boolean }) {
  const [report, setReport] = useState<Report>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/seo/crawl/run", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ limit: Number(form.get("limit") ?? 40) })
      });
      const payload = await response.json() as { report?: Report; error?: string };
      if (!response.ok || !payload.report) throw new Error(payload.error ?? "Live crawl failed.");
      setReport(payload.report);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Live crawl failed.");
    } finally {
      setBusy(false);
    }
  }

  return <div>
    <form className="admin-json-form" onSubmit={run}>
      <label><span>Maximum governed URLs</span><input name="limit" type="number" min="1" max="100" defaultValue="40" disabled={!enabled || busy} required /></label>
      <button className="button" disabled={!enabled || busy}>{busy ? "Crawling…" : "Run live HTTP verification"}</button>
      {!enabled && <small><code>content.write</code> permission is required to trigger a live crawl.</small>}
      {error && <small className="form-error" role="alert">{error}</small>}
    </form>

    {report && <div style={{ marginTop: 18 }}>
      <div className="workspace-queue-primary"><span>{report.completed} checked · {report.healthy} healthy · {report.withIssues} with issues · {new Date(report.generatedAt).toLocaleString("el-GR")}</span></div>
      <div className="workspace-queue-list" style={{ marginTop: 12 }}>
        {[...report.rows].sort((a, b) => Number(a.issues.length === 0) - Number(b.issues.length === 0)).map((row) => <article className="workspace-queue-card" key={row.route}>
          <div className="workspace-queue-head"><div><strong>{row.route}</strong><small>{row.title ?? row.url}</small></div><span className="status-pill">{row.issues.length ? `${row.issues.length} issue${row.issues.length === 1 ? "" : "s"}` : "Healthy"}</span></div>
          <div className="workspace-queue-primary"><span>HTTP {row.status ?? "—"} · {row.responseTimeMs} ms · H1 {row.h1Count ?? "—"}</span></div>
          {row.issues.length > 0 && <div className="workspace-compact-list">{row.issues.map((issue) => <div className="workspace-compact-row" key={issue}><strong>Issue</strong><span>{issue}</span></div>)}</div>}
          <details className="workspace-tool-panel" style={{ marginTop: 10 }}><summary><span><strong>HTTP/SEO evidence</strong><small>Canonical, robots and final URL.</small></span></summary><div className="workspace-tool-body"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Final URL</strong><span>{row.finalUrl ?? "—"}</span></div><div className="workspace-compact-row"><strong>Canonical</strong><span>{row.canonical ?? "—"}</span></div><div className="workspace-compact-row"><strong>Robots</strong><span>{row.robots ?? "—"}</span></div></div></div></details>
        </article>)}
      </div>
    </div>}
  </div>;
}
