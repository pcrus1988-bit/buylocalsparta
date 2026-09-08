import Link from "next/link";
import { redirect } from "next/navigation";
import "../../../admin-catalogue-structure.css";
import { AdminCatalogueStructureClient } from "../../../../components/AdminCatalogueStructureClient";
import { AdminCatalogueStructureReviewClient } from "../../../../components/AdminCatalogueStructureReviewClient";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { adminCatalogueStructureWorkspace } from "../../../../lib/admin-catalogue-structure-runtime";
import {
  adminCatalogueStructureReviewSummary,
  type CatalogueStructureReviewSummary
} from "../../../../lib/admin-catalogue-structure-review-runtime";
import { getAdminSession } from "../../../../lib/admin-session";

export const dynamic = "force-dynamic";

const EMPTY_REVIEW_SUMMARY: CatalogueStructureReviewSummary = {
  currentSourceProducts: 0,
  unlinkedProducts: 0,
  unclassifiedProducts: 0,
  productsWithUnmappedAttributes: 0,
  unmappedAttributeObservations: 0,
  unmappedAttributeKeys: 0,
  reviewRequiredAttributeObservations: 0
};

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  let workspace;
  try {
    workspace = await adminCatalogueStructureWorkspace(principal);
  } catch {
    redirect("/admin/catalogue");
  }

  let reviewSummary = EMPTY_REVIEW_SUMMARY;
  try {
    reviewSummary = await adminCatalogueStructureReviewSummary(principal);
  } catch {
    // STRUCTURE must remain usable even if an intake source is temporarily unavailable.
  }

  return <main className="vendor-app admin-app admin-catalogue-structure">
    <AdminWorkspaceHeader csrfToken={workspace.csrfToken} entityLabel="STRUCTURE" />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined structure-hero">
      <div>
        <div className="eyebrow">Catalogue · taxonomy structure</div>
        <h1>STRUCTURE</h1>
        <p className="lead">Η πραγματική δομή του καταλόγου σε ένα σημείο: κατηγορία → υποκατηγορία → οποιοδήποτε βάθος, με προϊόντα, Product Types και attributes. Τα unmapped intake records εμφανίζονται πλέον πριν χαρτογραφηθούν, ώστε τίποτα να μη μένει κρυφό εκτός της δομής.</p>
      </div>
      <div className="structure-hero-actions">
        <Link className="button button-secondary" href="/admin/catalogue">Catalogue overview</Link>
        <Link className="button button-secondary" href="/admin/categories">Categories & Policies</Link>
      </div>
    </section>

    <WorkspaceMetricStrip
      ariaLabel="Catalogue structure summary"
      items={[
        { label: "Categories", value: workspace.metrics.totalCategories, hint: `${workspace.metrics.activeCategories} active` },
        { label: "Levels", value: workspace.metrics.taxonomyLevels, hint: `${workspace.metrics.rootCategories} root categories` },
        { label: "Canonical products", value: workspace.metrics.totalProducts, hint: `${workspace.metrics.liveProducts} live · ${reviewSummary.currentSourceProducts.toLocaleString("el-GR")} current intake records` },
        { label: "Governed attributes", value: workspace.metrics.configuredAttributes, hint: `${reviewSummary.unmappedAttributeObservations.toLocaleString("el-GR")} unmapped source observations` }
      ]}
    />

    <section className="shell vendor-section structure-intro">
      <WorkspaceSectionHeading
        eyebrow="Live catalogue model"
        title="Collapse, inspect, edit — and see what is still outside the tree"
        note="The normal hierarchy remains the governed canonical Sparta catalogue. The review section below exposes current source products and raw attributes before they are linked or mapped. Latest snapshots are used per source, preventing historical re-imports from being counted repeatedly."
      />
      <div className="structure-guidance">
        <span><b>Branch</b> shows every canonical product below the category, at any depth.</span>
        <span><b>Direct</b> shows canonical products assigned to that exact category.</span>
        <span><b>Unmapped</b> shows source products/attributes even before they can belong to the taxonomy tree.</span>
        <span><b>Lazy loading</b> keeps large branches and review queues responsive instead of loading everything at once.</span>
      </div>
    </section>

    <section className="shell vendor-section structure-review-section">
      <AdminCatalogueStructureReviewClient summary={reviewSummary} />
    </section>

    <section className="shell vendor-section structure-workspace">
      <AdminCatalogueStructureClient workspace={workspace} />
    </section>
  </main>;
}
