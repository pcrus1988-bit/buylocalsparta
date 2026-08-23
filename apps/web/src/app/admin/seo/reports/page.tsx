import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminSeoReportRunner } from "../../../../components/AdminSeoReportRunner";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { getSeoUnifiedReportWorkspace } from "../../../../lib/seo-unified-report";

export const metadata: Metadata = {
  title: "SEO Reports · Admin",
  robots: { index: false, follow: false, nocache: true }
};

export const dynamic = "force-dynamic";

function when(value?: string): string {
  if (!value) return "No evidence yet";
  return new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));
}

function stateLabel(state: "pass" | "warning" | "fail" | "unknown") {
  if (state === "pass") return "Pass";
  if (state === "fail") return "Blocked";
  if (state === "warning") return "Attention";
  return "No evidence";
}

export default async function AdminSeoReportsPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await getSeoUnifiedReportWorkspace(principal);
  const canWrite = hasAdminPermission(principal, "content.write");
  const latestSaved = data.reports.reports[0];
  const previousSaved = data.reports.reports[1];

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Content · SEO & Visibility · Reports</div>
        <h1>Unified SEO release report</h1>
        <p className="lead">One operational view of governed URLs, production crawl findings, sitemap evidence, Google Search Console performance, structured data and persisted regression baselines. This is an internal release/readiness report—not a Google ranking score.</p>
      </div>
      <aside className={data.status === "blocked" ? "dashboard-health-card needs-attention" : "dashboard-health-card"}>
        <span>Current release signal</span>
        <strong>{data.status === "healthy" ? "Healthy" : data.status === "blocked" ? "Blocked" : "Needs attention"}</strong>
        <p>Generated {when(data.generatedAt)}</p>
      </aside>
    </section>

    <section className="shell admin-local-tabs-shell">
      <nav className="admin-local-tabs" aria-label="SEO report workspace navigation">
        <Link href="/admin/seo">Overview</Link>
        <Link href="/admin/seo/pages">Pages</Link>
        <Link href="/admin/seo/issues">Issues</Link>
        <Link href="/admin/seo/crawl">Crawl</Link>
        <Link href="/admin/seo/sitemaps">Sitemaps</Link>
        <Link href="/admin/seo/search-console">Search Console</Link>
        <Link href="/admin/seo/schema">Schema</Link>
        <Link href="/admin/seo/reports">Reports</Link>
      </nav>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Governed URLs", value: data.metrics.governedUrls, tone: "positive", hint: `${data.metrics.desiredIndexable} desired indexable` },
      { label: "Open crawl issues", value: data.metrics.openIssues, tone: data.metrics.criticalOpenIssues ? "attention" : data.metrics.openIssues ? "attention" : "positive", hint: `${data.metrics.criticalOpenIssues} critical` },
      { label: "Sitemap mismatches", value: data.metrics.sitemapExpectedMissing + data.metrics.sitemapUnexpectedActual, tone: data.metrics.sitemapExpectedMissing + data.metrics.sitemapUnexpectedActual ? "attention" : "positive", hint: `${data.metrics.sitemapExpectedMissing} expected missing · ${data.metrics.sitemapUnexpectedActual} unexpected` },
      { label: "Schema healthy", value: `${data.metrics.schemaHealthy}/${data.metrics.schemaManaged}`, tone: data.metrics.schemaInvalid || data.metrics.schemaUnexpected || data.metrics.schemaMissing ? "attention" : "positive", hint: `${data.metrics.schemaMissing} missing · ${data.metrics.schemaInvalid} invalid · ${data.metrics.schemaNotChecked} unchecked` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Release evidence" title="Cross-surface readiness checks" note="Every check links back to the evidence workspace that owns the underlying data. Unknown means evidence has not been captured or persistence is unavailable; it is not treated as a pass." />
      <div className="workspace-queue-list">
        {data.checks.map((item) => <article className="workspace-queue-card" key={item.id}>
          <div className="workspace-queue-head">
            <div><strong>{item.label}</strong><small>{item.detail}</small></div>
            <span className="status-pill">{stateLabel(item.state)}</span>
          </div>
          <div className="workspace-action-bar"><span>Evidence owner</span><Link className="text-link" href={item.href}>Open evidence →</Link></div>
        </article>)}
      </div>
      <div className="workspace-action-bar" style={{ marginTop: 18 }}>
        <span>Live report exports contain aggregate SEO evidence only; they do not contain customer data, credentials or Search Console referring URLs.</span>
        <div className="workspace-action-buttons"><a className="button button-secondary" href="/api/admin/seo/reports/current?format=json">Current JSON ↓</a><a className="button button-secondary" href="/api/admin/seo/reports/current?format=csv">Current CSV ↓</a></div>
      </div>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Freshness" title="Latest retained evidence" note="A green historical check is not enough when the evidence is stale. These timestamps show when each external/production source was last captured." />
      <div className="admin-domain-card-grid">
        <article className="admin-domain-card"><span>Production crawl</span><strong>{when(data.latestCrawlCompletedAt)}</strong><p>Newest durable HTTP/SEO crawl run.</p><b>{data.metrics.latestCrawlIssues}</b><i>Latest-run issues</i></article>
        <article className="admin-domain-card"><span>Sitemap</span><strong>{when(data.latestSitemapCapturedAt)}</strong><p>Newest immutable production sitemap capture.</p><b>{data.metrics.actualSitemap}</b><i>Observed URLs</i></article>
        <article className="admin-domain-card"><span>Search Console</span><strong>{when(data.latestGscCapturedAt)}</strong><p>Newest persisted Search Analytics sync.</p><b>{data.metrics.gscImpressions}</b><i>Impressions</i></article>
        <article className="admin-domain-card"><span>Search performance</span><strong>{data.metrics.gscClicks} clicks</strong><p>Latest retained Search Console aggregate.</p><b>{data.metrics.gscPages}</b><i>Page rows</i></article>
      </div>
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Regression watch" title="Changed since the previous saved baseline" note="Saved diagnostic baselines remain the durable trend record. The live report above supplements them with newer operational evidence rather than rewriting historical snapshots." />
      {data.regressionSignals.length === 0
        ? <div className="workspace-empty-state"><strong>{latestSaved && previousSaved ? "No material baseline regression detected." : "Two saved baselines are required."}</strong><span>{latestSaved && previousSaved ? "The legacy governed policy/content baseline is stable." : "Capture another governed diagnostic snapshot to enable baseline comparison."}</span></div>
        : <div className="workspace-queue-list">{data.regressionSignals.map((signal) => <article className="workspace-queue-card" key={signal.id}><div className="workspace-queue-head"><div><strong>{signal.title}</strong><small>{signal.detail}</small></div><span className="status-pill">{signal.severity}</span></div></article>)}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Audited baselines" title="Persisted diagnostic history" note="These bounded snapshots capture governed public inventory, policy, crawl-graph health and diagnostics. They are retained separately from the live cross-surface report so historical evidence is never silently reinterpreted." />
      {canWrite ? <AdminSeoReportRunner csrfToken={principal.csrfToken} persistenceAvailable={data.reports.persistenceAvailable} /> : <div className="workspace-empty-state"><strong>Read-only report access.</strong><span>content.write permission is required to create an audited baseline.</span></div>}
      <div className="workspace-queue-list" style={{ marginTop: 20 }}>
        {data.reports.reports.length === 0
          ? <div className="workspace-empty-state"><strong>No saved diagnostic baselines yet.</strong><span>Capture the first baseline after reviewing the live evidence above.</span></div>
          : data.reports.reports.slice(0, 20).map((report) => <article className="workspace-queue-card" key={report.id}>
              <div className="workspace-queue-head"><div><strong>{report.reason}</strong><small>{when(report.createdAt)} · {report.metrics.sitemapEstimatedCount} estimated sitemap URLs</small></div><span className="status-pill">Health {report.score}/100</span></div>
              <div className="workspace-queue-primary"><span>{report.severityCounts.critical} critical · {report.severityCounts.warning} warnings · {report.severityCounts.info} informational</span></div>
              <div className="workspace-action-bar"><span><code>{report.id}</code></span><div className="workspace-action-buttons"><a className="text-link" href={`/api/admin/seo/reports/${report.id}?format=json`}>JSON ↓</a><a className="text-link" href={`/api/admin/seo/reports/${report.id}?format=csv`}>CSV ↓</a></div></div>
            </article>)}
      </div>
    </div></section>
  </main>;
}
