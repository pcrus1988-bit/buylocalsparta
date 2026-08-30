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

function levelLabel(depth: number): string {
  if (depth === 0) return "Κατηγορία";
  if (depth === 1) return "Υποκατηγορία";
  if (depth === 2) return "Υπο-υποκατηγορία";
  return `Επίπεδο ${depth + 1}`;
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
          Μία ενιαία εικόνα της πραγματικής δομής του καταλόγου: κατηγορίες, υποκατηγορίες,
          υπο-υποκατηγορίες και πόσα canonical προϊόντα υπάρχουν σε κάθε επίπεδο και σε ολόκληρο τον κλάδο.
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
          label: "Κατηγορίες",
          value: data.metrics.totalCategories,
          hint: `${data.metrics.activeCategories} ενεργές`
        },
        {
          label: "Επίπεδα taxonomy",
          value: data.metrics.taxonomyLevels,
          hint: `${data.metrics.rootCategories} κύριες · ${data.metrics.leafCategories} τελικές`
        },
        {
          label: "Κενές κατηγορίες",
          value: data.metrics.emptyCategories,
          tone: data.metrics.emptyCategories > 0 ? "attention" : "positive",
          hint: "Χωρίς προϊόντα σε ολόκληρο τον κλάδο"
        }
      ]}
    />

    <section className="vendor-section section-tint">
      <div className="shell">
        <WorkspaceSectionHeading
          eyebrow="Taxonomy tree"
          title="Κατηγορίες και κάλυψη προϊόντων"
          note="Τα άμεσα προϊόντα ανήκουν ακριβώς στην κατηγορία. Το σύνολο κλάδου περιλαμβάνει και όλες τις υποκατηγορίες κάτω από αυτή."
        />

        {data.categories.length === 0 ? (
          <WorkspaceEmptyState
            title="Δεν υπάρχουν κατηγορίες στον κατάλογο."
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
                    <small>{levelLabel(category.depth)} · {category.categoryCode}</small>
                  </div>
                  <WorkspaceStatusBadge
                    status={category.active ? "active" : "inactive"}
                    label={category.active ? "Ενεργή" : "Ανενεργή"}
                  />
                </div>

                <div className="workspace-queue-primary">
                  <span><strong>{category.directProducts}</strong> άμεσα προϊόντα</span>
                  <span><strong>{category.subtreeProducts}</strong> σύνολο κλάδου</span>
                  <span><strong>{category.subtreeLiveProducts}</strong> ενεργά στον κλάδο</span>
                  <span><strong>{category.childCount}</strong> άμεσες υποκατηγορίες</span>
                </div>

                <WorkspaceRecordDetails label="Δομή & λεπτομέρειες">
                  <div className="workspace-compact-list">
                    <div className="workspace-compact-row">
                      <strong>Διαδρομή</strong>
                      <span>{category.pathLabels.join(" › ")}</span>
                    </div>
                    <div className="workspace-compact-row">
                      <strong>Επίπεδο</strong>
                      <span>{levelLabel(category.depth)}</span>
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
                      <span>{category.parentCategoryCode ?? "— κύρια κατηγορία —"}</span>
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
