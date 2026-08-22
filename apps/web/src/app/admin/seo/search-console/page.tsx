import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { getAdminSession } from "../../../../lib/admin-session";
import { getSearchConsoleOverview } from "../../../../lib/seo-search-console";
import { getSeoGlobalSettingsSnapshot } from "../../../../lib/seo-settings";

export const metadata: Metadata = {
  title: "Google Search Console · Admin",
  robots: { index: false, follow: false, nocache: true }
};

export default async function AdminSeoSearchConsolePage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  const [overview, seo] = await Promise.all([
    getSearchConsoleOverview(),
    getSeoGlobalSettingsSnapshot()
  ]);
  const ready = overview.readiness.ready;
  const performance = overview.performance;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Content · SEO & Visibility · Google</div>
        <h1>Search Console integration</h1>
        <p className="lead">Server-only, read-only σύνδεση με Google Search Console. Τα credentials παραμένουν αποκλειστικά σε environment variables και δεν αποθηκεύονται στο SEO settings registry, στα reports ή στο browser.</p>
      </div>
      <aside className={ready && !overview.error ? "dashboard-health-card" : "dashboard-health-card needs-attention"}>
        <span>Integration</span>
        <strong>{ready ? overview.error ? "API error" : "Ready" : overview.readiness.enabled ? "Incomplete" : "Disabled"}</strong>
        <p>{overview.readiness.siteUrl ?? "No Search Console property configured"}</p>
      </aside>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "API enabled", value: overview.readiness.enabled ? "Yes" : "No", tone: overview.readiness.enabled ? "positive" : "attention" },
      { label: "Credentials", value: overview.readiness.credentialsConfigured ? "Configured" : "Missing", tone: overview.readiness.credentialsConfigured ? "positive" : "attention" },
      { label: "Site verification meta", value: seo.settings.googleSiteVerification ? "Configured" : "Not set", tone: seo.settings.googleSiteVerification ? "positive" : "default" },
      { label: "Indexing master", value: seo.settings.indexingEnabled ? "On" : "Off", tone: seo.settings.indexingEnabled ? "positive" : "attention" }
    ]} />

    {performance ? <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Google organic performance" title="Search Analytics snapshot" note={`Read-only aggregate for ${performance.startDate} → ${performance.endDate}. Search Console data can lag behind real time.`} />
      <div className="admin-domain-card-grid">
        <article className="admin-domain-card"><span>Search</span><strong>Clicks</strong><p>Clicks from Google Search in the selected API window.</p><b>{Math.round(performance.clicks)}</b><i>Organic</i></article>
        <article className="admin-domain-card"><span>Search</span><strong>Impressions</strong><p>How often KONTΑ ΜΟΥ appeared in Google Search results.</p><b>{Math.round(performance.impressions)}</b><i>Visibility</i></article>
        <article className="admin-domain-card"><span>Search</span><strong>CTR</strong><p>Clicks divided by impressions for the aggregate property view.</p><b>{(performance.ctr * 100).toFixed(1)}%</b><i>Engagement</i></article>
        <article className="admin-domain-card"><span>Search</span><strong>Avg. position</strong><p>Average result position reported by Search Console.</p><b>{performance.position ? performance.position.toFixed(1) : "—"}</b><i>Ranking</i></article>
      </div>
    </section> : null}

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Readiness" title="Connection checklist" note="The adapter never prints or returns the private key. A service account must separately be granted access to the Search Console property in Google." />
      <div className="workspace-queue-list">
        <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Search Console API switch</strong><small>Set BLS_GOOGLE_SEARCH_CONSOLE_ENABLED=true only after property access and credentials are ready.</small></div><span className="status-pill">{overview.readiness.enabled ? "Enabled" : "Disabled"}</span></div></article>
        <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Property</strong><small>Use the exact Search Console property form: URL-prefix or sc-domain: domain property.</small></div><span className="status-pill">{overview.readiness.siteUrl ? "Configured" : "Missing"}</span></div>{overview.readiness.siteUrl ? <div className="workspace-queue-primary"><span>{overview.readiness.siteUrl}</span></div> : null}</article>
        <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Service account</strong><small>Client email and RSA private key are read only from server environment variables. Grant that service-account email read access inside Search Console.</small></div><span className="status-pill">{overview.readiness.credentialsConfigured ? "Configured" : "Missing"}</span></div></article>
        <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Google verification metadata</strong><small>The public verification tag is separately managed in SEO & Visibility settings; it is not an API credential.</small></div><span className="status-pill">{seo.settings.googleSiteVerification ? "Configured" : "Optional"}</span></div></article>
        {overview.error ? <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>API diagnostic</strong><small>{overview.error}</small></div><span className="status-pill">Needs attention</span></div></article> : null}
      </div>
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="URL Inspection" title="Designed for bounded diagnostics" note="The server adapter supports URL Inspection, but this page intentionally does not mass-inspect every sitemap URL. Inspection should be operator-triggered and quota-aware once the property is connected." />
      <p>The in-house crawl graph remains the first-line structural diagnostic. Search Console then supplies Google-specific indexing evidence after the service account is connected.</p>
      <div className="workspace-action-bar"><span>Next: connect property → verify aggregate API → enable bounded URL inspection reports.</span><div className="workspace-action-buttons"><Link className="text-link" href="/admin/seo/crawl">Crawl graph →</Link><Link className="text-link" href="/admin/seo">SEO Control Centre →</Link></div></div>
    </section>
  </main>;
}
