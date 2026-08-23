import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminSearchConsoleSitemap } from "../../../../components/AdminSearchConsoleSitemap";
import { AdminSearchConsoleSync } from "../../../../components/AdminSearchConsoleSync";
import { AdminSearchConsoleUrlInspector } from "../../../../components/AdminSearchConsoleUrlInspector";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { getSearchConsoleHistoryWorkspace, type SeoGscMetricRow } from "../../../../lib/seo-gsc-history";
import { getGovernedSearchConsoleSitemapWorkspace } from "../../../../lib/seo-gsc-sitemap";
import { searchConsoleReadiness } from "../../../../lib/seo-search-console";
import { getSeoGlobalSettingsSnapshot } from "../../../../lib/seo-settings";

export const metadata: Metadata = {
  title: "Google Search Console · Admin",
  robots: { index: false, follow: false, nocache: true }
};

function metric(value: number) {
  return new Intl.NumberFormat("el-GR", { maximumFractionDigits: 0 }).format(value);
}

function when(value?: string) {
  if (!value) return "Not reported";
  return new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));
}

function performanceRows(rows: readonly SeoGscMetricRow[], empty: string, pageLinks = false) {
  if (!rows.length) return <div className="workspace-empty-state"><strong>{empty}</strong><span>Run a Search Console sync after the integration is ready.</span></div>;
  return <div className="workspace-queue-list">{rows.slice(0, 25).map((row) => <article className="workspace-queue-card" key={row.key}>
    <div className="workspace-queue-head"><div><strong>{row.key}</strong><small>{metric(row.impressions)} impressions · {metric(row.clicks)} clicks</small></div><span className="status-pill">{row.position ? `Position ${row.position.toFixed(1)}` : "No position"}</span></div>
    <div className="workspace-queue-primary"><span>CTR {(row.ctr * 100).toFixed(1)}% · {metric(row.impressions)} impressions · {metric(row.clicks)} clicks</span></div>
    {pageLinks && <div className="workspace-action-bar"><span>Governed route performance</span><div className="workspace-action-buttons"><Link className="text-link" href={row.key} target="_blank">Open public page ↗</Link></div></div>}
  </article>)}</div>;
}

export default async function AdminSeoSearchConsolePage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  const [seo, history, sitemapWorkspace] = await Promise.all([
    getSeoGlobalSettingsSnapshot(),
    getSearchConsoleHistoryWorkspace(principal),
    getGovernedSearchConsoleSitemapWorkspace(principal)
  ]);
  const readiness = searchConsoleReadiness();
  const ready = readiness.ready;
  const canWrite = hasAdminPermission(principal, "content.write");
  const latest = history.latest;
  const previous = history.previous;
  const sitemap = sitemapWorkspace.status;
  const clickDelta = latest && previous ? latest.clicks - previous.clicks : undefined;
  const impressionDelta = latest && previous ? latest.impressions - previous.impressions : undefined;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Content · SEO & Visibility · Google</div>
        <h1>Google Search Console operations</h1>
        <p className="lead">The Search Console integration keeps each Search Analytics snapshot deliberately synchronized and retained as immutable aggregate evidence. URL Inspection stays operator-triggered and quota-aware. The production sitemap can now be checked directly against Google and submitted or resubmitted through a separately scoped, audited write action. Credentials and OAuth tokens remain server-only.</p>
      </div>
      <aside className={ready && history.persistenceAvailable ? "dashboard-health-card" : "dashboard-health-card needs-attention"}>
        <span>Integration</span>
        <strong>{ready ? history.persistenceAvailable ? "Ready" : "DB unavailable" : readiness.enabled ? "Incomplete" : "Disabled"}</strong>
        <p>{readiness.siteUrl ?? "No Search Console property configured"}</p>
      </aside>
    </section>

    <section className="shell admin-local-tabs-shell">
      <nav className="admin-local-tabs" aria-label="Search Console sections">
        <a href="#gsc-performance">Performance</a>
        <a href="#gsc-queries">Queries</a>
        <a href="#gsc-pages">Pages</a>
        <a href="#gsc-history">History</a>
        <a href="#gsc-sitemap">Sitemap</a>
        <a href="#gsc-inspection">URL Inspection</a>
        <a href="#gsc-readiness">Connection</a>
        <Link href="/admin/seo/pages">SEO Pages</Link>
        <Link href="/admin/seo/crawl">Crawl</Link>
        <Link href="/admin/seo">SEO overview</Link>
      </nav>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "API enabled", value: readiness.enabled ? "Yes" : "No", tone: readiness.enabled ? "positive" : "attention" },
      { label: "Credentials", value: readiness.credentialsConfigured ? "Configured" : "Missing", tone: readiness.credentialsConfigured ? "positive" : "attention" },
      { label: "Google sitemap", value: sitemap?.submitted ? sitemap.isPending ? "Pending" : "Submitted" : sitemapWorkspace.error ? "Unavailable" : "Not submitted", tone: sitemap?.submitted && !sitemap.errors ? "positive" : "attention" },
      { label: "Saved syncs", value: history.runs.length, tone: history.runs.length ? "positive" : "attention" },
      { label: "Latest window", value: latest ? `${latest.startDate} → ${latest.endDate}` : "No baseline", tone: latest ? "positive" : "attention" }
    ]} />

    <section id="gsc-performance" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Google organic performance" title="Persisted Search Analytics" note="Sync final Google data explicitly. Each successful run is immutable, so release reviews can compare what Google was actually reporting at different points in time." />
      <AdminSearchConsoleSync csrfToken={principal.csrfToken} enabled={ready && canWrite && history.persistenceAvailable} />
      {!canWrite && <p style={{ marginTop: 12 }}>Read-only Admin access can view historical evidence; <code>content.write</code> permission is required to spend Search Console API quota.</p>}
      {latest ? <div className="admin-domain-card-grid" style={{ marginTop: 20 }}>
        <article className="admin-domain-card"><span>Latest</span><strong>Clicks</strong><p>{clickDelta === undefined ? "First retained baseline." : `${clickDelta >= 0 ? "+" : ""}${metric(clickDelta)} versus previous saved sync.`}</p><b>{metric(latest.clicks)}</b><i>Organic</i></article>
        <article className="admin-domain-card"><span>Latest</span><strong>Impressions</strong><p>{impressionDelta === undefined ? "First retained baseline." : `${impressionDelta >= 0 ? "+" : ""}${metric(impressionDelta)} versus previous saved sync.`}</p><b>{metric(latest.impressions)}</b><i>Visibility</i></article>
        <article className="admin-domain-card"><span>Latest</span><strong>CTR</strong><p>Aggregate click-through rate in the retained Google window.</p><b>{(latest.ctr * 100).toFixed(1)}%</b><i>Engagement</i></article>
        <article className="admin-domain-card"><span>Latest</span><strong>Avg. position</strong><p>Average result position reported by Search Console.</p><b>{latest.position ? latest.position.toFixed(1) : "—"}</b><i>Ranking</i></article>
      </div> : <div className="workspace-empty-state" style={{ marginTop: 20 }}><strong>No persisted Search Console baseline yet.</strong><span>Run the first sync after the connection is ready.</span></div>}
    </section>

    <section id="gsc-queries" className="vendor-section section-tint admin-anchor-section"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Search demand" title="Privacy-minimized Google queries" note="Only aggregate query rows with at least five impressions are persisted. Common personal identifiers are redacted using the marketplace analytics sanitizer before storage; collisions are re-aggregated after sanitization." />
      {performanceRows(history.queries, "No privacy-safe query rows retained.")}
    </div></section>

    <section id="gsc-pages" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Landing pages" title="Google page performance" note="Google page URLs are collapsed to canonical-origin routes before persistence, allowing the same route to be joined with the SEO registry, sitemap, crawl and issue evidence." />
      {performanceRows(history.pages, "No page rows retained.", true)}
    </section>

    <section id="gsc-history" className="vendor-section section-tint admin-anchor-section"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Immutable history" title="Search Console sync timeline" note="The latest 20 sync runs are retained in this operator view. Performance rows remain tied to their immutable run rather than being overwritten in place." />
      {history.runs.length === 0 ? <div className="workspace-empty-state"><strong>No Search Console history yet.</strong><span>Successful explicit syncs will appear here.</span></div> : <div className="workspace-queue-list">{history.runs.map((run) => <article className="workspace-queue-card" key={run.id}>
        <div className="workspace-queue-head"><div><strong>{run.startDate} → {run.endDate}</strong><small>{when(run.capturedAt)} · actor {run.actorId ?? "system"}</small></div><span className="status-pill">{metric(run.impressions)} impressions</span></div>
        <div className="workspace-queue-primary"><span>{metric(run.clicks)} clicks · CTR {(run.ctr * 100).toFixed(1)}% · avg. position {run.position ? run.position.toFixed(1) : "—"} · {run.pageRowCount} pages · {run.queryRowCount} privacy-safe queries</span></div>
        <div className="workspace-action-bar"><span><code>{run.id}</code></span><div /></div>
      </article>)}</div>}
    </div></section>

    <section id="gsc-sitemap" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Google sitemap operations" title="Production sitemap submission" note="This surface reads Google's current sitemap resource using the readonly scope. Submission is a separate explicit action using the Search Console write scope. The sitemap URL is derived from the governed canonical origin and cannot be replaced by operator input." />
      <AdminSearchConsoleSitemap csrfToken={principal.csrfToken} enabled={ready && canWrite} submitted={Boolean(sitemap?.submitted)} />
      <div className="admin-domain-card-grid" style={{ marginTop: 20 }}>
        <article className="admin-domain-card"><span>Governed feed</span><strong>Production sitemap</strong><p>{sitemapWorkspace.sitemapUrl}</p><b>{sitemap?.submitted ? "Submitted" : "Not submitted"}</b><i>Google state</i></article>
        <article className="admin-domain-card"><span>Google</span><strong>Last submitted</strong><p>{sitemap?.submitted ? "Timestamp reported by Search Console." : "Submit the governed sitemap to establish Google-side evidence."}</p><b>{when(sitemap?.lastSubmitted)}</b><i>Submission</i></article>
        <article className="admin-domain-card"><span>Google</span><strong>Last downloaded</strong><p>{sitemap?.isPending ? "Google reports this sitemap as pending." : "Latest time Google reports downloading the sitemap."}</p><b>{when(sitemap?.lastDownloaded)}</b><i>{sitemap?.isPending ? "Pending" : sitemap?.type ?? "Sitemap"}</i></article>
        <article className="admin-domain-card"><span>Google</span><strong>Processing issues</strong><p>Warnings are generally non-critical; errors require investigation before treating the feed as healthy.</p><b>{sitemap ? `${sitemap.errors} errors` : "No status"}</b><i>{sitemap ? `${sitemap.warnings} warnings` : "—"}</i></article>
      </div>
      {sitemapWorkspace.error && <div className="workspace-empty-state" style={{ marginTop: 18 }}><strong>Google sitemap status is unavailable.</strong><span>{sitemapWorkspace.error}</span></div>}
      {!ready && <p style={{ marginTop: 12 }}>Complete the Search Console connection before reading or submitting Google sitemap state.</p>}
      {!canWrite && <p style={{ marginTop: 12 }}>Read-only Admin access can inspect Google sitemap state; <code>content.write</code> permission is required to submit or resubmit it.</p>}
      <p style={{ marginTop: 12 }}>Submitting a sitemap is a discovery hint to Google, not a guarantee that every URL will be crawled or indexed.</p>
    </section>

    <section id="gsc-inspection" className="vendor-section section-tint admin-anchor-section"><div className="shell">
      <WorkspaceSectionHeading eyebrow="URL Inspection" title="Inspect one public URL with Google" note="Operator-triggered and quota-aware. The live response can show referring URLs, but persistent evidence deliberately stores only index/canonical/sitemap state and never stores referring URLs." />
      <AdminSearchConsoleUrlInspector csrfToken={principal.csrfToken} defaultUrl={seo.settings.canonicalOrigin} enabled={ready && canWrite} />
      {!canWrite && <p style={{ marginTop: 12 }}>Read-only Admin access can view retained inspection evidence on SEO Page details, but <code>content.write</code> permission is required to spend URL Inspection quota.</p>}
    </div></section>

    <section id="gsc-readiness" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Readiness" title="Connection checklist" note="The adapter never prints or returns the private key. A service account must separately be granted access to the Search Console property in Google." />
      <div className="workspace-queue-list">
        <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Search Console API switch</strong><small>Set BLS_GOOGLE_SEARCH_CONSOLE_ENABLED=true only after property access and credentials are ready.</small></div><span className="status-pill">{readiness.enabled ? "Enabled" : "Disabled"}</span></div></article>
        <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Property</strong><small>Use the exact Search Console property form: URL-prefix or sc-domain: domain property.</small></div><span className="status-pill">{readiness.siteUrl ? "Configured" : "Missing"}</span></div>{readiness.siteUrl ? <div className="workspace-queue-primary"><span>{readiness.siteUrl}</span></div> : null}</article>
        <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Service account</strong><small>Client email and RSA private key are read only from server environment variables. Grant that service-account email access inside Search Console.</small></div><span className="status-pill">{readiness.credentialsConfigured ? "Configured" : "Missing"}</span></div></article>
        <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Least-privilege OAuth</strong><small>Analytics, URL Inspection and sitemap status use webmasters.readonly. Only explicit sitemap submission requests the broader webmasters scope.</small></div><span className="status-pill">Scoped per operation</span></div></article>
        <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Evidence storage</strong><small>Search Analytics and URL Inspection history require PostgreSQL. Google access tokens and credentials are never stored in these tables.</small></div><span className="status-pill">{history.persistenceAvailable ? "Available" : "Unavailable"}</span></div></article>
        <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Google verification metadata</strong><small>The public verification tag is separately managed in SEO & Visibility settings; it is not an API credential.</small></div><span className="status-pill">{seo.settings.googleSiteVerification ? "Configured" : "Optional"}</span></div></article>
      </div>
    </section>
  </main>;
}
