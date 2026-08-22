import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminSeoLiveCrawler } from "../../../../components/AdminSeoLiveCrawler";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { adminSeoCrawlGraph } from "../../../../lib/seo-crawl-graph";

export const metadata: Metadata = {
  title: "SEO Crawl · Admin",
  robots: { index: false, follow: false, nocache: true }
};

function kindLabel(kind: "static" | "category" | "product" | "partner_vendor" | "research_vendor") {
  if (kind === "partner_vendor") return "Partner vendor";
  if (kind === "research_vendor") return "Research vendor";
  return kind[0].toUpperCase() + kind.slice(1);
}

export default async function AdminSeoCrawlPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  let data;
  try {
    data = await adminSeoCrawlGraph(principal);
  } catch {
    redirect("/admin/seo");
  }
  const canRunLiveCrawl = hasAdminPermission(principal, "content.write");

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Content · SEO & Visibility · Crawl</div>
        <h1>Crawl architecture & live verification</h1>
        <p className="lead">Internal linking & orphan diagnostics now combine two evidence layers: the Declared Site Graph shows how KONTΑ ΜΟΥ expects indexable pages to connect, while Live HTTP Verification checks what the production origin actually returns.</p>
      </div>
      <aside className={data.metrics.orphan ? "dashboard-health-card needs-attention" : "dashboard-health-card"}>
        <span>Declared graph</span>
        <strong>{data.metrics.orphan ? `${data.metrics.orphan} orphan` : `${data.metrics.weak} weak`}</strong>
        <p>{new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(data.generatedAt))}</p>
      </aside>
    </section>

    <section className="shell admin-local-tabs-shell">
      <nav className="admin-local-tabs" aria-label="Crawl workspace sections">
        <a href="#crawl-declared">Declared site graph</a>
        <a href="#crawl-live">Live HTTP verification</a>
        <a href="#crawl-priority">Priority queue</a>
        <Link href="/admin/seo/search-console">Google Search Console</Link>
        <Link href="/admin/seo">SEO overview</Link>
      </nav>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Indexable nodes", value: data.metrics.indexable, tone: "positive" },
      { label: "Strongly linked", value: data.metrics.strong, tone: "positive", hint: "2+ declared inbound discovery sources" },
      { label: "Weakly linked", value: data.metrics.weak, tone: data.metrics.weak ? "attention" : "positive", hint: "one declared inbound source" },
      { label: "Orphans", value: data.metrics.orphan, tone: data.metrics.orphan ? "attention" : "positive", hint: "no declared inbound source" }
    ]} />

    <section id="crawl-declared" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Declared Site Graph" title="Intended internal linking architecture" note="This is a model of stable public discovery relationships. It is intentionally distinct from the live HTTP crawler below, backlinks and Google index status." />
      <div className="admin-domain-card-grid">
        <article className="admin-domain-card"><span>Strong</span><strong>2+ inbound paths</strong><p>Examples: categories linked from the homepage and sibling category pages; products linked from catalogue and category.</p><b>{data.metrics.strong}</b><i>Healthy</i></article>
        <article className="admin-domain-card"><span>Weak</span><strong>1 inbound path</strong><p>Discoverable, but overly dependent on one directory or navigation surface. Research vendor dossiers will commonly start here.</p><b>{data.metrics.weak}</b><i>Opportunity</i></article>
        <article className="admin-domain-card"><span>Orphan</span><strong>No known inbound path</strong><p>An indexable URL should not rely on sitemap submission alone. These require a public discovery link or a deliberate noindex decision.</p><b>{data.metrics.orphan}</b><i>Action</i></article>
        <article className="admin-domain-card"><span>Runtime</span><strong>Projection availability</strong><p>Products: {data.runtime.productsAvailable ? "available" : "degraded"} · Vendors: {data.runtime.vendorsAvailable ? "available" : "degraded"}.</p><b>{data.metrics.total}</b><i>Total governed nodes</i></article>
      </div>
    </section>

    <section id="crawl-live" className="vendor-section section-tint admin-anchor-section"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Actual Crawl" title="Live HTTP verification" note="Operator-triggered bounded crawl of up to 100 governed indexable URLs. It checks production response evidence without permitting arbitrary external targets or changing public data." />
      <AdminSeoLiveCrawler csrfToken={data.csrfToken} enabled={canRunLiveCrawl} />
      <p style={{ marginTop: 12 }}>Current live verification is intentionally bounded and synchronous. Persisted crawl history, deployment-to-deployment comparison and full-link extraction are the next crawler layer.</p>
    </div></section>

    <section id="crawl-priority" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Declared graph priority queue" title="Orphan and weakly-linked indexable pages" note="Orphans appear first, followed by pages with only one stable inbound discovery source." />
      {data.orphan.length === 0 && data.weak.length === 0
        ? <div className="workspace-empty-state"><strong>No crawl-graph gaps detected.</strong><span>Every indexable entity has at least two declared discovery sources or is the root entry point.</span></div>
        : <div className="workspace-queue-list">
            {[...data.orphan, ...data.weak].slice(0, 200).map((node) => <article className="workspace-queue-card" key={node.key}>
              <div className="workspace-queue-head">
                <div><strong>{node.label}</strong><small>{kindLabel(node.kind)} · {node.route}</small></div>
                <span className="status-pill">{node.inboundSources.length === 0 ? "Orphan" : "Weak link"}</span>
              </div>
              <div className="workspace-queue-primary"><span>{node.inboundSources.length ? node.inboundSources.join(" · ") : "No declared public inbound discovery source"}</span></div>
              <div className="workspace-action-bar"><span>{node.inboundSources.length} inbound source{node.inboundSources.length === 1 ? "" : "s"}</span><div className="workspace-action-buttons"><Link className="text-link" href={node.route} target="_blank">Open public page ↗</Link></div></div>
            </article>)}
          </div>}
      {data.orphan.length + data.weak.length > 200 && <p style={{ marginTop: 16 }}>Showing the first 200 priority nodes. Aggregate counts above cover the full governed inventory.</p>}
    </section>
  </main>;
}
