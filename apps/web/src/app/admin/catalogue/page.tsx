import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import {
  WorkspaceMetricStrip,
  WorkspaceSectionHeading,
  WorkspaceStatusBadge
} from "../../../components/WorkspacePagePrimitives";
import { adminCatalogueDashboardWorkspace } from "../../../lib/admin-catalogue-dashboard-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const dynamic = "force-dynamic";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  let data;
  try {
    data = await adminCatalogueDashboardWorkspace(principal);
  } catch {
    redirect("/admin");
  }

  const { metrics } = data;
  const catalogueNeedsAttention = metrics.openExceptions > 0
    || metrics.uncategorizedProducts > 0
    || metrics.missingAttributeProducts > 0
    || metrics.crawlFailures24h > 0;

  return <main className="vendor-app admin-app admin-catalogue-overview">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalogue control centre</div>
        <h1>Κατάλογος</h1>
        <p className="lead">Μία καθαρή εικόνα της κατάστασης του catalogue και έξι χώροι εργασίας. Βαριά product data φορτώνουν μόνο όταν ανοίξεις συγκεκριμένη ουρά ή αναζήτηση.</p>
      </div>
    </section>

    <WorkspaceMetricStrip
      ariaLabel="Catalogue dashboard metrics"
      items={[
        {
          label: "Canonical products",
          value: metrics.canonicalProducts,
          hint: `${metrics.liveCanonicalProducts} live`
        },
        {
          label: "Active offers",
          value: metrics.activeOffers,
          hint: `${metrics.vendorsRepresented} vendors represented`
        },
        {
          label: "Needs organisation",
          value: metrics.uncategorizedProducts + metrics.missingAttributeProducts,
          tone: metrics.uncategorizedProducts + metrics.missingAttributeProducts > 0 ? "attention" : "positive",
          hint: `${metrics.uncategorizedProducts} without category · ${metrics.missingAttributeProducts} without attributes`
        },
        {
          label: "Exceptions",
          value: metrics.openExceptions,
          tone: metrics.openExceptions > 0 ? "attention" : "positive",
          hint: "Only conflicting strong identity evidence lands here"
        }
      ]}
    />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Six primary areas"
        title="Διαχείριση catalogue χωρίς περιττό βάρος"
        note="Το dashboard μένει aggregate-only. Individual products, supplier snapshots και detailed taxonomy φορτώνουν μόνο μέσα στα αντίστοιχα workspaces."
      />
      <div className="catalogue-workflow-grid">
        <Link className="catalogue-workflow-card" href="/admin/catalogue">
          <span>1 · Overview</span>
          <strong>Dashboard</strong>
          <p>Canonical products, offers, organisation gaps, exceptions και supplier health σε μία ελαφριά εικόνα.</p>
          <i>Current workspace</i>
        </Link>

        <Link className={`catalogue-workflow-card${metrics.crawlFailures24h > 0 ? " needs-attention" : ""}`} href="/admin/catalogue-crawler">
          <span>2 · Acquire</span>
          <strong>Crawl &amp; Import</strong>
          <p>Website crawl, supplier catalogue intake, CSV/provider imports και source health.</p>
          {metrics.crawlFailures24h > 0 && <b>{metrics.crawlFailures24h}</b>}
          <i>Open crawl &amp; import →</i>
        </Link>

        <Link className={`catalogue-workflow-card${metrics.uncategorizedProducts + metrics.missingAttributeProducts > 0 ? " needs-attention" : ""}`} href="/admin/catalogue/structure">
          <span>3 · Structure</span>
          <strong>Categories &amp; Attributes</strong>
          <p>Inspect the canonical taxonomy, Product Types, reusable attribute mappings and products still missing semantic structure.</p>
          {metrics.uncategorizedProducts + metrics.missingAttributeProducts > 0 && <b>{metrics.uncategorizedProducts + metrics.missingAttributeProducts}</b>}
          <i>Open catalogue structure →</i>
        </Link>

        <Link className="catalogue-workflow-card" href="/admin/matching">
          <span>4 · Automate</span>
          <strong>Vendor Matching</strong>
          <p>Resolve vendor submissions, reuse an exact canonical when possible and keep commercial matching separate from source identity exceptions.</p>
          <i>Open vendor matching →</i>
        </Link>

        <Link className="catalogue-workflow-card" href="/admin/catalogue-intake">
          <span>5 · Commercial ownership</span>
          <strong>Vendor Assignment</strong>
          <p>Move supplier/catalogue evidence into the correct vendor assortment and offers without duplicating canonical products.</p>
          <i>Open supplier PIM →</i>
        </Link>

        <Link className={`catalogue-workflow-card${metrics.openExceptions > 0 ? " needs-attention" : ""}`} href="/admin/catalogue/exceptions">
          <span>6 · Human fallback</span>
          <strong>Exceptions</strong>
          <p>Only ambiguous canonical identity or materially contradictory strong-identifier evidence that automation cannot safely resolve.</p>
          {metrics.openExceptions > 0 && <b>{metrics.openExceptions}</b>}
          <i>Open identity exceptions →</i>
        </Link>
      </div>
    </section>

    <section className="vendor-section section-tint">
      <div className="shell">
        <WorkspaceSectionHeading
          eyebrow="Operational health"
          title="Τι χρειάζεται προσοχή τώρα"
          note="Αυτά είναι μικρά aggregate signals. Δεν φορτώνεται κανένα πλήρες supplier catalogue σε αυτή τη σελίδα."
        />
        <div className="catalogue-attention-grid">
          <article className="workspace-queue-card">
            <div className="workspace-queue-head">
              <div>
                <strong>Supplier catalogue health</strong>
                <small>Active sources και crawl execution state.</small>
              </div>
              <WorkspaceStatusBadge
                status={metrics.crawlFailures24h > 0 ? "attention" : metrics.crawlJobsInFlight > 0 ? "processing" : "active"}
                label={metrics.crawlFailures24h > 0 ? `${metrics.crawlFailures24h} failures` : metrics.crawlJobsInFlight > 0 ? `${metrics.crawlJobsInFlight} running` : "Healthy"}
              />
            </div>
            <div className="workspace-queue-primary">
              <span><strong>{metrics.activeSources}</strong> active sources</span>
              <span><strong>{metrics.crawlJobsInFlight}</strong> crawl jobs in flight</span>
              <span><strong>{metrics.crawlFailures24h}</strong> failures / 24h</span>
            </div>
            <div className="workspace-action-bar">
              <span>Historical source snapshots stay out of the dashboard query path.</span>
              <Link className="button button-secondary" href="/admin/catalogue-crawler">Open imports</Link>
            </div>
          </article>

          <article className="workspace-queue-card">
            <div className="workspace-queue-head">
              <div>
                <strong>Automation boundary</strong>
                <small>Routine canonicalisation should be automatic; Admin handles only strong identity conflicts.</small>
              </div>
              <WorkspaceStatusBadge
                status={catalogueNeedsAttention ? "attention" : "active"}
                label={catalogueNeedsAttention ? "Action needed" : "Healthy"}
              />
            </div>
            <div className="workspace-queue-primary">
              <span><strong>{metrics.uncategorizedProducts}</strong> without category</span>
              <span><strong>{metrics.missingAttributeProducts}</strong> without attributes</span>
              <span><strong>{metrics.openExceptions}</strong> identity exceptions</span>
            </div>
            <div className="workspace-action-bar">
              <span>Exact global identifiers reuse the existing canonical; genuinely new or incomplete products become inactive drafts automatically.</span>
              <Link className="button button-primary" href="/admin/catalogue/exceptions">Review identity exceptions</Link>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Direct tools"
        title="Specialist workspaces"
        note="Τα υπάρχοντα εργαλεία παραμένουν διαθέσιμα, αλλά δεν επιβαρύνουν πλέον την αρχική φόρτωση του catalogue dashboard."
      />
      <div className="workspace-action-buttons">
        <Link className="button button-secondary" href="/admin/quickadd">Quick Add</Link>
        <Link className="button button-secondary" href="/admin/catalogue-intake/import">Files &amp; Providers</Link>
        <Link className="button button-secondary" href="/admin/categories">Categories</Link>
        <Link className="button button-secondary" href="/admin/catalogue/attribute-review">Attribute Review</Link>
      </div>
    </section>
  </main>;
}
