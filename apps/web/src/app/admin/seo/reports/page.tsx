import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminSeoEvidenceRefresh } from "../../../../components/AdminSeoEvidenceRefresh";
import { AdminSeoReportRunner } from "../../../../components/AdminSeoReportRunner";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { seoDiagnosticRegressionSignals } from "../../../../lib/seo-diagnostic-monitoring";
import type { SeoDiagnosticReport } from "../../../../lib/seo-diagnostic-reports";
import { seoReportComparison, seoReportRecurringFindings, seoReportTrendSeries } from "../../../../lib/seo-report-trends";
import { getSeoUnifiedReportWorkspace, type SeoEvidenceFreshness } from "../../../../lib/seo-unified-report";

export const metadata: Metadata = {
  title: "SEO Reports · Admin",
  robots: { index: false, follow: false, nocache: true }
};

export const dynamic = "force-dynamic";

type Props = Readonly<{
  searchParams: Promise<{ current?: string; baseline?: string }>;
}>;

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

function freshnessLabel(value: SeoEvidenceFreshness) {
  if (!value.capturedAt || value.ageHours === undefined) return `Missing · target ≤${value.maxAgeHours}h`;
  const age = value.ageHours < 1 ? "<1h" : `${Math.round(value.ageHours)}h`;
  return `${value.stale ? "Stale" : "Fresh"} · ${age} · target ≤${value.maxAgeHours}h`;
}

function selectedReport(reports: readonly SeoDiagnosticReport[], id: string | undefined, fallbackIndex: number): SeoDiagnosticReport | undefined {
  return (id ? reports.find((report) => report.id === id) : undefined) ?? reports[fallbackIndex];
}

function deltaLabel(value: number): string {
  return value === 0 ? "0" : `${value > 0 ? "+" : ""}${value}`;
}

function deltaTone(delta: number, lowerIsBetter = false): "positive" | "attention" | undefined {
  if (delta === 0) return undefined;
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return improved ? "positive" : "attention";
}

function severityLabel(value: string): string {
  if (value === "critical") return "Critical";
  if (value === "warning") return "Warning";
  if (value === "good") return "Good";
  return "Info";
}

export default async function AdminSeoReportsPage({ searchParams }: Props) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const params = await searchParams;
  const data = await getSeoUnifiedReportWorkspace(principal);
  const canWrite = hasAdminPermission(principal, "content.write");
  const savedReports = data.reports.reports;
  const latestSaved = savedReports[0];
  const previousSaved = savedReports[1];
  const currentSaved = selectedReport(savedReports, params.current, 0);
  const baselineSaved = selectedReport(savedReports, params.baseline, 1);
  const selectedComparison = currentSaved && baselineSaved && currentSaved.id !== baselineSaved.id ? seoReportComparison(currentSaved, baselineSaved) : [];
  const selectedRegressionSignals = currentSaved && baselineSaved && currentSaved.id !== baselineSaved.id ? seoDiagnosticRegressionSignals(currentSaved, baselineSaved) : [];
  const trend = seoReportTrendSeries(savedReports, 12);
  const recurring = seoReportRecurringFindings(savedReports, 12);
  const currentJsonExport = `/api/admin/seo/reports/current?${new URLSearchParams({ format: "json" }).toString()}`;
  const currentCsvExport = `/api/admin/seo/reports/current?${new URLSearchParams({ format: "csv" }).toString()}`;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Content · SEO & Visibility · Reports</div>
        <h1>Unified SEO release report</h1>
        <p className="lead">One operational view of governed URLs, production crawl findings, sitemap evidence, Google Search Console performance and index coverage, structured data and persisted regression baselines. Evidence freshness is part of the release signal: an old green check becomes attention instead of remaining green forever.</p>
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
        <Link href="/admin/seo/search-console/index-coverage">Google Coverage</Link>
        <Link href="/admin/seo/schema">Schema</Link>
        <Link href="/admin/seo/reports">Reports</Link>
      </nav>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Governed URLs", value: data.metrics.governedUrls, tone: "positive", hint: `${data.metrics.desiredIndexable} desired indexable` },
      { label: "Open crawl issues", value: data.metrics.openIssues, tone: data.metrics.criticalOpenIssues ? "attention" : data.metrics.openIssues ? "attention" : "positive", hint: `${data.metrics.criticalOpenIssues} critical` },
      { label: "Sitemap mismatches", value: data.metrics.sitemapExpectedMissing + data.metrics.sitemapUnexpectedActual, tone: data.metrics.sitemapExpectedMissing + data.metrics.sitemapUnexpectedActual ? "attention" : "positive", hint: `${data.metrics.sitemapExpectedMissing} expected missing · ${data.metrics.sitemapUnexpectedActual} unexpected` },
      { label: "Google coverage", value: `${data.metrics.gscCoverageHealthy}/${data.metrics.gscCoverageGoverned}`, tone: data.metrics.gscCoverageHardFailures || data.metrics.gscCoverageMissing || data.metrics.gscCoverageStale || data.metrics.gscCoverageAttention ? "attention" : "positive", hint: `${data.metrics.gscCoverageMissing} missing · ${data.metrics.gscCoverageStale} stale · ${data.metrics.gscCoverageHardFailures} hard-failure URLs` },
      { label: "Schema healthy", value: `${data.metrics.schemaHealthy}/${data.metrics.schemaManaged}`, tone: data.metrics.schemaInvalid || data.metrics.schemaUnexpected || data.metrics.schemaMissing ? "attention" : "positive", hint: `${data.metrics.schemaMissing} missing · ${data.metrics.schemaInvalid} invalid · ${data.metrics.schemaNotChecked} unchecked` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Release evidence refresh" title="Rebuild the operational evidence pack" note="One operator action refreshes the existing governed evidence sources in sequence. URL registry sync runs first, then a bounded production crawl with structured-data evidence, sitemap capture, Search Console performance sync and a final bounded Google index-coverage sample. A failure in one source is shown explicitly and does not erase successful evidence from the others." />
      <AdminSeoEvidenceRefresh csrfToken={principal.csrfToken} enabled={canWrite} />
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Release evidence" title="Cross-surface readiness checks" note="Every check links back to the evidence workspace that owns the underlying data. Unknown means evidence has not been captured or persistence is unavailable; stale evidence is attention, never a pass. Explicit Google canonical/indexing/fetch failures can block the release signal." />
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
        <div className="workspace-action-buttons"><a className="button button-secondary" href={currentJsonExport}>Current JSON ↓</a><a className="button button-secondary" href={currentCsvExport}>Current CSV ↓</a></div>
      </div>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Freshness" title="Latest retained evidence" note="Operational thresholds are explicit: production crawl and sitemap evidence target ≤24 hours; Search Console performance sync targets ≤72 hours to accommodate Google's reporting delay. Google URL Inspection coverage uses its own per-URL seven-day freshness threshold. Missing or older evidence moves the release signal to attention." />
      <div className="admin-domain-card-grid">
        <article className="admin-domain-card"><span>Production crawl</span><strong>{when(data.latestCrawlCompletedAt)}</strong><p>{freshnessLabel(data.freshness.crawl)}</p><b>{data.metrics.latestCrawlIssues}</b><i>Latest-run issues</i></article>
        <article className="admin-domain-card"><span>Sitemap</span><strong>{when(data.latestSitemapCapturedAt)}</strong><p>{freshnessLabel(data.freshness.sitemap)}</p><b>{data.metrics.actualSitemap}</b><i>Observed URLs</i></article>
        <article className="admin-domain-card"><span>Search Console</span><strong>{when(data.latestGscCapturedAt)}</strong><p>{freshnessLabel(data.freshness.searchConsole)}</p><b>{data.metrics.gscImpressions}</b><i>Impressions</i></article>
        <article className="admin-domain-card"><span>Google index coverage</span><strong>{data.metrics.gscCoverageHealthy}/{data.metrics.gscCoverageGoverned} healthy</strong><p>{data.metrics.gscCoverageMissing} missing · {data.metrics.gscCoverageStale} stale · {data.metrics.gscCoverageAttention} attention.</p><b>{data.metrics.gscCoverageHardFailures}</b><i>Hard-failure URLs</i></article>
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
      <WorkspaceSectionHeading eyebrow="Longitudinal view" title="Last 12 visibility checkpoints" note="Health score remains an internal readiness signal, not a Google ranking score. Inventory and crawl metrics are displayed beside it so change stays explainable." />
      {trend.length === 0
        ? <div className="workspace-empty-state"><strong>No report history yet.</strong><span>Capture a first governed baseline, then repeat after meaningful SEO changes or releases.</span></div>
        : <div className="workspace-queue-list">{trend.map((point) => <article className="workspace-queue-card" key={point.id}>
          <div className="workspace-queue-head"><div><strong>{when(point.createdAt)}</strong><small>{point.reason}</small></div><span className="status-pill">Health {point.score}/100</span></div>
          <div className="workspace-queue-primary"><span>{point.critical} critical · {point.warning} warnings · {point.sitemapEstimatedCount} estimated sitemap URLs</span></div>
          <div className="workspace-compact-list" style={{ marginTop: 10 }}>
            <div className="workspace-compact-row"><strong>Eligible products</strong><span>{point.productIndexEligible}</span></div>
            <div className="workspace-compact-row"><strong>Eligible vendors</strong><span>{point.vendorIndexEligible}</span></div>
            <div className="workspace-compact-row"><strong>Internal linking</strong><span>{point.crawlOrphans} orphans · {point.crawlWeak} weak</span></div>
          </div>
        </article>)}</div>}
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Baseline comparison" title="Compare any two retained snapshots" note="Choose a current checkpoint and an older baseline. The existing governed regression engine is applied to that pair, alongside explainable metric deltas." />
      {savedReports.length < 2
        ? <div className="workspace-empty-state"><strong>Two reports are required for comparison.</strong><span>Capture another audited baseline after the next meaningful change.</span></div>
        : <>
          <form method="get" className="workspace-form-stack" style={{ marginBottom: 20 }}>
            <div className="workspace-form-grid">
              <label className="workspace-field"><span>Current checkpoint</span><select name="current" defaultValue={currentSaved?.id}>{savedReports.map((report) => <option key={report.id} value={report.id}>{when(report.createdAt)} · {report.score}/100 · {report.reason.slice(0, 70)}</option>)}</select></label>
              <label className="workspace-field"><span>Baseline checkpoint</span><select name="baseline" defaultValue={baselineSaved?.id}>{savedReports.map((report) => <option key={report.id} value={report.id}>{when(report.createdAt)} · {report.score}/100 · {report.reason.slice(0, 70)}</option>)}</select></label>
            </div>
            <div className="workspace-action-bar"><span>Comparison is read-only and never mutates retained evidence.</span><button className="button" type="submit">Compare snapshots</button></div>
          </form>
          {currentSaved?.id === baselineSaved?.id
            ? <div className="workspace-empty-state"><strong>Select two different checkpoints.</strong><span>A report cannot be compared with itself.</span></div>
            : <>
              <div className="admin-domain-card-grid">{selectedComparison.map((metric) => <article className="admin-domain-card" key={metric.key}><span>{metric.label}</span><strong>{metric.current}</strong><p>Baseline {metric.previous}</p><b>{deltaLabel(metric.delta)}</b><i>{deltaTone(metric.delta, metric.lowerIsBetter) === "positive" ? "Improvement" : deltaTone(metric.delta, metric.lowerIsBetter) === "attention" ? "Regression" : "No change"}</i></article>)}</div>
              <h3 style={{ marginTop: 28 }}>Regression signals for selected pair</h3>
              <div className="workspace-queue-list" style={{ marginTop: 12 }}>
                {selectedRegressionSignals.length === 0
                  ? <div className="workspace-empty-state"><strong>No material regression detected.</strong><span>The selected pair remains within the existing governed thresholds.</span></div>
                  : selectedRegressionSignals.map((signal) => <article className="workspace-queue-card" key={signal.id}><div className="workspace-queue-head"><div><strong>{signal.title}</strong><small>{signal.detail}</small></div><span className="status-pill">{severityLabel(signal.severity)}</span></div><div className="workspace-queue-primary"><span>Baseline {signal.previous} · current {signal.current} · delta {deltaLabel(signal.delta)}</span></div></article>)}
              </div>
            </>}
        </>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Persistent patterns" title="Recurring diagnostics across the last 12 reports" note="Repeated non-good findings are grouped by stable diagnostic ID. Current findings sort first, followed by severity and recurrence, separating chronic problems from one-off release noise." />
      {recurring.length === 0
        ? <div className="workspace-empty-state"><strong>No recurring non-good diagnostics in the retained window.</strong><span>Continue capturing checkpoints after significant releases to maintain the trend baseline.</span></div>
        : <div className="workspace-queue-list">{recurring.slice(0, 30).map((finding) => <article className="workspace-queue-card" key={finding.id}><div className="workspace-queue-head"><div><strong>{finding.title}</strong><small>{finding.detail}</small></div><span className="status-pill">{finding.current ? "Current" : "Historical"} · {severityLabel(finding.severity)}</span></div><div className="workspace-queue-primary"><span>{finding.occurrences} occurrence{finding.occurrences === 1 ? "" : "s"} · first {when(finding.firstSeenAt)} · last {when(finding.lastSeenAt)}</span></div></article>)}</div>}
    </div></section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Audited baselines" title="Persisted diagnostic history" note="These bounded snapshots capture governed public inventory, policy, crawl-graph health and diagnostics. They are retained separately from the live cross-surface report so historical evidence is never silently reinterpreted." />
      {canWrite ? <AdminSeoReportRunner csrfToken={principal.csrfToken} persistenceAvailable={data.reports.persistenceAvailable} /> : <div className="workspace-empty-state"><strong>Read-only report access.</strong><span>content.write permission is required to create an audited baseline.</span></div>}
      <div className="workspace-queue-list" style={{ marginTop: 20 }}>
        {savedReports.length === 0
          ? <div className="workspace-empty-state"><strong>No saved diagnostic baselines yet.</strong><span>Capture the first baseline after reviewing the live evidence above.</span></div>
          : savedReports.slice(0, 20).map((report) => <article className="workspace-queue-card" key={report.id}>
              <div className="workspace-queue-head"><div><strong>{report.reason}</strong><small>{when(report.createdAt)} · {report.metrics.sitemapEstimatedCount} estimated sitemap URLs</small></div><span className="status-pill">Health {report.score}/100</span></div>
              <div className="workspace-queue-primary"><span>{report.severityCounts.critical} critical · {report.severityCounts.warning} warnings · {report.severityCounts.info} informational</span></div>
              <div className="workspace-action-bar"><span><code>{report.id}</code></span><div className="workspace-action-buttons"><a className="text-link" href={`/api/admin/seo/reports/${report.id}?format=json`}>JSON ↓</a><a className="text-link" href={`/api/admin/seo/reports/${report.id}?format=csv`}>CSV ↓</a></div></div>
            </article>)}
      </div>
    </div></section>
  </main>;
}
