import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminSearchConsoleUrlInspector } from "../../../../components/AdminSearchConsoleUrlInspector";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { getSearchConsoleBreakdown, getSearchConsoleOverview } from "../../../../lib/seo-search-console";
import { getSeoGlobalSettingsSnapshot } from "../../../../lib/seo-settings";

export const metadata: Metadata = {
  title: "Google Search Console · Admin",
  robots: { index: false, follow: false, nocache: true }
};

function metric(value: number) {
  return new Intl.NumberFormat("el-GR", { maximumFractionDigits: 0 }).format(value);
}

function performanceRows(rows: Awaited<ReturnType<typeof getSearchConsoleBreakdown>>["queries"], empty: string) {
  if (!rows.length) return <div className="workspace-empty-state"><strong>{empty}</strong><span>Search Console may not have final data for this window yet.</span></div>;
  return <div className="workspace-queue-list">{rows.map((row) => <article className="workspace-queue-card" key={row.key}>
    <div className="workspace-queue-head"><div><strong>{row.key}</strong><small>{metric(row.impressions)} impressions · {metric(row.clicks)} clicks</small></div><span className="status-pill">{row.position ? `Position ${row.position.toFixed(1)}` : "No position"}</span></div>
    <div className="workspace-queue-primary"><span>CTR {(row.ctr * 100).toFixed(1)}% · {metric(row.impressions)} impressions · {metric(row.clicks)} clicks</span></div>
  </article>)}</div>;
}

export default async function AdminSeoSearchConsolePage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  const [overview, seo, breakdown] = await Promise.all([
    getSearchConsoleOverview(),
    getSeoGlobalSettingsSnapshot(),
    getSearchConsoleBreakdown(25)
  ]);
  const ready = overview.readiness.ready;
  const performance = overview.performance;
  const canInspect = hasAdminPermission(principal, "content.write");

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Content · SEO & Visibility · Google</div>
        <h1>Google Search Console operations</h1>
        <p className="lead">Search Console integration is now an operational workspace for organic performance and operator-triggered URL Inspection. Credentials remain server-only in environment variables and are never stored in the browser or SEO settings.</p>
      </div>
      <aside className={ready && !overview.error ? "dashboard-health-card" : "dashboard-health-card needs-attention"}>
        <span>Integration</span>
        <strong>{ready ? overview.error ? "API error" : "Ready" : overview.readiness.enabled ? "Incomplete" : "Disabled"}</strong>
        <p>{overview.readiness.siteUrl ?? "No Search Console property configured"}</p>
      </aside>
    </section>

    <section className="shell admin-local-tabs-shell">
      <nav className="admin-local-tabs" aria-label="Search Console sections">
        <a href="#gsc-performance">Performance</a>
        <a href="#gsc-queries">Queries</a>
        <a href="#gsc-pages">Pages</a>
        <a href="#gsc-inspection">URL Inspection</a>
        <a href="#gsc-readiness">Connection</a>
        <Link href="/admin/seo/crawl">Declared site graph</Link>
        <Link href="/admin/seo">SEO overview</Link>
      </nav>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "API enabled", value: overview.readiness.enabled ? "Yes" : "No", tone: overview.readiness.enabled ? "positive" : "attention" },
      { label: "Credentials", value: overview.readiness.credentialsConfigured ? "Configured" : "Missing", tone: overview.readiness.credentialsConfigured ? "positive" : "attention" },
      { label: "Site verification meta", value: seo.settings.googleSiteVerification ? "Configured" : "Not set", tone: seo.settings.googleSiteVerification ? "positive" : "default" },
      { label: "Indexing master", value: seo.settings.indexingEnabled ? "On" : "Off", tone: seo.settings.indexingEnabled ? "positive" : "attention" }
    ]} />

    {performance ? <section id="gsc-performance" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Google organic performance" title="Search Analytics snapshot" note={`Final aggregate for ${performance.startDate} → ${performance.endDate}. Search Console data can lag behind real time.`} />
      <div className="admin-domain-card-grid">
        <article className="admin-domain-card"><span>Search</span><strong>Clicks</strong><p>Clicks from Google Search in the selected API window.</p><b>{metric(performance.clicks)}</b><i>Organic</i></article>
        <article className="admin-domain-card"><span>Search</span><strong>Impressions</strong><p>How often KONTΑ ΜΟΥ appeared in Google Search results.</p><b>{metric(performance.impressions)}</b><i>Visibility</i></article>
        <article className="admin-domain-card"><span>Search</span><strong>CTR</strong><p>Clicks divided by impressions for the aggregate property view.</p><b>{(performance.ctr * 100).toFixed(1)}%</b><i>Engagement</i></article>
        <article className="admin-domain-card"><span>Search</span><strong>Avg. position</strong><p>Average result position reported by Search Console.</p><b>{performance.position ? performance.position.toFixed(1) : "—"}</b><i>Ranking</i></article>
      </div>
    </section> : null}

    <section id="gsc-queries" className="vendor-section section-tint admin-anchor-section"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Search demand" title="Top Google queries" note={`Top 25 query rows for ${breakdown.startDate} → ${breakdown.endDate}. Use these to identify high-impression/low-CTR terms and near-page-one ranking opportunities.`} />
      {breakdown.error ? <div className="workspace-empty-state"><strong>Query/page breakdown unavailable.</strong><span>{breakdown.error}</span></div> : performanceRows(breakdown.queries, "No query rows returned.")}
    </div></section>

    <section id="gsc-pages" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Landing pages" title="Top Google pages" note="Page-level clicks, impressions, CTR and average position show which public URLs Google is actually surfacing." />
      {breakdown.error ? <div className="workspace-empty-state"><strong>Page breakdown unavailable.</strong><span>{breakdown.error}</span></div> : performanceRows(breakdown.pages, "No page rows returned.")}
    </section>

    <section id="gsc-inspection" className="vendor-section section-tint admin-anchor-section"><div className="shell">
      <WorkspaceSectionHeading eyebrow="URL Inspection" title="Inspect one public URL with Google" note="Operator-triggered and quota-aware. The server rejects URLs outside the configured Search Console property and never exposes credentials to the browser." />
      <AdminSearchConsoleUrlInspector csrfToken={principal.csrfToken} defaultUrl={seo.settings.canonicalOrigin} enabled={ready && canInspect} />
      {!canInspect && <p style={{ marginTop: 12 }}>Read-only Admin access can view Search Console evidence, but <code>content.write</code> permission is required to spend URL Inspection quota.</p>}
    </div></section>

    <section id="gsc-readiness" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Readiness" title="Connection checklist" note="The adapter never prints or returns the private key. A service account must separately be granted access to the Search Console property in Google." />
      <div className="workspace-queue-list">
        <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Search Console API switch</strong><small>Set BLS_GOOGLE_SEARCH_CONSOLE_ENABLED=true only after property access and credentials are ready.</small></div><span className="status-pill">{overview.readiness.enabled ? "Enabled" : "Disabled"}</span></div></article>
        <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Property</strong><small>Use the exact Search Console property form: URL-prefix or sc-domain: domain property.</small></div><span className="status-pill">{overview.readiness.siteUrl ? "Configured" : "Missing"}</span></div>{overview.readiness.siteUrl ? <div className="workspace-queue-primary"><span>{overview.readiness.siteUrl}</span></div> : null}</article>
        <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Service account</strong><small>Client email and RSA private key are read only from server environment variables. Grant that service-account email read access inside Search Console.</small></div><span className="status-pill">{overview.readiness.credentialsConfigured ? "Configured" : "Missing"}</span></div></article>
        <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Google verification metadata</strong><small>The public verification tag is separately managed in SEO & Visibility settings; it is not an API credential.</small></div><span className="status-pill">{seo.settings.googleSiteVerification ? "Configured" : "Optional"}</span></div></article>
        {overview.error ? <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>API diagnostic</strong><small>{overview.error}</small></div><span className="status-pill">Needs attention</span></div></article> : null}
      </div>
    </section>
  </main>;
}
