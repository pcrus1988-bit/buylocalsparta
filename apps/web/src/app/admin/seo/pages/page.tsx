import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminSeoRegistryActions } from "../../../../components/AdminSeoRegistryActions";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { getSeoUrlRegistryWorkspace } from "../../../../lib/seo-url-registry";

export const metadata: Metadata = {
  title: "SEO Pages · Admin",
  robots: { index: false, follow: false, nocache: true }
};

function kindLabel(kind: string) {
  if (kind === "partner_vendor") return "Partner vendor";
  if (kind === "research_vendor") return "Research vendor";
  if (kind === "cms") return "CMS page";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function crawlLabel(status?: number, issues = 0) {
  if (!status) return "Not crawled";
  if (status < 200 || status >= 300) return `HTTP ${status}`;
  return issues ? `${issues} issue${issues === 1 ? "" : "s"}` : "Healthy";
}

export default async function AdminSeoPagesPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await getSeoUrlRegistryWorkspace(principal);
  const canWrite = hasAdminPermission(principal, "content.write");

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Content · SEO & Visibility · Pages</div>
        <h1>Governed URL registry</h1>
        <p className="lead">One operator view of what each public URL is supposed to do, whether it appears in the latest production sitemap, what the latest HTTP crawl observed, and whether an unresolved SEO issue exists. The registry mirrors existing SEO policy; it does not replace it.</p>
      </div>
      <aside className={data.metrics.withCriticalIssues || data.metrics.expectedMissing ? "dashboard-health-card needs-attention" : "dashboard-health-card"}>
        <span>Active governed URLs</span>
        <strong>{data.metrics.active}</strong>
        <p>{data.metrics.withOpenIssues} with open issues · {data.metrics.expectedMissing} missing from sitemap</p>
      </aside>
    </section>

    <section className="shell admin-local-tabs-shell">
      <nav className="admin-local-tabs" aria-label="SEO page registry navigation">
        <Link href="/admin/seo">Overview</Link>
        <Link href="/admin/seo/pages">Pages</Link>
        <Link href="/admin/seo/issues">Issues</Link>
        <Link href="/admin/seo/crawl">Crawl</Link>
        <Link href="/admin/seo/sitemaps">Sitemaps</Link>
        <Link href="/admin/seo/search-console">Search Console</Link>
      </nav>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Desired indexable", value: data.metrics.desiredIndexable, tone: "positive" },
      { label: "Desired sitemap", value: data.metrics.desiredSitemap, tone: data.metrics.expectedMissing ? "attention" : "positive" },
      { label: "Actually in sitemap", value: data.metrics.actualSitemap, tone: data.sitemapEvidenceAvailable && data.latestSitemapValid ? "positive" : "attention" },
      { label: "Open-issue URLs", value: data.metrics.withOpenIssues, tone: data.metrics.withOpenIssues ? "attention" : "positive", hint: `${data.metrics.withCriticalIssues} critical` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Derived registry" title="Refresh governed URL inventory" note="The refresh enumerates current static, CMS, category, product and vendor URLs. It refuses to deactivate old rows if any source projection is degraded, preventing a temporary outage from masquerading as intentional URL removal." />
      <AdminSeoRegistryActions csrfToken={principal.csrfToken} canWrite={canWrite} action="sync" />
      {!data.persistenceAvailable && <div className="workspace-empty-state" style={{ marginTop: 16 }}><strong>Persistent URL registry is unavailable.</strong><span>PostgreSQL runtime is required for durable page-level SEO evidence.</span></div>}
      {data.latestSitemapCapturedAt && <p style={{ marginTop: 14 }}>Latest sitemap evidence: <strong>{data.latestSitemapValid ? "valid" : "invalid"}</strong> · {new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(data.latestSitemapCapturedAt))} · <code>{data.latestSitemapId}</code></p>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="URL-level evidence" title="Policy, sitemap, crawl and issue state" note="The newest crawl is evidence, not policy. A URL can be intentionally non-indexable yet technically healthy, or policy-indexable while still missing from the production sitemap or failing HTTP verification." />
      {data.rows.length === 0
        ? <div className="workspace-empty-state"><strong>No registry rows yet.</strong><span>Run “Refresh URL registry” after PostgreSQL is available to establish the operational URL inventory.</span></div>
        : <div className="workspace-queue-list">
          {data.rows.map((row) => {
            const sitemapMismatch = row.actualSitemap !== undefined && row.desiredSitemap !== row.actualSitemap;
            const crawlIssues = row.latestCrawl?.issueCount ?? 0;
            const attention = row.criticalOpenIssues > 0 || sitemapMismatch || Boolean(row.latestCrawl && (!row.latestCrawl.status || row.latestCrawl.status < 200 || row.latestCrawl.status >= 300));
            return <article className="workspace-queue-card" key={row.id}>
              <div className="workspace-queue-head">
                <div><strong>{row.label}</strong><small>{kindLabel(row.kind)} · {row.route}</small></div>
                <span className="status-pill">{!row.active ? "Inactive" : attention ? "Needs attention" : "Governed"}</span>
              </div>
              <div className="workspace-queue-primary"><span>Index: <strong>{row.desiredIndexable ? "allow" : "deny"}</strong> · Sitemap desired: <strong>{row.desiredSitemap ? "yes" : "no"}</strong> · Sitemap actual: <strong>{row.actualSitemap === undefined ? "no evidence" : row.actualSitemap ? "yes" : "no"}</strong> · Crawl: <strong>{crawlLabel(row.latestCrawl?.status, crawlIssues)}</strong></span></div>
              <div className="workspace-compact-list" style={{ marginTop: 10 }}>
                <div className="workspace-compact-row"><strong>Canonical</strong><span>{row.canonicalUrl}</span></div>
                <div className="workspace-compact-row"><strong>Internal discovery</strong><span>{row.inboundSources.length ? row.inboundSources.join(" · ") : "No declared inbound source"}</span></div>
                <div className="workspace-compact-row"><strong>Issues</strong><span>{row.openIssues} open · {row.criticalOpenIssues} critical</span></div>
                {row.latestCrawl && <div className="workspace-compact-row"><strong>Latest crawl</strong><span>{new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(row.latestCrawl.capturedAt))} · HTTP {row.latestCrawl.status ?? "—"} · {row.latestCrawl.responseTimeMs} ms · H1 {row.latestCrawl.h1Count ?? "—"}</span></div>}
              </div>
              {row.latestCrawl && <details className="workspace-tool-panel" style={{ marginTop: 10 }}><summary><span><strong>Latest HTTP/SEO evidence</strong><small>Title, final URL, canonical and robots from the newest persisted crawl of this route.</small></span></summary><div className="workspace-tool-body"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Title</strong><span>{row.latestCrawl.title ?? "—"}</span></div><div className="workspace-compact-row"><strong>Final URL</strong><span>{row.latestCrawl.finalUrl ?? "—"}</span></div><div className="workspace-compact-row"><strong>Observed canonical</strong><span>{row.latestCrawl.canonical ?? "—"}</span></div><div className="workspace-compact-row"><strong>Robots</strong><span>{row.latestCrawl.robots ?? "—"}</span></div></div></div></details>}
              <div className="workspace-action-bar"><span>Last registry sync: {new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(row.lastSeenAt))}</span><div className="workspace-action-buttons"><Link className="text-link" href={`/admin/seo/pages/${encodeURIComponent(row.id)}`}>Open SEO record →</Link><Link className="text-link" href={row.route} target="_blank">Open public page ↗</Link>{row.openIssues > 0 && <Link className="text-link" href="/admin/seo/issues">Review issues →</Link>}</div></div>
            </article>;
          })}
        </div>}
      {data.rows.length >= 1000 && <p style={{ marginTop: 16 }}>Showing the first 1,000 registry rows. The persistent registry retains the complete governed inventory.</p>}
    </div></section>
  </main>;
}
