import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminSeoEntityOverrideEditor } from "../../../components/AdminSeoEntityOverrideEditor";
import { AdminSeoReportRunner } from "../../../components/AdminSeoReportRunner";
import { AdminSeoSettingsEditor } from "../../../components/AdminSeoSettingsEditor";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../lib/admin-runtime";
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

  let data: Awaited<ReturnType<typeof adminSeoWorkspace>>;
  try {
    data = await adminSeoWorkspace(principal);
  } catch {
    redirect("/admin");
  }

  const critical = data.diagnostics.filter((item) => item.severity === "critical").length;
  const warnings = data.diagnostics.filter((item) => item.severity === "warning").length;
  const blockedResearch = data.metrics.research - data.metrics.researchIndexEligible;
  const canEdit = hasAdminPermission(principal, "content.write");
  const latestReport = data.reports.reports[0];
  const previousReport = data.reports.reports[1];
  const scoreDelta = latestReport && previousReport ? latestReport.score - previousReport.score : undefined;

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
        <a href="#seo-settings">Settings</a>
        <a href="#seo-entities">Entity registry</a>
        <a href="#seo-reports">Reports</a>
        <a href="#seo-diagnostics">Diagnostics</a>
        <a href="#seo-research-vendors">Research vendors</a>
        <a href="#seo-audit">Audit</a>
        <a href="#seo-policy">Policy</a>
      </nav>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Sitemap (estimated)", value: data.metrics.sitemapEstimatedCount, tone: data.settings.settings.indexingEnabled ? "positive" : "attention", hint: data.settings.settings.indexingEnabled ? data.sitemapUrl : "global indexing disabled" },
      { label: "Products", value: data.metrics.products, hint: `${data.metrics.productsWithApprovedImage} with approved image` },
      { label: "Research indexed", value: data.metrics.researchIndexEligible, tone: blockedResearch ? "attention" : "positive", hint: `${blockedResearch} held by quality gate` },
      { label: "Overrides", value: data.metrics.entityOverrides, tone: data.metrics.entityOverrides ? "attention" : undefined, hint: `${data.entityCandidates.length} governed entities` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Index inventory" title="What KONTΑ ΜΟΥ currently wants search engines to understand" note="Sitemap admission is explicit. Public visibility alone does not automatically mean index eligibility." />
      <div className="admin-domain-card-grid">
        <article className="admin-domain-card"><span>Static</span><strong>Public pages</strong><p>Homepage, discovery, trust/help and other curated public routes.</p><b>{data.metrics.staticIndexable}</b><i>Indexable</i></article>
        <article className="admin-domain-card"><span>Taxonomy</span><strong>Categories</strong><p>Curated category landing pages in the public crawl graph.</p><b>{data.metrics.categories}</b><i>Indexable</i></article>
        <article className="admin-domain-card"><span>Commerce</span><strong>Canonical products</strong><p>Only products admitted by the existing public canonical safety boundary.</p><b>{data.metrics.products}</b><i>Public</i></article>
        <article className="admin-domain-card"><span>Local SEO</span><strong>Vendor dossiers</strong><p>{data.metrics.partners} partners + {data.metrics.researchIndexEligible} quality-gated research businesses.</p><b>{data.metrics.vendorIndexEligible}</b><i>Sitemap eligible</i></article>
      </div>
      <p style={{ marginTop: 16 }}>Public origin: <code>{data.origin}</code> · <a className="text-link" href={data.sitemapUrl} target="_blank" rel="noreferrer">Sitemap ↗</a> · <a className="text-link" href={data.robotsUrl} target="_blank" rel="noreferrer">robots.txt ↗</a></p>
    </section>

    <section id="seo-settings" className="vendor-section section-tint admin-anchor-section"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Governed configuration" title="Global SEO settings" note="Generated defaults remain safe when persistence is unavailable. Authorised edits use optimistic version checks, explicit CSRF validation and immutable audit evidence." />
      {canEdit
        ? <AdminSeoSettingsEditor key={data.settings.version} snapshot={data.settings} csrfToken={data.csrfToken} />
        : <div className="workspace-empty-state"><strong>Read-only SEO access.</strong><span>Your Admin role can inspect diagnostics and policy, but content.write permission is required to change search settings.</span></div>}
    </div></section>

    <section id="seo-entities" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Phase 1.3 · Governed overrides" title="Page and entity SEO registry" note="Generated metadata remains the default. Overrides are intentional, version-checked and auditable; they cannot bypass global shutdown, private-route policy, public admission or hard Research quality blockers." />
      {canEdit
        ? <AdminSeoEntityOverrideEditor key={data.entityOverrides.version} candidates={data.entityCandidates} snapshot={data.entityOverrides} csrfToken={data.csrfToken} />
        : <div className="workspace-empty-state"><strong>Read-only SEO registry.</strong><span>Your Admin role can inspect effective entity decisions, but content.write permission is required to create or remove overrides.</span></div>}
    </section>

    <section id="seo-reports" className="vendor-section section-tint admin-anchor-section"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Phase 5 · Visibility reporting" title="Persisted diagnostic reports" note="Capture the current governed SEO projection as an immutable operational checkpoint. The bounded history contains aggregate public inventory, policy states and diagnostics only—never session cookies, customer records or credentials." />
      <div className="admin-domain-card-grid" style={{ marginBottom: 20 }}>
        <article className="admin-domain-card"><span>Latest health</span><strong>{latestReport ? `${latestReport.score}/100` : "No baseline"}</strong><p>Internal readiness score derived from critical, warning and informational diagnostics—not a search-engine ranking score.</p><b>{latestReport ? latestReport.severityCounts.critical : critical}</b><i>Critical checks</i></article>
        <article className="admin-domain-card"><span>Trend</span><strong>{scoreDelta === undefined ? "Awaiting history" : scoreDelta === 0 ? "No change" : `${scoreDelta > 0 ? "+" : ""}${scoreDelta} points`}</strong><p>Difference between the two latest persisted snapshots.</p><b>{data.reports.reports.length}</b><i>Saved snapshots</i></article>
      </div>
      {canEdit
        ? <AdminSeoReportRunner csrfToken={data.csrfToken} persistenceAvailable={data.reports.persistenceAvailable} />
        : <div className="workspace-empty-state"><strong>Read-only report access.</strong><span>Your Admin role can inspect and export saved reports, but content.write permission is required to create a new audited snapshot.</span></div>}

      <h3 style={{ marginTop: 28 }}>Report history</h3>
      <div className="workspace-queue-list" style={{ marginTop: 12 }}>
        {data.reports.reports.length === 0
          ? <div className="workspace-empty-state"><strong>No persisted diagnostic reports yet.</strong><span>Run the first report to establish a dated baseline for release review and later trend comparison.</span></div>
          : data.reports.reports.slice(0, 20).map((report) => <article className="workspace-queue-card" key={report.id}>
            <div className="workspace-queue-head">
              <div><strong>{report.reason}</strong><small>{new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(report.createdAt))} · actor {report.actorId} · {report.metrics.sitemapEstimatedCount} estimated sitemap URLs</small></div>
              <span className="status-pill">Health {report.score}/100</span>
            </div>
            <div className="workspace-queue-primary"><span>{report.severityCounts.critical} critical · {report.severityCounts.warning} warnings · {report.severityCounts.info} informational · {report.severityCounts.good} good</span></div>
            <div className="workspace-action-bar">
              <span>Report ID: <strong>{report.id}</strong></span>
              <div className="workspace-action-buttons"><a className="text-link" href={`/api/admin/seo/reports/${report.id}?format=json`}>JSON ↓</a><a className="text-link" href={`/api/admin/seo/reports/${report.id}?format=csv`}>CSV ↓</a></div>
            </div>
          </article>)}
      </div>
      {data.reports.reports.length > 20 && <p style={{ marginTop: 16 }}>Showing the latest 20 of {data.reports.reports.length} retained snapshots.</p>}
    </div></section>

    <section id="seo-diagnostics" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="In-house diagnostics" title="Search & privacy checks" note="These checks use only public/read-only projections and configuration state. They do not store session cookies, customer data or credentials." />
      <div className="workspace-queue-list">
        {data.diagnostics.map((item) => <article className="workspace-queue-card" key={item.id}>
          <div className="workspace-queue-head">
            <div><strong>{item.title}</strong><small>{item.detail}</small></div>
            <span className="status-pill">{severityLabel(item.severity)}{typeof item.count === "number" ? ` · ${item.count}` : ""}</span>
          </div>
        </article>)}
      </div>
    </section>

    <section id="seo-research-vendors" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Model C · Local directory SEO" title="Research vendor index eligibility" note="Research pages are an intentional search surface, but only records with a meaningful name, usable local address, category and sufficient quality signals enter the sitemap." />
      <div className="workspace-queue-list">
        {data.researchVendors.length === 0 ? <div className="workspace-empty-state"><strong>No research vendors in the public directory projection.</strong><span>The quality gate will populate automatically when public research records are available.</span></div> : data.researchVendors.slice(0, 100).map((vendor) => <article className="workspace-queue-card" key={vendor.id}>
          <div className="workspace-queue-head">
            <div><strong>{vendor.name}</strong><small>Quality score {vendor.score}/{vendor.minimumScore}{vendor.checkedAt ? ` · checked ${vendor.checkedAt}` : ""}{vendor.overrideDecision ? ` · override ${vendor.overrideDecision}` : ""}</small></div>
            <span className="status-pill">{vendor.eligible ? "Index eligible" : "Held back"}</span>
          </div>
          <div className="workspace-queue-primary"><span>{vendor.reasons.join(" · ") || "No positive quality signals recorded"}</span></div>
          {vendor.blockingReasons.length > 0 && <details className="workspace-tool-panel" style={{ marginTop: 12 }}><summary><span><strong>Why this record is held back</strong><small>{vendor.blockingReasons.join(" · ")}</small></span></summary><div className="workspace-tool-body"><p>{vendor.blockingReasons.join(" · ")}</p></div></details>}
          <div className="workspace-action-bar"><span>Public ID: <strong>{vendor.id}</strong></span><div className="workspace-action-buttons"><Link className="text-link" href={`/vendor/${encodeURIComponent(vendor.id)}`} target="_blank">Open public dossier ↗</Link><Link className="text-link" href={`/admin/research-vendors/${encodeURIComponent(vendor.id)}`}>Open source record →</Link></div></div>
        </article>)}
      </div>
      {data.researchVendors.length > 100 && <p style={{ marginTop: 16 }}>Showing the first 100 ordered by eligibility/quality. Full filtering, override editing and exports are part of the settings/report layer in this branch roadmap.</p>}
    </section>

    <section id="seo-audit" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Accountability" title="SEO audit history" note="Each global or entity-level change records the actor, timestamp, reason and before/after state. Entity deletions are retained as immutable evidence." />
      <h3>Entity overrides</h3>
      <div className="workspace-queue-list" style={{ marginTop: 12 }}>
        {data.entityAudit.length === 0
          ? <div className="workspace-empty-state"><strong>No entity override history yet.</strong><span>The first authorised entity save or deletion will create immutable audit evidence.</span></div>
          : data.entityAudit.map((entry) => <article className="workspace-queue-card" key={entry.id}>
            <div className="workspace-queue-head">
              <div><strong>{entry.reason ?? `SEO entity override ${entry.action}`}</strong><small>{entry.entityKey} · {new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(entry.createdAt))} · actor {entry.actorId}</small></div>
              <span className="status-pill">{entry.action}</span>
            </div>
            <div className="workspace-queue-primary"><span>{entry.changedKeys.length ? entry.changedKeys.join(" · ") : "No normalized field difference detected"}</span></div>
          </article>)}
      </div>
      <h3 style={{ marginTop: 28 }}>Global settings</h3>
      <div className="workspace-queue-list">
        {data.settingsAudit.length === 0
          ? <div className="workspace-empty-state"><strong>No persisted SEO settings changes yet.</strong><span>The first authorised save will create the initial immutable audit record.</span></div>
          : data.settingsAudit.map((entry) => <article className="workspace-queue-card" key={entry.id}>
            <div className="workspace-queue-head">
              <div><strong>{entry.reason ?? "SEO settings updated"}</strong><small>{new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(entry.createdAt))} · actor {entry.actorId}</small></div>
              <span className="status-pill">{entry.actorRole ?? "admin"}</span>
            </div>
            <div className="workspace-queue-primary"><span>{entry.changedKeys.length ? entry.changedKeys.join(" · ") : "No normalized field difference detected"}</span></div>
          </article>)}
      </div>
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
