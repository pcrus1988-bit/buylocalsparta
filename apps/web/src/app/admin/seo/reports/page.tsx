import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminSeoReportRunner } from "../../../../components/AdminSeoReportRunner";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { seoDiagnosticRegressionSignals } from "../../../../lib/seo-diagnostic-monitoring";
import { getSeoDiagnosticReportsSnapshot, type SeoDiagnosticReport } from "../../../../lib/seo-diagnostic-reports";
import { seoReportComparison, seoReportRecurringFindings, seoReportTrendSeries } from "../../../../lib/seo-report-trends";

export const metadata: Metadata = {
  title: "SEO Reports · Admin",
  robots: { index: false, follow: false, nocache: true }
};

export const dynamic = "force-dynamic";

type Props = Readonly<{
  searchParams: Promise<{ current?: string; baseline?: string }>;
}>;

function when(value: string): string {
  return new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));
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
  const data = await getSeoDiagnosticReportsSnapshot();
  const reports = data.reports;
  const current = selectedReport(reports, params.current, 0);
  const baseline = selectedReport(reports, params.baseline, 1);
  const comparison = current && baseline && current.id !== baseline.id ? seoReportComparison(current, baseline) : [];
  const regressionSignals = current && baseline && current.id !== baseline.id ? seoDiagnosticRegressionSignals(current, baseline) : [];
  const trend = seoReportTrendSeries(reports, 12);
  const recurring = seoReportRecurringFindings(reports, 12);
  const canWrite = hasAdminPermission(principal, "content.write");
  const latest = reports[0];
  const previous = reports[1];
  const latestSignals = seoDiagnosticRegressionSignals(latest, previous);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Content · SEO & Visibility · Reports</div>
        <h1>SEO reports & trend analysis</h1>
        <p className="lead">Audited visibility checkpoints become useful only when change is visible. This workspace compares snapshots, surfaces recurring diagnostics and shows whether indexable inventory, crawl health and readiness are improving or regressing over time.</p>
      </div>
      <aside className={latest?.severityCounts.critical || latestSignals.some((signal) => signal.severity === "critical") ? "dashboard-health-card needs-attention" : "dashboard-health-card"}>
        <span>Latest retained health</span>
        <strong>{latest ? `${latest.score}/100` : "No baseline"}</strong>
        <p>{reports.length} saved snapshot{reports.length === 1 ? "" : "s"} · {latestSignals.length} latest regression signal{latestSignals.length === 1 ? "" : "s"}</p>
      </aside>
    </section>

    <section className="shell admin-local-tabs-shell">
      <nav className="admin-local-tabs" aria-label="SEO reports workspace navigation">
        <Link href="/admin/seo">Overview</Link>
        <Link href="/admin/seo/pages">Pages</Link>
        <Link href="/admin/seo/issues">Issues</Link>
        <Link href="/admin/seo/schema">Structured Data</Link>
        <Link href="/admin/seo/reports">Reports</Link>
        <Link href="/admin/seo/search-console">Search Console</Link>
      </nav>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Saved snapshots", value: reports.length, tone: reports.length >= 2 ? "positive" : "attention", hint: data.persistenceAvailable ? `bounded retention · version ${data.version}` : "persistence unavailable" },
      { label: "Latest health", value: latest?.score ?? "—", tone: latest && latest.score >= 85 ? "positive" : "attention", hint: latest ? when(latest.createdAt) : "capture first baseline" },
      { label: "Latest critical", value: latest?.severityCounts.critical ?? 0, tone: latest?.severityCounts.critical ? "attention" : "positive" },
      { label: "Latest regressions", value: latestSignals.length, tone: latestSignals.some((signal) => signal.severity === "critical") ? "attention" : latestSignals.length ? undefined : "positive", hint: previous ? "latest vs previous snapshot" : "two snapshots required" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Audited checkpoint" title="Capture current governed SEO state" note="The existing report action captures public inventory aggregates, route-policy counts, runtime readiness and diagnostics only. Reports remain bounded to 50 snapshots and contain no customer/session data or credentials." />
      {canWrite
        ? <AdminSeoReportRunner csrfToken={principal.csrfToken} persistenceAvailable={data.persistenceAvailable} />
        : <div className="workspace-empty-state"><strong>Read-only report access.</strong><span>content.write permission is required to capture a new audited SEO report.</span></div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Longitudinal view" title="Last 12 visibility checkpoints" note="Health score is an internal readiness signal, not a Google ranking score. Inventory and crawl metrics are shown beside it so score changes remain explainable." />
      {trend.length === 0
        ? <div className="workspace-empty-state"><strong>No report history yet.</strong><span>Capture a first report, then repeat after meaningful SEO changes or releases.</span></div>
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
      <WorkspaceSectionHeading eyebrow="Baseline comparison" title="Compare any two retained snapshots" note="Choose a current checkpoint and an older baseline. The same regression engine used on the SEO overview is applied to the selected pair, so critical runtime/inventory losses remain consistent across surfaces." />
      {reports.length < 2
        ? <div className="workspace-empty-state"><strong>Two reports are required for comparison.</strong><span>Capture another audited snapshot after the next meaningful change.</span></div>
        : <>
          <form method="get" className="workspace-form-stack" style={{ marginBottom: 20 }}>
            <div className="workspace-form-grid">
              <label className="workspace-field"><span>Current checkpoint</span><select name="current" defaultValue={current?.id}>{reports.map((report) => <option key={report.id} value={report.id}>{when(report.createdAt)} · {report.score}/100 · {report.reason.slice(0, 70)}</option>)}</select></label>
              <label className="workspace-field"><span>Baseline checkpoint</span><select name="baseline" defaultValue={baseline?.id}>{reports.map((report) => <option key={report.id} value={report.id}>{when(report.createdAt)} · {report.score}/100 · {report.reason.slice(0, 70)}</option>)}</select></label>
            </div>
            <div className="workspace-action-bar"><span>Comparison is read-only and does not mutate either retained report.</span><button className="button" type="submit">Compare snapshots</button></div>
          </form>
          {current?.id === baseline?.id
            ? <div className="workspace-empty-state"><strong>Select two different checkpoints.</strong><span>A report cannot be compared with itself.</span></div>
            : <>
              <div className="admin-domain-card-grid">{comparison.map((metric) => <article className="admin-domain-card" key={metric.key}><span>{metric.label}</span><strong>{metric.current}</strong><p>Baseline {metric.previous}</p><b>{deltaLabel(metric.delta)}</b><i>{deltaTone(metric.delta, metric.lowerIsBetter) === "positive" ? "Improvement" : deltaTone(metric.delta, metric.lowerIsBetter) === "attention" ? "Regression" : "No change"}</i></article>)}</div>
              <h3 style={{ marginTop: 28 }}>Regression signals for selected pair</h3>
              <div className="workspace-queue-list" style={{ marginTop: 12 }}>
                {regressionSignals.length === 0
                  ? <div className="workspace-empty-state"><strong>No material regression detected.</strong><span>The selected comparison is within the existing governed thresholds.</span></div>
                  : regressionSignals.map((signal) => <article className="workspace-queue-card" key={signal.id}><div className="workspace-queue-head"><div><strong>{signal.title}</strong><small>{signal.detail}</small></div><span className="status-pill">{severityLabel(signal.severity)}</span></div><div className="workspace-queue-primary"><span>Baseline {signal.previous} · current {signal.current} · delta {deltaLabel(signal.delta)}</span></div></article>)}
              </div>
            </>}
        </>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Persistent patterns" title="Recurring diagnostics across the last 12 reports" note="Repeated findings are grouped by stable diagnostic ID. Current findings sort first, followed by severity and recurrence, making chronic problems easier to distinguish from one-off release noise." />
      {recurring.length === 0
        ? <div className="workspace-empty-state"><strong>No recurring non-good diagnostics in the retained window.</strong><span>Continue capturing checkpoints after significant releases to maintain the trend baseline.</span></div>
        : <div className="workspace-queue-list">{recurring.slice(0, 30).map((finding) => <article className="workspace-queue-card" key={finding.id}><div className="workspace-queue-head"><div><strong>{finding.title}</strong><small>{finding.detail}</small></div><span className="status-pill">{finding.current ? "Current" : "Historical"} · {severityLabel(finding.severity)}</span></div><div className="workspace-queue-primary"><span>{finding.occurrences} occurrence{finding.occurrences === 1 ? "" : "s"} · first {when(finding.firstSeenAt)} · last {when(finding.lastSeenAt)}</span></div></article>)}</div>}
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Retained evidence" title="Report history & exports" note="Exports use the existing authenticated, content.read-protected endpoint with private no-store/noindex headers. JSON preserves the complete normalized report; CSV supports operational review outside Admin." />
      {reports.length === 0
        ? <div className="workspace-empty-state"><strong>No retained reports.</strong><span>Capture the first audited SEO state above.</span></div>
        : <div className="workspace-queue-list">{reports.map((report) => <article className="workspace-queue-card" key={report.id}>
          <div className="workspace-queue-head"><div><strong>{report.reason}</strong><small>{when(report.createdAt)} · actor {report.actorId} · format v{report.formatVersion}</small></div><span className="status-pill">Health {report.score}/100</span></div>
          <div className="workspace-queue-primary"><span>{report.severityCounts.critical} critical · {report.severityCounts.warning} warnings · {report.metrics.sitemapEstimatedCount} estimated sitemap URLs</span></div>
          <div className="workspace-action-bar"><span><code>{report.id}</code></span><div className="workspace-action-buttons"><a className="text-link" href={`/api/admin/seo/reports/${report.id}?format=json`}>JSON ↓</a><a className="text-link" href={`/api/admin/seo/reports/${report.id}?format=csv`}>CSV ↓</a></div></div>
        </article>)}</div>}
    </section>
  </main>;
}
