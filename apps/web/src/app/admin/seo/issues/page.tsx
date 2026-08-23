import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminSeoIssueQueue } from "../../../../components/AdminSeoIssueQueue";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { getSeoCrawlHistorySnapshot } from "../../../../lib/seo-crawl-history";
import { getSeoUrlRegistryWorkspace } from "../../../../lib/seo-url-registry";

export const metadata: Metadata = {
  title: "SEO Issues · Admin",
  robots: { index: false, follow: false, nocache: true }
};

export default async function AdminSeoIssuesPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  const [history, registry] = await Promise.all([
    getSeoCrawlHistorySnapshot(principal),
    getSeoUrlRegistryWorkspace(principal)
  ]);
  const canWrite = hasAdminPermission(principal, "content.write");
  const pageIdsByRoute = Object.fromEntries(registry.rows.map((row) => [row.route, row.id]));

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Content · SEO & Visibility · Issues</div>
        <h1>SEO issue remediation queue</h1>
        <p className="lead">Durable URL-level problems detected by live verification, now connected directly to fix guidance, the unified SEO page record, and one-route production rechecks. Clean reliable evidence can close an open issue automatically without erasing its history.</p>
      </div>
      <aside className={history.metrics.criticalOpen ? "dashboard-health-card needs-attention" : "dashboard-health-card"}>
        <span>Open findings</span>
        <strong>{history.metrics.open}</strong>
        <p>{history.metrics.criticalOpen} critical · {history.metrics.ignored} ignored</p>
      </aside>
    </section>

    <section className="shell admin-local-tabs-shell">
      <nav className="admin-local-tabs" aria-label="SEO issue workspace navigation">
        <Link href="/admin/seo">Overview</Link>
        <Link href="/admin/seo/pages">Pages</Link>
        <Link href="/admin/seo/issues">Issues</Link>
        <Link href="/admin/seo/crawl">Crawl</Link>
        <Link href="/admin/seo/sitemaps">Sitemaps</Link>
        <Link href="/admin/seo/search-console">Search Console</Link>
      </nav>
    </section>

    <AdminSeoIssueQueue history={history} csrfToken={principal.csrfToken} canWrite={canWrite} pageIdsByRoute={pageIdsByRoute} />
  </main>;
}
