import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminSeoSettingsEditor } from "../../../components/AdminSeoSettingsEditor";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { publicOrigin } from "../../../lib/public-origin";
import { getSeoDiagnosticReportsSnapshot } from "../../../lib/seo-diagnostic-reports";
import { getSeoGlobalSettingsSnapshot } from "../../../lib/seo-settings";

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

  // Scale-safe contract: this overview does not scan πλέον όλο το catalogue at render time.
  const [settingsSnapshot, reports] = await Promise.all([
    getSeoGlobalSettingsSnapshot(),
    getSeoDiagnosticReportsSnapshot()
  ]);

  const latest = reports.reports[0];
  const metrics = latest?.metrics;
  const diagnostics = latest?.diagnostics ?? [];
  const critical = diagnostics.filter((item) => item.severity === "critical").length;
  const warnings = diagnostics.filter((item) => item.severity === "warning").length;
  const actionableDiagnostics = diagnostics.filter((item) => item.severity === "critical" || item.severity === "warning");
  const canEdit = hasAdminPermission(principal, "content.write");
  const origin = settingsSnapshot.settings.canonicalOrigin || latest?.origin || publicOrigin();
  const generatedAt = latest?.sourceGeneratedAt ?? reports.updatedAt;
  const blockedProducts = metrics ? Math.max(0, metrics.products - metrics.productIndexEligible) : undefined;
  const blockedResearch = metrics ? Math.max(0, metrics.research - metrics.researchIndexEligible) : undefined;

  return <main className="vendor-app admin-app admin-seo-overview">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">SEO & Visibility</div>
        <h1>Search visibility</h1>
        <p className="lead">Scale-safe SEO overview για το ΚΟΝΤΑ ΜΟΥ. Η σελίδα ανοίγει από lightweight configuration και το τελευταίο αποθηκευμένο SEO baseline, χωρίς να εκτελεί catalogue-wide enrichment δεκάδων χιλιάδων προϊόντων σε κάθε page view.</p>
      </div>
      <aside className={critical ? "dashboard-health-card needs-attention" : "dashboard-health-card"}>
        <span>Latest SEO baseline</span>
        <strong>{!latest ? "No saved baseline" : critical ? `${critical} critical` : warnings ? `${warnings} warnings` : "Healthy"}</strong>
        <p>{generatedAt ? new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(generatedAt)) : "Run/save a report when a fresh full audit is required."}</p>
      </aside>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Indexable products", value: metrics?.productIndexEligible ?? "—", tone: blockedProducts ? "attention" : metrics ? "positive" : undefined, hint: blockedProducts === undefined ? "latest saved baseline unavailable" : `${blockedProducts} held back in saved baseline` },
      { label: "Indexable research vendors", value: metrics?.researchIndexEligible ?? "—", tone: blockedResearch ? "attention" : metrics ? "positive" : undefined, hint: blockedResearch === undefined ? "latest saved baseline unavailable" : `${blockedResearch} held back in saved baseline` },
      { label: "Estimated sitemap URLs", value: metrics?.sitemapEstimatedCount ?? "—", tone: settingsSnapshot.settings.indexingEnabled ? "positive" : "attention", hint: settingsSnapshot.settings.indexingEnabled ? "global indexing enabled" : "global indexing disabled" },
      { label: "Saved SEO baselines", value: reports.reports.length, hint: latest ? `latest ${new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeZone: "Europe/Athens" }).format(new Date(latest.createdAt))}` : "none saved yet" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Incident protection" title="Το SEO overview δεν σαρώνει πλέον όλο το catalogue κατά το άνοιγμα" note="Με catalogue δεκάδων χιλιάδων προϊόντων, full enrichment, offer checks και media projection πρέπει να εκτελούνται ως deliberate audit/report workflow — όχι ως blocking page-render dependency." />
      <div className="workspace-page-empty">
        <div>
          <div className="eyebrow">Scale-safe mode</div>
          <h3>Το Admin / SEO παραμένει άμεσα προσβάσιμο ακόμη και όταν το product catalogue μεγαλώνει.</h3>
          <p>Τα operational links, οι global SEO ρυθμίσεις και το τελευταίο αποθηκευμένο baseline φορτώνουν χωρίς catalogue-wide product scan. Για fresh evidence χρησιμοποίησε Reports, Pages, Crawl ή Production signals.</p>
        </div>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Action centre" title="Τι χρειάζεται προσοχή" note="Τα diagnostics παρακάτω προέρχονται από το τελευταίο αποθηκευμένο SEO baseline ώστε το overview να μην μπλοκάρει τη βάση δεδομένων." />
      {!latest
        ? <div className="workspace-page-empty"><div><div className="eyebrow">No baseline</div><h3>Δεν υπάρχει ακόμη αποθηκευμένο SEO report.</h3><p>Άνοιξε Reports για να δημιουργήσεις governed baseline όταν χρειάζεται πλήρης αξιολόγηση.</p></div></div>
        : actionableDiagnostics.length === 0
          ? <div className="workspace-page-empty"><div><div className="eyebrow">Healthy</div><h3>Δεν υπάρχει actionable diagnostic στο τελευταίο baseline.</h3><p>Συνέχισε με Search Console για Google performance και coverage.</p></div></div>
          : <div className="workspace-queue-list seo-overview-attention">{actionableDiagnostics.slice(0, 8).map((item) => <article className="workspace-queue-card" key={item.id}>
            <div className="workspace-queue-head">
              <div><strong>{item.title}</strong><small>{item.detail}</small></div>
              <span className="status-pill">{severityLabel(item.severity)}{typeof item.count === "number" ? ` · ${item.count}` : ""}</span>
            </div>
          </article>)}</div>}
      {actionableDiagnostics.length > 8 && <p className="seo-overview-more">Showing 8 of {actionableDiagnostics.length} actionable diagnostics from the saved baseline.</p>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Workflow" title="Άνοιξε το σωστό SEO workspace" note="Τα βαριά audits παραμένουν σε dedicated workflows αντί να εκτελούνται αυτόματα στο overview." />
      <div className="seo-workflow-grid">
        <Link className="seo-workflow-card" href="/admin/seo/pages"><span>Inventory</span><strong>Pages</strong><p>Governed URLs, index policy, sitemap state και latest crawl evidence.</p><b>{metrics?.sitemapEstimatedCount ?? "—"}</b><i>URLs</i></Link>
        <Link className={`seo-workflow-card${critical || warnings ? " needs-attention" : ""}`} href="/admin/seo/issues"><span>Remediation</span><strong>Issues</strong><p>URL-level findings, fix guidance, rechecks και durable issue history.</p><b>{latest ? critical + warnings : "—"}</b><i>diagnostics</i></Link>
        <Link className="seo-workflow-card" href="/admin/seo/crawl"><span>Technical SEO</span><strong>Crawl</strong><p>Internal linking, orphans, live HTTP verification και crawl history.</p><b>HTTP</b><i>evidence</i></Link>
        <Link className="seo-workflow-card" href="/admin/seo/sitemaps"><span>Discovery</span><strong>Sitemaps</strong><p>Production sitemap snapshots, changes και registry reconciliation.</p><b>XML</b><i>production</i></Link>
        <Link className="seo-workflow-card" href="/admin/seo/search-console"><span>Google</span><strong>Search Console</strong><p>Performance, queries, pages, sitemap submission και URL Inspection.</p><b>GSC</b><i>Google evidence</i></Link>
        <Link className="seo-workflow-card" href="/admin/seo/schema"><span>Structured data</span><strong>Schema</strong><p>Expected versus observed JSON-LD για products και vendor dossiers.</p><b>JSON-LD</b><i>validation</i></Link>
        <Link className="seo-workflow-card" href="/admin/seo/reports"><span>Full audit</span><strong>Reports</strong><p>Governed full-catalogue evidence, freshness, regressions και saved baselines.</p><b>{reports.reports.length}</b><i>saved baselines</i></Link>
        <Link className="seo-workflow-card" href="/admin/seo/production"><span>Automation</span><strong>Production signals</strong><p>Automated GSC/GA4 history, crawl health και Merchant Center feed.</p><b>Live</b><i>provider state</i></Link>
      </div>
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Saved index inventory" title="Τελευταίο governed SEO baseline" note="Οι αριθμοί είναι snapshot evidence και όχι blocking live scan του catalogue." />
      <div className="admin-domain-card-grid seo-inventory-grid">
        <article className="admin-domain-card"><span>Static</span><strong>Public pages</strong><p>Curated public routes intended for discovery.</p><b>{metrics?.staticIndexable ?? "—"}</b><i>Indexable</i></article>
        <article className="admin-domain-card"><span>Taxonomy</span><strong>Categories</strong><p>Curated category landing pages in the public crawl graph.</p><b>{metrics?.categories ?? "—"}</b><i>Indexable</i></article>
        <article className="admin-domain-card"><span>Commerce</span><strong>Canonical products</strong><p>{metrics ? `${metrics.products} products · ${blockedProducts ?? 0} held by the saved baseline gates.` : "No saved product baseline yet."}</p><b>{metrics?.productIndexEligible ?? "—"}</b><i>Sitemap eligible</i></article>
        <article className="admin-domain-card"><span>Local SEO</span><strong>Vendor dossiers</strong><p>{metrics ? `${metrics.partners} partners + ${metrics.research} research businesses in the saved baseline.` : "No saved vendor baseline yet."}</p><b>{metrics?.vendorIndexEligible ?? "—"}</b><i>Sitemap eligible</i></article>
      </div>
      <div className="workspace-action-bar seo-public-endpoints">
        <span>Public origin: <code>{origin}</code></span>
        <div className="workspace-action-buttons"><a className="button button-secondary" href={`${origin}/sitemap.xml`} target="_blank" rel="noreferrer">Sitemap ↗</a><a className="button button-secondary" href={`${origin}/robots.txt`} target="_blank" rel="noreferrer">robots.txt ↗</a></div>
      </div>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Configuration" title="Global SEO settings" note="Lightweight configuration παραμένει διαθέσιμο απευθείας στο overview. Product/entity-level investigation γίνεται από τα dedicated SEO workspaces." />
      <details className="seo-admin-disclosure">
        <summary><span><strong>Global SEO settings</strong><small>Canonical origin, metadata defaults, indexing switch και Google verification metadata.</small></span><b>Configure</b></summary>
        <div className="seo-admin-disclosure-body">{canEdit
          ? <AdminSeoSettingsEditor key={settingsSnapshot.version} snapshot={settingsSnapshot} csrfToken={principal.csrfToken} />
          : <div className="workspace-page-empty"><div><h3>Read-only SEO access.</h3><p>content.write permission is required to change search settings.</p></div></div>}</div>
      </details>
      <div className="workspace-action-bar">
        <span>Need entity-level metadata/index controls?</span>
        <div className="workspace-action-buttons"><Link className="button button-secondary" href="/admin/seo/pages">Open Pages</Link><Link className="button button-secondary" href="/admin/seo/issues">Open Issues</Link></div>
      </div>
    </div></section>
  </main>;
}
