import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminCatalogueStructureClient } from "../../../../components/AdminCatalogueStructureClient";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { adminCatalogueStructureWorkspace } from "../../../../lib/admin-catalogue-structure-runtime";
import { getAdminSession } from "../../../../lib/admin-session";

export const dynamic = "force-dynamic";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  let workspace;
  try {
    workspace = await adminCatalogueStructureWorkspace(principal);
  } catch {
    redirect("/admin/catalogue");
  }

  return <main className="vendor-app admin-app admin-catalogue-structure">
    <AdminWorkspaceHeader csrfToken={workspace.csrfToken} entityLabel="STRUCTURE" />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined structure-hero">
      <div>
        <div className="eyebrow">Catalogue · taxonomy structure</div>
        <h1>STRUCTURE</h1>
        <p className="lead">Η πραγματική δομή του καταλόγου σε ένα σημείο: κατηγορία → υποκατηγορία → οποιοδήποτε βάθος, με προϊόντα, Product Types και attributes. Άνοιξε μόνο το branch που χρειάζεσαι και επεξεργάσου category ή attribute επιτόπου.</p>
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
        { label: "Products", value: workspace.metrics.totalProducts, hint: `${workspace.metrics.liveProducts} live canonical` },
        { label: "Attributes", value: workspace.metrics.configuredAttributes, hint: "active governed definitions" }
      ]}
    />

    <section className="shell vendor-section structure-intro">
      <WorkspaceSectionHeading
        eyebrow="Live catalogue model"
        title="Collapse, inspect, edit"
        note="Counts are calculated from the canonical Sparta catalogue. Category and attribute edits write to the same production records used by catalogue, browse and product governance; stable codes remain locked so references cannot be broken accidentally."
      />
      <div className="structure-guidance">
        <span><b>Branch</b> shows every product below the category, at any depth.</span>
        <span><b>Direct</b> shows products assigned to that exact category.</span>
        <span><b>Attributes</b> combines category rules, Product Type contracts and values actually present on products.</span>
        <span><b>Lazy loading</b> keeps large branches responsive instead of loading the whole catalogue at once.</span>
      </div>
    </section>

    <section className="shell vendor-section structure-workspace">
      <AdminCatalogueStructureClient workspace={workspace} />
    </section>
  </main>;
}
