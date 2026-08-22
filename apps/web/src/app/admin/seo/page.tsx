import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminSeoWorkspace } from "../../../lib/admin-seo-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = {
  title: "SEO & Visibility · Admin",
  robots: { index: false, follow: false, nocache: true }
};

function severityLabel(severity: "critical" | "warning" | "info" | "good") {
  if (severity === "critical") return "Critical";
  if (severity === "warning") return "Warning";
  if (severity === "good") return "Good";
  return "Info";
}

export default async function AdminSeoPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  let data;
  try {
    data = await adminSeoWorkspace(principal);
  } catch {
    redirect("/admin");
  }

  const critical = data.diagnostics.filter((item) => item.severity === "critical").length;
  const warnings = data.diagnostics.filter((item) => item.severity === "warning").length;
  const blockedResearch = data.metrics.research - data.metrics.researchIndexEligible;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />

    <section id="seo-overview" className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Content · SEO & Visibility</div>
        <h1>Search visibility control centre</h1>
        <p className="lead">Ένα σημείο ελέγχου για indexability, sitemap, Research vendor local SEO, product readiness και προστασία ιδιωτικών surfaces. Η ασφάλεια παραμένει authentication/RBAC· τα crawler directives είναι ξεχωριστό επίπεδο.</p>
      </div>
      <aside className={critical ? "dashboard-health-card needs-attention" : "dashboard-health-card"}>
        <span>SEO diagnostics</span>
        <strong>{critical ? `${critical} critical` : warnings ? `${warnings} warnings` : "Healthy"}</strong>
        <p>Snapshot {new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(data.generatedAt))}</p>
      </aside>
    </section>

    <section className="shell admin-local-tabs-shell">
      <nav className="admin-local-tabs" aria-label="SEO workspace sections">
        <a href="#seo-overview">Overview</a>
        <a href="#seo-diagnostics">Diagnostics</a>
        <a href="#seo-research-vendors">Research vendors</a>
        <a href="#seo-policy">Policy</a>
      </nav>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Sitemap (estimated)", value: data.metrics.sitemapEstimatedCount, tone: "positive", hint: data.sitemapUrl },
      { label: "Products", value: data.metrics.products, hint: `${data.metrics.productsWithApprovedImage} with approved image` },
      { label: "Research indexed", value: data.metrics.researchIndexEligible, tone: blockedResearch ? "attention" : "positive", hint: `${blockedResearch} held by quality gate` },
      { label: "Private/noindex", value: data.metrics.knownNonIndexablePages, hint: "known page routes" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Index inventory" title="What KONTΑ ΜΟΥ currently wants search engines to understand" note="Sitemap admission is explicit. Public visibility alone does not automatically mean index eligibility." />
      <div className="admin-domain-card-grid">
        <article className="admin-domain-card"><span>Static</span><strong>Public pages</strong><p>Homepage, discovery, trust/help and other curated public routes.</p><b>{data.metrics.staticIndexable}</b><i>Indexable</i></article>
        <article className="admin-domain-card"><span>Taxonomy</span><strong>Categories</strong><p>Curated category landing pages in the public crawl graph.</p><b>{data.metrics.categories}</b><i>Indexable</i></article>
        <article className="admin-domain-card"><span>Commerce</span><strong>Canonical products</strong><p>Only products admitted by the existing public canonical safety boundary.</p><b>{data.metrics.products}</b><i>Public</i></article>
        <article className="admin-domain-card"><span>Local SEO</span><strong>Vendor dossiers</strong><p>{data.metrics.partners} partners + {data.metrics.researchIndexEligible} quality-gated research businesses.</p><b>{data.metrics.vendorIndexEligible}</b><i>Sitemap eligible</i></article>
      </div>
      <p style={{ marginTop: 16 }}>Public origin: <code>{data.origin}</code> · <Link className="text-link" href="/sitemap.xml" target="_blank">Sitemap ↗</Link> · <Link className="text-link" href="/robots.txt" target="_blank">robots.txt ↗</Link></p>
    </section>

    <section id="seo-diagnostics" className="vendor-section section-tint admin-anchor-section"><div className="shell">
      <WorkspaceSectionHeading eyebrow="In-house diagnostics" title="Search & privacy checks" note="These checks use only public/read-only projections and configuration state. They do not store session cookies, customer data or credentials." />
      <div className="workspace-queue-list">
        {data.diagnostics.map((item) => <article className="workspace-queue-card" key={item.id}>
          <div className="workspace-queue-head">
            <div><strong>{item.title}</strong><small>{item.detail}</small></div>
            <span className="status-pill">{severityLabel(item.severity)}{typeof item.count === "number" ? ` · ${item.count}` : ""}</span>
          </div>
        </article>)}
      </div>
    </div></section>

    <section id="seo-research-vendors" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Model C · Local directory SEO" title="Research vendor index eligibility" note="Research pages are an intentional search surface, but only records with a meaningful name, usable local address, category and sufficient quality signals enter the sitemap." />
      <div className="workspace-queue-list">
        {data.researchVendors.length === 0 ? <div className="workspace-empty-state"><strong>No research vendors in the public directory projection.</strong><span>The quality gate will populate automatically when public research records are available.</span></div> : data.researchVendors.slice(0, 100).map((vendor) => <article className="workspace-queue-card" key={vendor.id}>
          <div className="workspace-queue-head">
            <div><strong>{vendor.name}</strong><small>Quality score {vendor.score}/{vendor.minimumScore}{vendor.checkedAt ? ` · checked ${vendor.checkedAt}` : ""}</small></div>
            <span className="status-pill">{vendor.eligible ? "Index eligible" : "Held back"}</span>
          </div>
          <div className="workspace-queue-primary"><span>{vendor.reasons.join(" · ") || "No positive quality signals recorded"}</span></div>
          {vendor.blockingReasons.length > 0 && <details className="workspace-tool-panel" style={{ marginTop: 12 }}><summary><span><strong>Why this record is held back</strong><small>{vendor.blockingReasons.join(" · ")}</small></span></summary><div className="workspace-tool-body"><p>{vendor.blockingReasons.join(" · ")}</p></div></details>}
          <div className="workspace-action-bar"><span>Public ID: <strong>{vendor.id}</strong></span><div className="workspace-action-buttons"><Link className="text-link" href={`/vendor/${encodeURIComponent(vendor.id)}`} target="_blank">Open public dossier ↗</Link><Link className="text-link" href={`/admin/research-vendors/${encodeURIComponent(vendor.id)}`}>Open source record →</Link></div></div>
        </article>)}
      </div>
      {data.researchVendors.length > 100 && <p style={{ marginTop: 16 }}>Showing the first 100 ordered by eligibility/quality. Full filtering, override editing and exports are part of the settings/report layer in this branch roadmap.</p>}
    </section>

    <section id="seo-policy" className="vendor-section section-tint admin-anchor-section"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Governance" title="Visibility policy" note="The current route model deliberately preserves the existing /vendor workspace/public-profile namespace to avoid breaking operational flows." />
      <div className="admin-domain-card-grid">
        <article className="admin-domain-card"><span>Public</span><strong>Indexable policies</strong><p>Pages/entities intended to be discoverable and eligible for sitemap admission.</p><b>{data.routeClassCounts.PUBLIC_INDEXABLE}</b><i>Policy families</i></article>
        <article className="admin-domain-card"><span>Public utility</span><strong>Noindex</strong><p>Human-accessible transactional or authentication surfaces without organic-search value.</p><b>{data.routeClassCounts.PUBLIC_NOINDEX}</b><i>Policy families</i></article>
        <article className="admin-domain-card"><span>Protected</span><strong>Authenticated private</strong><p>Customer, vendor, staff and admin workspaces remain authorization-protected and centrally search-excluded.</p><b>{data.routeClassCounts.AUTHENTICATED_PRIVATE}</b><i>Policy families</i></article>
        <article className="admin-domain-card"><span>System</span><strong>Internal</strong><p>API/system routes are not search documents; approved public media is the explicit crawler exception.</p><b>{data.routeClassCounts.INTERNAL_SYSTEM}</b><i>Policy families</i></article>
      </div>
    </div></section>
  </main>;
}
