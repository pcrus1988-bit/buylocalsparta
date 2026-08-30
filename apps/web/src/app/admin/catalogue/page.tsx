import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import {
  WorkspaceEmptyState,
  WorkspaceMetricStrip,
  WorkspaceRecordDetails,
  WorkspaceSectionHeading,
  WorkspaceStatusBadge
} from "../../../components/WorkspacePagePrimitives";
import { adminCatalogueOverviewWorkspace } from "../../../lib/admin-catalogue-overview-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const dynamic = "force-dynamic";

function taxonomyRoleLabel(role: string): string {
  switch (role) {
    case "department": return "Τμήμα";
    case "navigation_group": return "Ομάδα πλοήγησης";
    case "category": return "Κατηγορία";
    case "subcategory": return "Υποκατηγορία";
    case "product_class": return "Κλάση προϊόντος";
    case "merchant_legacy": return "Legacy κατηγορία";
    default: return role;
  }
}

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  let data;
  try {
    data = await adminCatalogueOverviewWorkspace(principal);
  } catch {
    redirect("/admin");
  }

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalog · structure & coverage</div>
        <h1>Επισκόπηση Καταλόγου</h1>
        <p className="lead">
          Μία ενιαία εικόνα προϊόντων, taxonomy, Product Types, canonical attributes και supplier mappings.
          Η σημασία κάθε taxonomy node προέρχεται από τον πραγματικό semantic ρόλο του και όχι από το βάθος του δέντρου.
        </p>
      </div>
    </section>

    <WorkspaceMetricStrip
      ariaLabel="Σύνοψη καταλόγου"
      items={[
        {
          label: "Σύνολο προϊόντων",
          value: data.metrics.totalProducts,
          hint: `${data.metrics.liveProducts} ενεργά canonical`
        },
        {
          label: "Taxonomy nodes",
          value: data.metrics.totalCategories,
          hint: `${data.metrics.activeCategories} ενεργά`
        },
        {
          label: "Επίπεδα taxonomy",
          value: data.metrics.taxonomyLevels,
          hint: `${data.metrics.rootCategories} roots · ${data.metrics.leafCategories} leaves`
        },
        {
          label: "Κενά branches",
          value: data.metrics.emptyCategories,
          tone: data.metrics.emptyCategories > 0 ? "attention" : "positive",
          hint: "Χωρίς προϊόντα σε ολόκληρο τον κλάδο"
        }
      ]}
    />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Attributes & Product Types"
        title="Κάλυψη χαρακτηριστικών καταλόγου"
        note="Canonical attribute definitions, Product Type contracts και πραγματική πρόοδος mapping από Supplier PIM / Open Icecat προς το KONTAMOU schema."
      />
      <WorkspaceMetricStrip
        ariaLabel="Σύνοψη attributes"
        items={[
          {
            label: "Canonical attributes",
            value: data.attributes.totalAttributeDefinitions,
            hint: `${data.attributes.activeAttributeDefinitions} ενεργά`
          },
          {
            label: "Product Types",
            value: data.attributes.totalProductTypes,
            hint: `${data.attributes.activeProductTypes} ενεργά`
          },
          {
            label: "Attribute contracts",
            value: data.attributes.productTypeAttributeAssignments,
            hint: "Product Type ↔ attribute assignments"
          },
          {
            label: "Unmapped observations",
            value: data.attributes.unmappedObservations,
            tone: data.attributes.unmappedObservations > 0 ? "attention" : "positive",
            hint: `${data.attributes.semanticCoveragePct}% semantic coverage`
          }
        ]}
      />

      <div className="workspace-queue-list" style={{ marginTop: "1rem" }}>
        <article className="workspace-queue-card">
          <div className="workspace-queue-head">
            <div>
              <strong>Supplier attribute mapping health</strong>
              <small>Raw supplier evidence remains preserved; this measures semantic normalization only.</small>
            </div>
            <WorkspaceStatusBadge
              status={data.attributes.unmappedObservations > 0 ? "attention" : "active"}
              label={`${data.attributes.semanticCoveragePct}% covered`}
            />
          </div>
          <div className="workspace-queue-primary">
            <span><strong>{data.attributes.mappedObservations}</strong> mapped</span>
            <span><strong>{data.attributes.reviewRequiredObservations}</strong> value/unit review</span>
            <span><strong>{data.attributes.approvedMappingRules}</strong> approved reusable rules</span>
            <span><strong>{data.attributes.unmappedObservations}</strong> unmapped</span>
          </div>
          <div className="workspace-action-bar">
            <span>Resolve repeated source keys once inside their exact governed context.</span>
            <Link className="button button-secondary" href="/admin/catalogue-intake/attributes">Open Attribute Mapping</Link>
          </div>
        </article>

        {data.unmappedAttributes.length > 0 && <article className="workspace-queue-card">
          <div className="workspace-queue-head">
            <div>
              <strong>Μεγαλύτερες unmapped attribute ουρές</strong>
              <small>Top source/key contexts by unresolved observations.</small>
            </div>
            <span className="status-pill">Top {data.unmappedAttributes.length}</span>
          </div>
          <div className="workspace-compact-list">
            {data.unmappedAttributes.map((attribute) => <div className="workspace-compact-row" key={`${attribute.sourceName}:${attribute.sourceAttributeKey}`}>
              <strong>{attribute.sourceAttributeKey}</strong>
              <span>{attribute.sourceName} · {attribute.observationCount.toLocaleString("el-GR")} observations · {attribute.productCount.toLocaleString("el-GR")} products</span>
            </div>)}
          </div>
        </article>}
      </div>
    </section>

    <section className="vendor-section section-tint">
      <div className="shell">
        <WorkspaceSectionHeading
          eyebrow="Taxonomy tree"
          title="Taxonomy και κάλυψη προϊόντων"
          note="Τα άμεσα προϊόντα ανήκουν ακριβώς στο συγκεκριμένο assignable node. Το σύνολο κλάδου περιλαμβάνει και όλα τα παιδιά κάτω από αυτό."
        />

        {data.categories.length === 0 ? (
          <WorkspaceEmptyState
            title="Δεν υπάρχουν taxonomy nodes στον κατάλογο."
            body="Μόλις δημιουργηθεί taxonomy ή εισαχθούν canonical προϊόντα, η δομή θα εμφανιστεί εδώ."
          />
        ) : (
          <div className="workspace-queue-list">
            {data.categories.map((category) => (
              <article
                className="workspace-queue-card"
                key={category.categoryCode}
                style={{ marginLeft: `${Math.min(category.depth, 5) * 18}px` }}
              >
                <div className="workspace-queue-head">
                  <div>
                    <strong>{category.labelEl}</strong>
                    <small>{taxonomyRoleLabel(category.taxonomyRole)} · {category.categoryCode}</small>
                  </div>
                  <WorkspaceStatusBadge
                    status={category.active ? "active" : "inactive"}
                    label={category.active ? "Ενεργό" : "Ανενεργό"}
                  />
                </div>

                <div className="workspace-queue-primary">
                  <span><strong>{category.directProducts}</strong> άμεσα προϊόντα</span>
                  <span><strong>{category.subtreeProducts}</strong> σύνολο κλάδου</span>
                  <span><strong>{category.subtreeLiveProducts}</strong> ενεργά στον κλάδο</span>
                  <span><strong>{category.childCount}</strong> άμεσα παιδιά</span>
                </div>

                <WorkspaceRecordDetails label="Δομή & λεπτομέρειες">
                  <div className="workspace-compact-list">
                    <div className="workspace-compact-row">
                      <strong>Διαδρομή</strong>
                      <span>{category.pathLabels.join(" › ")}</span>
                    </div>
                    <div className="workspace-compact-row">
                      <strong>Semantic role</strong>
                      <span>{taxonomyRoleLabel(category.taxonomyRole)} · {category.taxonomyRole}</span>
                    </div>
                    <div className="workspace-compact-row">
                      <strong>Tree depth</strong>
                      <span>{category.depth}</span>
                    </div>
                    <div className="workspace-compact-row">
                      <strong>Assignable / discoverable</strong>
                      <span>{category.assignable ? "Assignable" : "Navigation only"} · {category.discoverable ? "Discoverable" : "Hidden from browse"}</span>
                    </div>
                    <div className="workspace-compact-row">
                      <strong>Category code</strong>
                      <span>{category.categoryCode}</span>
                    </div>
                    <div className="workspace-compact-row">
                      <strong>Άμεσα ενεργά προϊόντα</strong>
                      <span>{category.directLiveProducts}</span>
                    </div>
                    <div className="workspace-compact-row">
                      <strong>Parent</strong>
                      <span>{category.parentCategoryCode ?? "— root —"}</span>
                    </div>
                  </div>
                </WorkspaceRecordDetails>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  </main>;
}
