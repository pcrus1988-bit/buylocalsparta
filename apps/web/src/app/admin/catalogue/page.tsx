import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import {
  WorkspaceEmptyState,
  WorkspaceMetricStrip,
  WorkspaceRecordDetails,
  WorkspaceSectionHeading,
  WorkspaceStatusBadge
} from "../../../components/WorkspacePagePrimitives";
import {
  adminCatalogueOverviewWorkspace,
  type OpenIcecatAdminHealth
} from "../../../lib/admin-catalogue-overview-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const dynamic = "force-dynamic";

function levelLabel(depth: number): string {
  if (depth === 0) return "Κατηγορία";
  if (depth === 1) return "Υποκατηγορία";
  if (depth === 2) return "Υπο-υποκατηγορία";
  return `Επίπεδο ${depth + 1}`;
}

function ageLabel(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds} δευτ.`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} λεπ.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ώρ.`;
  return `${Math.floor(hours / 24)} ημ.`;
}

function OpenIcecatHealthPanel({ health }: Readonly<{ health: OpenIcecatAdminHealth }>) {
  if (health.state !== "available") {
    const notConfigured = health.state === "not_configured";
    return <section className="vendor-section">
      <div className="shell">
        <WorkspaceSectionHeading
          eyebrow="Open Icecat · source enrichment"
          title="Υγεία εμπλουτισμού καταλόγου"
          note="Read-only παρακολούθηση της πηγής Icecat. Δεν αλλάζει canonical προϊόντα, offers, τιμές, stock ή publication state."
        />
        <WorkspaceEmptyState
          eyebrow={notConfigured ? "Δεν έχει ρυθμιστεί" : "Προσωρινά μη διαθέσιμο"}
          title={notConfigured
            ? "Δεν υπάρχει ενεργή Open Icecat πηγή για τη Σπάρτη."
            : "Τα Icecat operational metrics δεν είναι διαθέσιμα αυτή τη στιγμή."}
          body={notConfigured
            ? "Η επισκόπηση θα ενεργοποιηθεί αυτόματα μόλις υπάρχει ενεργή catalog source."
            : "Η υπόλοιπη διαχείριση καταλόγου παραμένει διαθέσιμη. Δεν εμφανίζονται provider credentials, raw payloads ή database errors στο Admin."}
        />
      </div>
    </section>;
  }

  const status = health.queue.failed > 0
    ? { status: "failed", label: `${health.queue.failed} αποτυχίες`, tone: "danger" as const }
    : health.queue.retry > 0
      ? { status: "retry", label: `${health.queue.retry} retries`, tone: "attention" as const }
      : health.actionableBacklog > 0
        ? { status: "processing", label: "Σε εξέλιξη", tone: "attention" as const }
        : { status: "active", label: "Σταθερό", tone: "positive" as const };

  return <section className="vendor-section">
    <div className="shell">
      <WorkspaceSectionHeading
        eyebrow="Open Icecat · source enrichment"
        title="Υγεία εμπλουτισμού καταλόγου"
        note="Το Ready εδώ σημαίνει ότι υπάρχει ελληνικό Icecat source evidence που περνά το quality gate. Δεν σημαίνει ότι το προϊόν εγκρίθηκε ή δημοσιεύτηκε ως canonical."
      />

      <WorkspaceMetricStrip
        ariaLabel="Open Icecat enrichment metrics"
        items={[
          {
            label: "Icecat index",
            value: health.activeIndexProducts,
            hint: `${health.queueableProducts} με GTIN · ${health.missingGtinPct}% χωρίς GTIN`
          },
          {
            label: "Detail coverage",
            value: `${health.detailCoveragePct}%`,
            hint: `${health.detailProcessed} προϊόντα με detail evidence`
          },
          {
            label: "Greek-ready evidence",
            value: `${health.readyCoveragePct}%`,
            tone: health.readyCoveragePct >= 90 ? "positive" : "default",
            hint: `${health.queue.ready} Ready · ${health.queue.needsEnrichment} needs enrichment`
          },
          {
            label: "Actionable backlog",
            value: health.actionableBacklog,
            tone: health.queue.failed > 0 || health.queue.retry > 0 ? "attention" : "default",
            hint: `${health.completedLastHour} ολοκληρώθηκαν την τελευταία ώρα`
          }
        ]}
      />

      <div className="workspace-queue-list">
        <article className="workspace-queue-card">
          <div className="workspace-queue-head">
            <div>
              <strong>Detail enrichment queue</strong>
              <small>Processing version · {health.processingVersion}</small>
            </div>
            <WorkspaceStatusBadge status={status.status} label={status.label} tone={status.tone} />
          </div>

          <div className="workspace-queue-primary">
            <span><strong>{health.queue.pending}</strong> pending</span>
            <span><strong>{health.queue.processing}</strong> processing</span>
            <span><strong>{health.queue.retry}</strong> retry</span>
            <span><strong>{health.queue.ready}</strong> ready</span>
            <span><strong>{health.queue.needsEnrichment}</strong> needs enrichment</span>
            <span><strong>{health.queue.failed}</strong> failed</span>
            <span><strong>{health.queue.skipped}</strong> skipped</span>
          </div>

          <WorkspaceRecordDetails label="Operational details">
            <div className="workspace-compact-list">
              <div className="workspace-compact-row">
                <strong>Ενεργά index προϊόντα</strong>
                <span>{health.activeIndexProducts}</span>
              </div>
              <div className="workspace-compact-row">
                <strong>Queueable με GTIN</strong>
                <span>{health.queueableProducts}</span>
              </div>
              <div className="workspace-compact-row">
                <strong>Χωρίς GTIN</strong>
                <span>{health.missingGtin} · {health.missingGtinPct}%</span>
              </div>
              <div className="workspace-compact-row">
                <strong>Παλιότερη actionable εργασία</strong>
                <span>{ageLabel(health.oldestActionableAgeSeconds)}</span>
              </div>
              <div className="workspace-compact-row">
                <strong>Ολοκληρώσεις τελευταίας ώρας</strong>
                <span>{health.completedLastHour}</span>
              </div>
              <div className="workspace-compact-row">
                <strong>Governance boundary</strong>
                <span>Source evidence only · no canonical publication or commerce mutation</span>
              </div>
            </div>
          </WorkspaceRecordDetails>
        </article>
      </div>
    </div>
  </section>;
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

    <OpenIcecatHealthPanel health={data.openIcecat} />

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
