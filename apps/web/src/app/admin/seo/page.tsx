import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminSeoEntityOverrideEditor } from "../../../components/AdminSeoEntityOverrideEditor";
import { AdminSeoSettingsEditor } from "../../../components/AdminSeoSettingsEditor";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../lib/admin-runtime";
import { adminSeoWorkspace } from "../../../lib/admin-seo-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { productPublicPath } from "../../../lib/product-url";

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
  const actionableDiagnostics = data.diagnostics.filter((item) => item.severity === "critical" || item.severity === "warning");
  const blockedProducts = data.metrics.products - data.metrics.productIndexEligible;
  const blockedResearch = data.metrics.research - data.metrics.researchIndexEligible;
  const canEdit = hasAdminPermission(principal, "content.write");

  return <main className="vendor-app admin-app admin-seo-overview">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">SEO & Visibility</div>
        <h1>Search visibility</h1>
        <p className="lead">Καθημερινός έλεγχος του τι θέλουμε να βρίσκουν οι μηχανές αναζήτησης, τι χρειάζεται διόρθωση και ποιο εργαλείο πρέπει να ανοίξει μετά. Οι λεπτομερείς ρυθμίσεις και τα ιστορικά στοιχεία παραμένουν διαθέσιμα, αλλά δεν ανταγωνίζονται πλέον τις operational εργασίες.</p>
      </div>
      <aside className={critical ? "dashboard-health-card needs-attention" : "dashboard-health-card"}>
        <span>Current SEO state</span>
        <strong>{critical ? `${critical} critical` : warnings ? `${warnings} warnings` : "Healthy"}</strong>
        <p>{new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(data.generatedAt))}</p>
      </aside>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Indexable products", value: data.metrics.productIndexEligible, tone: blockedProducts ? "attention" : "positive", hint: `${blockedProducts} held back` },
      { label: "Indexable research vendors", value: data.metrics.researchIndexEligible, tone: blockedResearch ? "attention" : "positive", hint: `${blockedResearch} held back` },
      { label: "Estimated sitemap URLs", value: data.metrics.sitemapEstimatedCount, tone: data.settings.settings.indexingEnabled ? "positive" : "attention", hint: data.settings.settings.indexingEnabled ? "global indexing enabled" : "global indexing disabled" },
      { label: "Governed overrides", value: data.metrics.entityOverrides, hint: `${data.entityCandidates.length} governed entities` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Action centre" title="Τι χρειάζεται προσοχή τώρα" note="Το overview δείχνει μόνο actionable diagnostics. URL-level remediation παραμένει στο Issues workspace." />
      {actionableDiagnostics.length === 0
        ? <div className="workspace-page-empty"><div><div className="eyebrow">Healthy</div><h3>Δεν υπάρχει ενεργό SEO diagnostic που χρειάζεται παρέμβαση.</h3><p>Συνέχισε με Reports για release evidence ή Search Console για Google performance και coverage.</p></div></div>
        : <div className="workspace-queue-list seo-overview-attention">{actionableDiagnostics.slice(0, 8).map((item) => <article className="workspace-queue-card" key={item.id}>
          <div className="workspace-queue-head">
            <div><strong>{item.title}</strong><small>{item.detail}</small></div>
            <span className="status-pill">{severityLabel(item.severity)}{typeof item.count === "number" ? ` · ${item.count}` : ""}</span>
          </div>
        </article>)}</div>}
      {actionableDiagnostics.length > 8 && <p className="seo-overview-more">Showing 8 of {actionableDiagnostics.length} actionable diagnostics.</p>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Workflow" title="Άνοιξε το σωστό workspace" note="Κάθε εργασία έχει πλέον ένα κύριο σπίτι. Τα drill-down εργαλεία παραμένουν διαθέσιμα χωρίς να επαναλαμβάνονται σε κάθε σελίδα." />
      <div className="seo-workflow-grid">
        <Link className="seo-workflow-card" href="/admin/seo/pages"><span>Inventory</span><strong>Pages</strong><p>Governed URLs, index policy, sitemap state και latest crawl evidence.</p><b>{data.metrics.sitemapEstimatedCount}</b><i>URLs</i></Link>
        <Link className={`seo-workflow-card${critical || warnings ? " needs-attention" : ""}`} href="/admin/seo/issues"><span>Remediation</span><strong>Issues</strong><p>URL-level findings, fix guidance, rechecks και durable issue history.</p><b>{critical + warnings}</b><i>diagnostics</i></Link>
        <Link className="seo-workflow-card" href="/admin/seo/crawl"><span>Technical SEO</span><strong>Crawl</strong><p>Internal linking, orphans, live HTTP verification και crawl history.</p><b>HTTP</b><i>evidence</i></Link>
        <Link className="seo-workflow-card" href="/admin/seo/sitemaps"><span>Discovery</span><strong>Sitemaps</strong><p>Production sitemap snapshots, changes και registry reconciliation.</p><b>XML</b><i>production</i></Link>
        <Link className="seo-workflow-card" href="/admin/seo/search-console"><span>Google</span><strong>Search Console</strong><p>Performance, queries, pages, sitemap submission και URL Inspection.</p><b>GSC</b><i>Google evidence</i></Link>
        <Link className="seo-workflow-card" href="/admin/seo/schema"><span>Structured data</span><strong>Schema</strong><p>Expected versus observed JSON-LD για products και vendor dossiers.</p><b>JSON-LD</b><i>validation</i></Link>
        <Link className="seo-workflow-card" href="/admin/seo/reports"><span>Release review</span><strong>Reports</strong><p>Unified evidence, freshness, regressions και audited baselines.</p><b>{data.reports.reports.length}</b><i>saved baselines</i></Link>
        <Link className="seo-workflow-card" href="/admin/seo/production"><span>Automation</span><strong>Production signals</strong><p>Automated GSC/GA4 history, crawl health και Merchant Center feed.</p><b>Live</b><i>provider state</i></Link>
      </div>
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Index inventory" title="Τι επιτρέπεται να μπει στην οργανική αναζήτηση" note="Public visibility δεν σημαίνει αυτόματα index eligibility. Sitemap admission και quality gates παραμένουν explicit." />
      <div className="admin-domain-card-grid seo-inventory-grid">
        <article className="admin-domain-card"><span>Static</span><strong>Public pages</strong><p>Curated public routes intended for discovery.</p><b>{data.metrics.staticIndexable}</b><i>Indexable</i></article>
        <article className="admin-domain-card"><span>Taxonomy</span><strong>Categories</strong><p>Curated category landing pages in the public crawl graph.</p><b>{data.metrics.categories}</b><i>Indexable</i></article>
        <article className="admin-domain-card"><span>Commerce</span><strong>Canonical products</strong><p>{data.metrics.products} public canonicals · {blockedProducts} currently held by quality/admission gates.</p><b>{data.metrics.productIndexEligible}</b><i>Sitemap eligible</i></article>
        <article className="admin-domain-card"><span>Local SEO</span><strong>Vendor dossiers</strong><p>{data.metrics.partners} partners + research businesses passing the quality gate.</p><b>{data.metrics.vendorIndexEligible}</b><i>Sitemap eligible</i></article>
      </div>
      <div className="workspace-action-bar seo-public-endpoints">
        <span>Public origin: <code>{data.origin}</code></span>
        <div className="workspace-action-buttons"><a className="button button-secondary" href={data.sitemapUrl} target="_blank" rel="noreferrer">Sitemap ↗</a><a className="button button-secondary" href={data.robotsUrl} target="_blank" rel="noreferrer">robots.txt ↗</a></div>
      </div>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Configuration" title="Ρυθμίσεις και governed overrides" note="Δεν είναι καθημερινό operational work. Παραμένουν εδώ ως deliberate configuration tools και είναι κλειστά από προεπιλογή." />
      <details className="seo-admin-disclosure">
        <summary><span><strong>Global SEO settings</strong><small>Canonical origin, metadata defaults, indexing switch και Google verification metadata.</small></span><b>Configure</b></summary>
        <div className="seo-admin-disclosure-body">{canEdit
          ? <AdminSeoSettingsEditor key={data.settings.version} snapshot={data.settings} csrfToken={data.csrfToken} />
          : <div className="workspace-page-empty"><div><h3>Read-only SEO access.</h3><p>content.write permission is required to change search settings.</p></div></div>}</div>
      </details>
      <details className="seo-admin-disclosure">
        <summary><span><strong>Page & entity overrides</strong><small>Intentional metadata/index/schema decisions for governed entities; hard blockers cannot be bypassed.</small></span><b>{data.metrics.entityOverrides} active</b></summary>
        <div className="seo-admin-disclosure-body">{canEdit
          ? <AdminSeoEntityOverrideEditor key={data.entityOverrides.version} candidates={data.entityCandidates} snapshot={data.entityOverrides} csrfToken={data.csrfToken} />
          : <div className="workspace-page-empty"><div><h3>Read-only SEO registry.</h3><p>content.write permission is required to create or remove overrides.</p></div></div>}</div>
      </details>
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Eligibility drill-down" title="Γιατί συγκεκριμένες εγγραφές κρατούνται εκτός index" note="Αυτό είναι investigation, όχι overview. Οι λίστες είναι κλειστές μέχρι να χρειαστεί να εξεταστεί συγκεκριμένο quality gate." />
      <details className="seo-admin-disclosure">
        <summary><span><strong>Product index eligibility</strong><small>{data.metrics.productIndexEligible} eligible · {blockedProducts} held back.</small></span><b>{blockedProducts} held</b></summary>
        <div className="seo-admin-disclosure-body">
          <div className="workspace-queue-list">{data.products.length === 0 ? <div className="workspace-page-empty"><div><h3>No products in the public catalogue projection.</h3></div></div> : data.products.slice(0, 100).map((product) => <article className="workspace-queue-card" key={product.id}>
            <div className="workspace-queue-head"><div><strong>{product.title}</strong><small>Quality {product.score}/{product.minimumScore}{product.overrideDecision ? ` · override ${product.overrideDecision}` : ""}</small></div><span className="status-pill">{product.eligible ? "Index eligible" : "Held back"}</span></div>
            <div className="workspace-queue-primary"><span>{product.blockingReasons.length ? product.blockingReasons.join(" · ") : product.reasons.join(" · ") || "No positive quality signals recorded"}</span></div>
            <div className="workspace-action-bar"><span>Canonical ID: <strong>{product.id}</strong></span><div className="workspace-action-buttons"><Link className="text-link" href={productPublicPath(product)} target="_blank">Public product ↗</Link></div></div>
          </article>)}</div>
        </div>
      </details>
      <details className="seo-admin-disclosure">
        <summary><span><strong>Research vendor index eligibility</strong><small>{data.metrics.researchIndexEligible} eligible · {blockedResearch} held back.</small></span><b>{blockedResearch} held</b></summary>
        <div className="seo-admin-disclosure-body">
          <div className="workspace-queue-list">{data.researchVendors.length === 0 ? <div className="workspace-page-empty"><div><h3>No research vendors in the public directory projection.</h3></div></div> : data.researchVendors.slice(0, 100).map((vendor) => <article className="workspace-queue-card" key={vendor.id}>
            <div className="workspace-queue-head"><div><strong>{vendor.name}</strong><small>Quality {vendor.score}/{vendor.minimumScore}{vendor.checkedAt ? ` · checked ${vendor.checkedAt}` : ""}{vendor.overrideDecision ? ` · override ${vendor.overrideDecision}` : ""}</small></div><span className="status-pill">{vendor.eligible ? "Index eligible" : "Held back"}</span></div>
            <div className="workspace-queue-primary"><span>{vendor.blockingReasons.length ? vendor.blockingReasons.join(" · ") : vendor.reasons.join(" · ") || "No positive quality signals recorded"}</span></div>
            <div className="workspace-action-bar"><span>Public ID: <strong>{vendor.id}</strong></span><div className="workspace-action-buttons"><Link className="text-link" href={`/vendor/${encodeURIComponent(vendor.id)}`} target="_blank">Public dossier ↗</Link><Link className="text-link" href={`/admin/research-vendors/${encodeURIComponent(vendor.id)}`}>Source record →</Link></div></div>
          </article>)}</div>
        </div>
      </details>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Governance" title="Audit και visibility policy" note="Governance evidence παραμένει προσβάσιμο, αλλά δεν εμφανίζεται ως καθημερινή SEO ουρά." />
      <details className="seo-admin-disclosure">
        <summary><span><strong>SEO audit history</strong><small>Actor, timestamp, reason και changed keys για settings και entity overrides.</small></span><b>{data.entityAudit.length + data.settingsAudit.length} entries</b></summary>
        <div className="seo-admin-disclosure-body">
          <h3>Entity overrides</h3>
          <div className="workspace-queue-list">{data.entityAudit.length === 0 ? <div className="workspace-page-empty"><div><h3>No entity override history yet.</h3></div></div> : data.entityAudit.map((entry) => <article className="workspace-queue-card" key={entry.id}><div className="workspace-queue-head"><div><strong>{entry.reason ?? `SEO entity override ${entry.action}`}</strong><small>{entry.entityKey} · {new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(entry.createdAt))} · actor {entry.actorId}</small></div><span className="status-pill">{entry.action}</span></div><div className="workspace-queue-primary"><span>{entry.changedKeys.length ? entry.changedKeys.join(" · ") : "No normalized field difference detected"}</span></div></article>)}</div>
          <h3 className="seo-disclosure-subheading">Global settings</h3>
          <div className="workspace-queue-list">{data.settingsAudit.length === 0 ? <div className="workspace-page-empty"><div><h3>No persisted SEO settings changes yet.</h3></div></div> : data.settingsAudit.map((entry) => <article className="workspace-queue-card" key={entry.id}><div className="workspace-queue-head"><div><strong>{entry.reason ?? "SEO settings updated"}</strong><small>{new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(entry.createdAt))} · actor {entry.actorId}</small></div><span className="status-pill">{entry.actorRole ?? "admin"}</span></div><div className="workspace-queue-primary"><span>{entry.changedKeys.length ? entry.changedKeys.join(" · ") : "No normalized field difference detected"}</span></div></article>)}</div>
        </div>
      </details>
      <details className="seo-admin-disclosure">
        <summary><span><strong>Visibility policy</strong><small>Search treatment for public, noindex, authenticated and internal route families.</small></span><b>Policy</b></summary>
        <div className="seo-admin-disclosure-body"><div className="admin-domain-card-grid">
          <article className="admin-domain-card"><span>Public</span><strong>Indexable</strong><p>Pages/entities intended for organic discovery and sitemap admission.</p><b>{data.routeClassCounts.PUBLIC_INDEXABLE}</b><i>Policy families</i></article>
          <article className="admin-domain-card"><span>Public utility</span><strong>Noindex</strong><p>Human-accessible transactional/authentication surfaces without organic-search value.</p><b>{data.routeClassCounts.PUBLIC_NOINDEX}</b><i>Policy families</i></article>
          <article className="admin-domain-card"><span>Protected</span><strong>Authenticated</strong><p>Customer, vendor, staff and Admin workspaces stay authorization-protected and search-excluded.</p><b>{data.routeClassCounts.AUTHENTICATED_PRIVATE}</b><i>Policy families</i></article>
          <article className="admin-domain-card"><span>System</span><strong>Internal</strong><p>API/system routes are not search documents; approved public media is an explicit crawler exception.</p><b>{data.routeClassCounts.INTERNAL_SYSTEM}</b><i>Policy families</i></article>
        </div></div>
      </details>
    </div></section>
  </main>;
}
