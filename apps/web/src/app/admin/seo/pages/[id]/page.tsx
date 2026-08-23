import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminSearchConsoleUrlInspector } from "../../../../../components/AdminSearchConsoleUrlInspector";
import { AdminWorkspaceHeader } from "../../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../lib/admin-session";
import { getSeoPageDetail } from "../../../../../lib/seo-page-detail";
import { searchConsoleReadiness } from "../../../../../lib/seo-search-console";

export const metadata: Metadata = { title: "SEO Page Detail · Admin", robots: { index: false, follow: false, nocache: true } };

function when(value?: string) {
  return value ? new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value)) : "—";
}

function crawlState(status?: number, issues = 0) {
  if (!status) return "Not crawled";
  if (status < 200 || status >= 300) return `HTTP ${status}`;
  return issues ? `${issues} issue${issues === 1 ? "" : "s"}` : "Healthy";
}

export default async function AdminSeoPageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const { id } = await params;
  const detail = await getSeoPageDetail(principal, decodeURIComponent(id));
  if (!detail) redirect("/admin/seo/pages");
  const canWrite = hasAdminPermission(principal, "content.write");
  const gscReady = searchConsoleReadiness().ready;
  const latestInspection = detail.google.inspections[0];
  const openIssues = detail.issues.filter((issue) => issue.status === "open");
  const criticalIssues = openIssues.filter((issue) => issue.severity === "critical").length;
  const sitemapMismatch = detail.actualSitemap !== undefined && detail.actualSitemap !== detail.desiredSitemap;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel={detail.label} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Content · SEO & Visibility · Pages · Record</div><h1>{detail.label}</h1><p className="lead">A single evidence record for this public URL: intended policy, sitemap membership, actual HTTP crawl, issue lifecycle and what Google Search Console has observed.</p></div>
      <aside className={criticalIssues || sitemapMismatch ? "dashboard-health-card needs-attention" : "dashboard-health-card"}><span>Page SEO state</span><strong>{criticalIssues ? `${criticalIssues} critical` : sitemapMismatch ? "Sitemap mismatch" : openIssues.length ? `${openIssues.length} open issues` : "Governed"}</strong><p>{detail.route}</p></aside>
    </section>

    <section className="shell admin-local-tabs-shell"><nav className="admin-local-tabs" aria-label="SEO page detail sections"><a href="#page-policy">Policy</a><a href="#page-crawl">HTTP Crawl</a><a href="#page-issues">Issues</a><a href="#page-google">Google</a><Link href={detail.route} target="_blank">Open public page ↗</Link><Link href="/admin/seo/pages">All SEO Pages</Link><Link href="/admin/seo/search-console">Search Console</Link></nav></section>

    <WorkspaceMetricStrip items={[
      { label: "Index desired", value: detail.desiredIndexable ? "Allow" : "Deny", tone: detail.desiredIndexable ? "positive" : "default" },
      { label: "Sitemap", value: detail.actualSitemap === undefined ? "No evidence" : detail.actualSitemap ? "Present" : "Absent", tone: sitemapMismatch ? "attention" : detail.actualSitemap ? "positive" : "default", hint: `desired ${detail.desiredSitemap ? "yes" : "no"}` },
      { label: "Latest HTTP", value: crawlState(detail.latestCrawl?.status, detail.latestCrawl?.issueCount ?? 0), tone: detail.latestCrawl?.issueCount || (detail.latestCrawl?.status && (detail.latestCrawl.status < 200 || detail.latestCrawl.status >= 300)) ? "attention" : detail.latestCrawl ? "positive" : "default" },
      { label: "Google verdict", value: latestInspection?.verdict ?? "No inspection", tone: latestInspection?.verdict === "PASS" ? "positive" : latestInspection ? "attention" : "default" }
    ]} />

    <section id="page-policy" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Source of truth" title="Desired SEO policy" note="The URL registry is a derived operational index. Global settings, entity quality gates and explicit SEO overrides remain authoritative for index, sitemap and canonical decisions." />
      <div className="workspace-compact-list">
        <div className="workspace-compact-row"><strong>Registry ID</strong><span><code>{detail.id}</code></span></div>
        <div className="workspace-compact-row"><strong>Source</strong><span>{detail.kind} · <code>{detail.sourceKey}</code></span></div>
        <div className="workspace-compact-row"><strong>Route</strong><span>{detail.route}</span></div>
        <div className="workspace-compact-row"><strong>Declared canonical</strong><span>{detail.canonicalUrl}</span></div>
        <div className="workspace-compact-row"><strong>Desired indexability</strong><span>{detail.desiredIndexable ? "Index allowed" : "Noindex / held back"}</span></div>
        <div className="workspace-compact-row"><strong>Desired sitemap</strong><span>{detail.desiredSitemap ? "Include" : "Exclude"}</span></div>
        <div className="workspace-compact-row"><strong>Actual sitemap</strong><span>{detail.actualSitemap === undefined ? "No valid snapshot evidence" : detail.actualSitemap ? "Present" : "Absent"}</span></div>
        <div className="workspace-compact-row"><strong>Internal discovery</strong><span>{detail.inboundSources.length ? detail.inboundSources.join(" · ") : "No declared inbound source"}</span></div>
        <div className="workspace-compact-row"><strong>Registry lifecycle</strong><span>{detail.active ? "Active" : "Inactive"} · first {when(detail.firstSeenAt)} · last {when(detail.lastSeenAt)}</span></div>
        {detail.latestSitemap && <div className="workspace-compact-row"><strong>Sitemap evidence</strong><span>{detail.latestSitemap.valid ? "Valid" : "Invalid"} snapshot {detail.latestSitemap.id} · {when(detail.latestSitemap.capturedAt)}</span></div>}
      </div>
    </section>

    <section id="page-crawl" className="vendor-section section-tint admin-anchor-section"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Actual HTTP evidence" title="Latest persisted crawl" note="Crawler evidence is read-only verification of production behavior; it does not itself alter index policy or public content." />
      {!detail.latestCrawl ? <div className="workspace-empty-state"><strong>This route has not been captured by a persisted crawl.</strong><span>Run the bounded live crawler from the Crawl workspace.</span></div> : <div className="workspace-compact-list">
        <div className="workspace-compact-row"><strong>Run</strong><span><code>{detail.latestCrawl.runId}</code> · {when(detail.latestCrawl.capturedAt)}</span></div>
        <div className="workspace-compact-row"><strong>HTTP</strong><span>{detail.latestCrawl.status ?? "—"} · {detail.latestCrawl.responseTimeMs} ms · {detail.latestCrawl.issueCount} issues</span></div>
        <div className="workspace-compact-row"><strong>Final URL</strong><span>{detail.latestCrawl.finalUrl ?? "—"}</span></div>
        <div className="workspace-compact-row"><strong>Title</strong><span>{detail.latestCrawl.title ?? "—"}</span></div>
        <div className="workspace-compact-row"><strong>Observed canonical</strong><span>{detail.latestCrawl.canonical ?? "—"}</span></div>
        <div className="workspace-compact-row"><strong>Robots meta</strong><span>{detail.latestCrawl.robots ?? "—"}</span></div>
        <div className="workspace-compact-row"><strong>H1 count</strong><span>{detail.latestCrawl.h1Count ?? "—"}</span></div>
      </div>}
      <div className="workspace-action-bar" style={{ marginTop: 16 }}><span>Need fresh production evidence?</span><div className="workspace-action-buttons"><Link className="text-link" href="/admin/seo/crawl">Open Crawl →</Link></div></div>
    </div></section>

    <section id="page-issues" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Issue lifecycle" title="Current and historical crawl findings" note="Resolved findings remain evidence. Recurring findings reopen under the persisted issue lifecycle; ignored findings keep accumulating observations without reopening automatically." />
      {detail.issues.length === 0 ? <div className="workspace-empty-state"><strong>No persisted crawl issues for this route.</strong><span>The route may still need a fresh crawl or Google inspection.</span></div> : <div className="workspace-queue-list">{detail.issues.map((issue) => <article className="workspace-queue-card" key={issue.id}>
        <div className="workspace-queue-head"><div><strong>{issue.code}</strong><small>{issue.detail}</small></div><span className="status-pill">{issue.severity} · {issue.status}</span></div>
        <div className="workspace-queue-primary"><span>{issue.occurrenceCount} occurrence{issue.occurrenceCount === 1 ? "" : "s"} · first {when(issue.firstSeenAt)} · last {when(issue.lastSeenAt)}</span></div>
        <div className="workspace-action-bar"><span>Latest run <code>{issue.latestRunId}</code></span><div className="workspace-action-buttons"><Link className="text-link" href="/admin/seo/issues">Manage issue lifecycle →</Link></div></div>
      </article>)}</div>}
    </section>

    <section id="page-google" className="vendor-section section-tint admin-anchor-section"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Google evidence" title="Search performance & URL Inspection" note="Performance comes from the latest explicit Search Console sync. URL Inspection is manual/quota-aware. Referring URLs are visible only in the immediate live response and are not retained in persistent evidence." />
      {detail.google.latestPageMetric ? <div className="admin-domain-card-grid">
        <article className="admin-domain-card"><span>Google</span><strong>Clicks</strong><p>{detail.google.latestPageMetric.startDate} → {detail.google.latestPageMetric.endDate}</p><b>{detail.google.latestPageMetric.clicks}</b><i>Organic</i></article>
        <article className="admin-domain-card"><span>Google</span><strong>Impressions</strong><p>Latest retained page-level Search Analytics row.</p><b>{detail.google.latestPageMetric.impressions}</b><i>Visibility</i></article>
        <article className="admin-domain-card"><span>Google</span><strong>CTR</strong><p>Click-through rate for this governed route.</p><b>{(detail.google.latestPageMetric.ctr * 100).toFixed(1)}%</b><i>Engagement</i></article>
        <article className="admin-domain-card"><span>Google</span><strong>Avg. position</strong><p>Average result position for this route.</p><b>{detail.google.latestPageMetric.position ? detail.google.latestPageMetric.position.toFixed(1) : "—"}</b><i>Ranking</i></article>
      </div> : <div className="workspace-empty-state"><strong>No retained Google page metric for this route.</strong><span>Run a Search Console sync to refresh aggregate page evidence.</span></div>}

      <div style={{ marginTop: 22 }}><AdminSearchConsoleUrlInspector csrfToken={principal.csrfToken} defaultUrl={detail.canonicalUrl} enabled={gscReady && canWrite} /></div>

      <h3 style={{ marginTop: 28 }}>Retained URL Inspection history</h3>
      {detail.google.inspections.length === 0 ? <div className="workspace-empty-state" style={{ marginTop: 12 }}><strong>No retained Google inspection for this route.</strong><span>Inspect the URL above once Search Console is ready.</span></div> : <div className="workspace-queue-list" style={{ marginTop: 12 }}>{detail.google.inspections.map((inspection) => <article className="workspace-queue-card" key={inspection.id}>
        <div className="workspace-queue-head"><div><strong>{inspection.verdict ?? "Unknown verdict"}</strong><small>{when(inspection.capturedAt)} · actor {inspection.actorId ?? "system"}</small></div><span className="status-pill">{inspection.indexingState ?? inspection.coverageState ?? "Inspection"}</span></div>
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Coverage</strong><span>{inspection.coverageState ?? "—"}</span></div>
          <div className="workspace-compact-row"><strong>robots.txt</strong><span>{inspection.robotsTxtState ?? "—"}</span></div>
          <div className="workspace-compact-row"><strong>Page fetch</strong><span>{inspection.pageFetchState ?? "—"}</span></div>
          <div className="workspace-compact-row"><strong>Last Google crawl</strong><span>{when(inspection.lastCrawlTime)}</span></div>
          <div className="workspace-compact-row"><strong>User canonical</strong><span>{inspection.userCanonical ?? "—"}</span></div>
          <div className="workspace-compact-row"><strong>Google canonical</strong><span>{inspection.googleCanonical ?? "—"}</span></div>
          <div className="workspace-compact-row"><strong>Sitemaps</strong><span>{inspection.sitemaps.length ? inspection.sitemaps.join(" · ") : "—"}</span></div>
        </div>
      </article>)}</div>}
    </div></section>
  </main>;
}
