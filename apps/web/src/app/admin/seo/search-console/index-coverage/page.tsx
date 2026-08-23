import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminSearchConsoleCoverageSample } from "../../../../../components/AdminSearchConsoleCoverageSample";
import { AdminWorkspaceHeader } from "../../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../lib/admin-session";
import { getSeoGscIndexCoverageWorkspace, type SeoGscCoverageRow } from "../../../../../lib/seo-gsc-index-coverage";
import { searchConsoleReadiness } from "../../../../../lib/seo-search-console";

export const metadata: Metadata = {
  title: "Google Index Coverage · Admin",
  robots: { index: false, follow: false, nocache: true }
};

export const dynamic = "force-dynamic";

function when(value?: string) {
  if (!value) return "Never inspected";
  return new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));
}

function stateLabel(row: SeoGscCoverageRow) {
  if (row.state === "missing") return "No evidence";
  if (row.state === "healthy") return "Healthy";
  if (row.canonicalMismatch) return "Canonical mismatch";
  if (row.stale) return "Stale";
  return "Attention";
}

export default async function AdminSeoGscIndexCoveragePage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const [coverage, readiness] = await Promise.all([
    getSeoGscIndexCoverageWorkspace(principal),
    Promise.resolve(searchConsoleReadiness())
  ]);
  const canWrite = hasAdminPermission(principal, "content.write");
  const enabled = readiness.ready && coverage.persistenceAvailable && canWrite;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Content · SEO & Visibility · Google</div>
        <h1>Governed Google index coverage</h1>
        <p className="lead">A retained coverage view across KONTA MOY URLs that are explicitly governed as indexable. Sampling is manual, bounded to 10 URLs per run, and prioritizes never-inspected or stale evidence instead of spending Google URL Inspection quota on every page render.</p>
      </div>
      <aside className={coverage.metrics.missing || coverage.metrics.attention ? "dashboard-health-card needs-attention" : "dashboard-health-card"}>
        <span>Coverage evidence</span>
        <strong>{coverage.metrics.healthy}/{coverage.metrics.governedIndexable} healthy</strong>
        <p>{coverage.metrics.missing} missing · {coverage.metrics.stale} stale</p>
      </aside>
    </section>

    <section className="shell admin-local-tabs-shell">
      <nav className="admin-local-tabs" aria-label="Google index coverage navigation">
        <Link href="/admin/seo/search-console">Search Console</Link>
        <Link href="/admin/seo/search-console/index-coverage">Index Coverage</Link>
        <Link href="/admin/seo/pages">SEO Pages</Link>
        <Link href="/admin/seo/issues">Issues</Link>
        <Link href="/admin/seo/reports">Reports</Link>
      </nav>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Governed indexable", value: coverage.metrics.governedIndexable, tone: "positive" },
      { label: "Inspected", value: coverage.metrics.inspected, tone: coverage.metrics.inspected ? "positive" : "attention" },
      { label: "Healthy", value: coverage.metrics.healthy, tone: coverage.metrics.healthy ? "positive" : "attention" },
      { label: "Attention", value: coverage.metrics.attention, tone: coverage.metrics.attention ? "attention" : "positive" },
      { label: "No evidence", value: coverage.metrics.missing, tone: coverage.metrics.missing ? "attention" : "positive" },
      { label: "Canonical mismatch", value: coverage.metrics.canonicalMismatch, tone: coverage.metrics.canonicalMismatch ? "attention" : "positive" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Bounded sampling" title="Refresh the highest-priority inspection evidence" note={`Each run inspects at most 10 governed canonical URLs sequentially. Evidence older than ${coverage.maxAgeHours / 24} days is considered stale. Never-inspected routes come first, then stale and attention routes.`} />
      <AdminSearchConsoleCoverageSample csrfToken={principal.csrfToken} enabled={enabled} />
      {!readiness.ready && <p style={{ marginTop: 12 }}>Complete the Search Console integration before running coverage sampling.</p>}
      {!coverage.persistenceAvailable && <p style={{ marginTop: 12 }}>PostgreSQL URL registry and URL Inspection evidence storage must be available.</p>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Retained Google evidence" title="Indexable URL coverage queue" note="This is not a claim that Google must index every URL. It shows the latest retained URL Inspection evidence, whether that evidence is current, and whether Google's selected canonical agrees with the governed canonical URL." />
      {coverage.rows.length === 0 ? <div className="workspace-empty-state"><strong>No governed indexable URLs are available.</strong><span>Refresh the SEO URL registry after public catalogue/vendor projections are ready.</span></div> : <div className="workspace-queue-list">
        {coverage.rows.slice(0, 250).map((row) => <article className="workspace-queue-card" key={row.id}>
          <div className="workspace-queue-head">
            <div><strong>{row.label}</strong><small>{row.route} · {row.kind}</small></div>
            <span className="status-pill">{stateLabel(row)}</span>
          </div>
          <div className="workspace-queue-primary">
            <span>{row.verdict ? `Google verdict ${row.verdict}` : "No retained Google verdict"}{row.coverageState ? ` · ${row.coverageState}` : ""}{row.indexingState ? ` · ${row.indexingState}` : ""}</span>
            <small>Evidence {when(row.capturedAt)}{row.lastCrawlTime ? ` · Google last crawl ${when(row.lastCrawlTime)}` : ""}</small>
          </div>
          {row.canonicalMismatch && <div className="workspace-queue-primary"><span>Governed canonical: {row.canonicalUrl}</span><small>Google canonical: {row.googleCanonical}</small></div>}
          <div className="workspace-action-bar">
            <span>{row.pageFetchState ?? "Page fetch state not retained"}</span>
            <div className="workspace-action-buttons"><Link className="text-link" href={`/admin/seo/pages/${row.id}`}>Open SEO record →</Link><Link className="text-link" href={row.route} target="_blank">Public page ↗</Link></div>
          </div>
        </article>)}
      </div>}
    </div></section>
  </main>;
}
