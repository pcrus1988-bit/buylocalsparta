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

function levelLabel(depth: number): string {
  if (depth === 0) return "Κατηγορία";
  if (depth === 1) return "Υποκατηγορία";
  if (depth === 2) return "Υπο-υποκατηγορία";
  return `Επίπεδο ${depth + 1}`;
}

function ratio(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 1000) / 10}%`;
}

const healthLinks = [
  { href: "/admin/catalogue-intake", title: "Supplier PIM Intake", body: "Προβολή source products, snapshots, taxonomy και provenance." },
  { href: "/admin/catalogue-intake/attributes", title: "Attribute Mapping", body: "Διαχείριση unmapped και review-required source attributes." },
  { href: "/admin/catalogue-intake/values", title: "Controlled Values", body: "Έλεγχος enum values που χρειάζονται governed canonical aliases." }
] as const;

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  let data;
  try {
    data = await adminCatalogueOverviewWorkspace(principal);
  } catch {
    redirect("/admin");
  }

  const health = data.health;
  const icecatCompletion = ratio(health.icecatGreekReadySourceProducts, health.icecatSourceProducts);
  const attributeMapping = ratio(health.mappedAttributeObservations, health.attributeObservations);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalog · structure & coverage</div>
        <h1>Επισκόπηση Καταλόγου</h1>
        <p className="lead">
          Μία ενιαία εικόνα της πραγματικής δομής του καταλόγου: κατηγορίες, υποκατηγορίες,
          υπο-υποκατηγορίες, canonical προϊόντα και η υγεία των Supplier PIM / Open Icecat δεδομένων.
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

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Catalogue health"
        title="Supplier PIM, Icecat & attribute health"
        note="Read-only εικόνα των source δεδομένων. Τα source products, Icecat enrichments και attribute mappings παραμένουν evidence μέχρι να περάσουν τα υπάρχοντα canonical και publication gates."
      />

      {health.available ? <>
        <WorkspaceMetricStrip
          ariaLabel="Υγεία Supplier PIM και Icecat"
          items={[
            {
              label: "Source products",
              value: health.sourceProducts,
              hint: `${health.unlinkedSourceProducts} χωρίς approved canonical link`,
              tone: health.unlinkedSourceProducts > 0 ? "attention" : "positive"
            },
            {
              label: "Open Icecat",
              value: health.icecatSourceProducts,
              hint: `${health.icecatGreekReadySourceProducts} EL-ready · ${icecatCompletion}`
            },
            {
              label: "Attribute evidence",
              value: health.attributeObservations,
              hint: `${health.mappedAttributeObservations} mapped · ${attributeMapping}`
            },
            {
              label: "Unmapped attributes",
              value: health.unmappedAttributeObservations,
              hint: `${health.reviewRequiredAttributeObservations} επιπλέον review required`,
              tone: health.unmappedAttributeObservations > 0 || health.reviewRequiredAttributeObservations > 0 ? "attention" : "positive"
            },
            {
              label: "Icecat queue",
              value: health.icecatQueued,
              hint: `${health.icecatReady} ready · ${health.icecatNeedsEnrichment} enrichment · ${health.icecatFailed} failed`,
              tone: health.icecatFailed > 0 ? "attention" : "default"
            }
          ]}
        />

        <div className="workspace-queue-list" style={{ marginTop: "1rem" }}>
          {healthLinks.map((item) => <Link
            href={item.href}
            key={item.href}
            className="workspace-queue-card"
            style={{ display: "block", textDecoration: "none", color: "inherit" }}
          >
            <div className="workspace-queue-head">
              <div>
                <strong>{item.title}</strong>
                <small>{item.body}</small>
              </div>
              <span aria-hidden="true">→</span>
            </div>
          </Link>)}
        </div>
      </> : <div className="workspace-queue-card">
        <strong>Source-health projection unavailable in this runtime</strong>
        <p>
          Η taxonomy και τα canonical totals παραμένουν διαθέσιμα. Τα Supplier PIM / Icecat / attribute-health metrics
          εμφανίζονται όταν το Admin λειτουργεί πάνω στο PostgreSQL production runtime.
        </p>
      </div>}
    </section>

    <section className="vendor-section section-tint">
      <div className="shell">
        <WorkspaceSectionHeading
          eyebrow="Taxonomy tree"
          title="Κατηγορίες και κάλυψη προϊόντων"
          note="Τα άμεσα προϊόντα ανήκουν ακριβώς στην κατηγορία. Το σύνολο κλάδου περιλαμβάνει και όλες τις υποκατηγορίες κάτω από αυτή. Τα health counts ακολουθούν την ίδια λογική subtree."
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
                  {health.available && category.subtreeIcecatLinkedProducts > 0
                    ? <span><strong>{category.subtreeIcecatGreekReadyProducts}/{category.subtreeIcecatLinkedProducts}</strong> Icecat EL-ready</span>
                    : null}
                  {health.available && (category.subtreeUnmappedAttributeObservations > 0 || category.subtreeReviewRequiredAttributeObservations > 0)
                    ? <span><strong>{category.subtreeUnmappedAttributeObservations}</strong> unmapped · <strong>{category.subtreeReviewRequiredAttributeObservations}</strong> review</span>
                    : null}
                </div>

                <WorkspaceRecordDetails label="Δομή, προϊόντα & health">
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
                    {health.available ? <>
                      <div className="workspace-compact-row">
                        <strong>Icecat · άμεσα / κλάδος</strong>
                        <span>
                          {category.directIcecatGreekReadyProducts}/{category.directIcecatLinkedProducts} EL-ready · {category.subtreeIcecatGreekReadyProducts}/{category.subtreeIcecatLinkedProducts} στον κλάδο
                        </span>
                      </div>
                      <div className="workspace-compact-row">
                        <strong>Attributes · άμεσα</strong>
                        <span>
                          {category.directMappedAttributeObservations} mapped · {category.directUnmappedAttributeObservations} unmapped · {category.directReviewRequiredAttributeObservations} review
                        </span>
                      </div>
                      <div className="workspace-compact-row">
                        <strong>Attributes · κλάδος</strong>
                        <span>
                          {category.subtreeMappedAttributeObservations} mapped · {category.subtreeUnmappedAttributeObservations} unmapped · {category.subtreeReviewRequiredAttributeObservations} review
                        </span>
                      </div>
                    </> : null}
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
