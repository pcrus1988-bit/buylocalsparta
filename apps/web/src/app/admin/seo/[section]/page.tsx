import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminSeoIssueQueue } from "../../../../components/AdminSeoIssueQueue";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { getSeoCrawlHistorySnapshot } from "../../../../lib/seo-crawl-history";

export const metadata: Metadata = {
  title: "SEO Issues · Admin",
  robots: { index: false, follow: false, nocache: true }
};

type Props = Readonly<{ params: Promise<{ section: string }> }>;

export default async function AdminSeoSectionPage({ params }: Props) {
  const { section } = await params;
  if (section !== "issues") notFound();
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  const history = await getSeoCrawlHistorySnapshot(principal);
  const canWrite = hasAdminPermission(principal, "content.write");

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="SEO Issues" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Content · SEO & Visibility · Issues</div>
        <h1>SEO issue queue</h1>
        <p className="lead">Durable URL-level problems detected by live verification, with recurrence evidence and an explicit operator lifecycle. Resolve, ignore or reopen findings without losing the immutable crawl observations that produced them.</p>
      </div>
      <aside className={history.metrics.criticalOpen ? "dashboard-health-card needs-attention" : "dashboard-health-card"}>
        <span>Open findings</span>
        <strong>{history.metrics.open}</strong>
        <p>{history.metrics.criticalOpen} critical · {history.metrics.ignored} ignored</p>
      </aside>
    </section>

    <section className="shell admin-local-tabs-shell">
      <nav className="admin-local-tabs" aria-label="SEO issue workspace navigation">
        <Link href="/admin/seo">SEO overview</Link>
        <Link href="/admin/seo/issues">Issues</Link>
        <Link href="/admin/seo/crawl">Crawl</Link>
        <Link href="/admin/seo/search-console">Search Console</Link>
      </nav>
    </section>

    <AdminSeoIssueQueue history={history} csrfToken={principal.csrfToken} canWrite={canWrite} />
  </main>;
}