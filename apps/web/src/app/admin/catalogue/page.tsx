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
import { adminOpenIcecatHealth, type OpenIcecatAdminHealth } from "../../../lib/admin-open-icecat-health";
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
          { label: "Icecat index", value: health.activeIndexProducts, hint: `${health.queueableProducts} με GTIN · ${health.missingGtinPct}% χωρίς GTIN` },
          { label: "Detail coverage", value: `${health.detailCoveragePct}%`, hint: `${health.detailProcessed} προϊόντα με detail evidence` },
          { label: "Greek-ready evidence", value: `${health.readyCoveragePct}%`, tone: health.readyCoveragePct >= 90 ? "positive" : "default", hint: `${health.queue.ready} Ready · ${health.queue.needsEnrichment} needs enrichment` },
          { label: "Actionable backlog", value: health.actionableBacklog, tone: health.queue.failed > 0 || health.queue.retry > 0 ? "attention" : "default", hint: `${health.completedLastHour} ολοκληρώθηκαν την τελευταία ώρα` }
        ]}
      />
      <div className="workspace-queue-list">
        <article className="workspace-queue-card">
          <div className="workspace-queue-head">
            <div><strong>Detail enrichment queue</strong><small>Processing version · {health.processingVersion}</small></div>
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
              <div className="workspace-compact-row"><strong>Ενεργά index προϊόντα</strong><span>{health.activeIndexProducts}</span></div>
              <div className="workspace-compact-row"><strong>Queueable με GTIN</strong><span>{health.queueableProducts}</span></div>
              <div className="workspace-compact-row"><strong>Χωρίς GTIN</strong><span>{health.missingGtin} · {health.missingGtinPct}%</span></div>
              <div className="workspace-compact-row"><strong>Παλιότερη actionable εργασία</strong><span>{ageLabel(health.oldestActionableAgeSeconds)}</span></div>
              <div className="workspace-compact-row"><strong>Ολοκληρώσεις τελευταίας ώρας</strong><span>{health.completedLastHour}</span></div>
              <div className="workspace-compact-row"><strong>Governance boundary</strong><span>Source evidence only · no canonical publication or commerce mutation</span></div>
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
  const openIcecat = await adminOpenIcecatHealth(principal);

  return <main className="vendor-app admin-app admin-catalogue-overview">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalogue operations</div>
        <h1>Κατάλογος</h1>
        <p className="lead">Acquire → Normalize → Match → Govern. Η επισκόπηση δείχνει τι χρειάζεται προσοχή και σε στέλνει στο σωστό operational workspace χωρίς να επαναλαμβάνει τις ίδιες ουρές.</p>
      </div>
    </section>

    <WorkspaceMetricStrip
      ariaLabel="Catalogue health"
      items={[
        { label: "Products", value: data.metrics.totalProducts, hint: `${data.metrics.liveProducts} active canonical` },
        { label: "Taxonomy", value: data.metrics.totalCategories, hint: `${data.metrics.activeCategories} active nodes` },
        { label: "Semantic coverage", value: `${data.attributes.semanticCoveragePct}%`, tone: data.attributes.unmappedObservations > 0 ? "attention" : "positive", hint: `${data.attributes.unmappedObservations.toLocaleString("el-GR")} unmapped observations` },
        { label: "Empty branches", value: data.metrics.emptyCategories, tone: data.metrics.emptyCategories > 0 ? "attention" : "positive", hint: "No products in the whole branch" }
      ]}
    />

    <OpenIcecatHealthPanel health={openIcecat} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Operator workflow"
        title="Πήγαινε κατευθείαν στη σωστή εργασία"
        note="Κάθε εργαλείο έχει μία σαφή ευθύνη. Source evidence δεν δημοσιεύεται, matching δεν εισάγει source data και taxonomy governance δεν γίνεται μέσα στις review queues."
      />
      <div className="catalogue-workflow-grid">
        <Link className="catalogue-workflow-card" href="/admin/quickadd"><span>Acquire · one product</span><strong>Quick Add</strong><p>Barcode/search → reuse canonical or create safely → assign vendor offer and stock.</p><i>Open workbench →</i></Link>
        <Link className="catalogue-workflow-card" href="/admin/catalogue-crawler"><span>Acquire · website</span><strong>Website Import</strong><p>Crawl one page or a full online shop and promote extracted evidence into Supplier PIM.</p><i>Open website import →</i></Link>
        <Link className="catalogue-workflow-card" href="/admin/catalogue-intake/import"><span>Acquire · files & providers</span><strong>Files & Icecat</strong><p>Supplier CSV/TSV, trusted adapters and Open Icecat staging/enrichment status.</p><i>Open source import →</i></Link>
        <Link className="catalogue-workflow-card" href="/admin/catalogue-intake"><span>Normalize · source evidence</span><strong>Supplier PIM</strong><p>Immutable snapshots, price/classification review, source evidence and vendor assortment hand-off.</p><i>Open PIM review →</i></Link>
        <Link className={`catalogue-workflow-card${data.attributes.unmappedObservations > 0 ? " needs-attention" : ""}`} href="/admin/catalogue-intake/attributes"><span>Normalize · attributes</span><strong>Attributes</strong><p>Resolve repeated supplier attribute meanings once per governed source context.</p><b>{data.attributes.unmappedObservations.toLocaleString("el-GR")}</b><i>unmapped observations →</i></Link>
        <Link className="catalogue-workflow-card" href="/admin/matching"><span>Resolve identity</span><strong>Product Matching</strong><p>Approve canonical candidates, reject false matches or create a genuinely new canonical.</p><i>Open matching queue →</i></Link>
        <Link className={`catalogue-workflow-card${data.metrics.emptyCategories > 0 ? " needs-attention" : ""}`} href="/admin/categories"><span>Govern structure</span><strong>Categories & Policies</strong><p>Commerce policies and category-level operating rules. Taxonomy health remains visible below.</p><b>{data.metrics.emptyCategories}</b><i>empty branches →</i></Link>
      </div>
    </section>

    <section className="vendor-section section-tint">
      <div className="shell">
        <WorkspaceSectionHeading eyebrow="Attention" title="Τι χρειάζεται δουλειά τώρα" note="Health signals only. The actual decisions stay in their dedicated operational queues." />
        <div className="catalogue-attention-grid">
          <article className="workspace-queue-card">
            <div className="workspace-queue-head">
              <div><strong>Supplier attribute normalization</strong><small>Raw supplier evidence remains preserved; this measures semantic mapping only.</small></div>
              <WorkspaceStatusBadge status={data.attributes.unmappedObservations > 0 ? "attention" : "active"} label={`${data.attributes.semanticCoveragePct}% covered`} />
            </div>
            <div className="workspace-queue-primary">
              <span><strong>{data.attributes.mappedObservations}</strong> mapped</span>
              <span><strong>{data.attributes.reviewRequiredObservations}</strong> value/unit review</span>
              <span><strong>{data.attributes.approvedMappingRules}</strong> reusable rules</span>
              <span><strong>{data.attributes.unmappedObservations}</strong> unmapped</span>
            </div>
            {data.unmappedAttributes.length > 0 && <WorkspaceRecordDetails label={`Top unresolved contexts · ${data.unmappedAttributes.length}`}><div className="workspace-compact-list">{data.unmappedAttributes.map((attribute) => <div className="workspace-compact-row" key={`${attribute.sourceName}:${attribute.sourceAttributeKey}`}><strong>{attribute.sourceAttributeKey}</strong><span>{attribute.sourceName} · {attribute.observationCount.toLocaleString("el-GR")} observations · {attribute.productCount.toLocaleString("el-GR")} products</span></div>)}</div></WorkspaceRecordDetails>}
            <div className="workspace-action-bar"><span>Resolve repeated source keys once in their governed context.</span><Link className="button button-secondary" href="/admin/catalogue-intake/attributes">Open Attributes</Link></div>
          </article>

          <article className="workspace-queue-card">
            <div className="workspace-queue-head">
              <div><strong>Taxonomy health</strong><small>Structure, assignability and product coverage without turning the overview into a second policy editor.</small></div>
              <WorkspaceStatusBadge status={data.metrics.emptyCategories > 0 ? "attention" : "active"} label={data.metrics.emptyCategories > 0 ? `${data.metrics.emptyCategories} empty branches` : "Healthy"} />
            </div>
            <div className="workspace-queue-primary">
              <span><strong>{data.metrics.taxonomyLevels}</strong> levels</span>
              <span><strong>{data.metrics.rootCategories}</strong> roots</span>
              <span><strong>{data.metrics.leafCategories}</strong> leaves</span>
              <span><strong>{data.metrics.activeCategories}</strong> active</span>
            </div>
            <div className="workspace-action-bar"><span>Commerce rules are owned by Categories & Policies.</span><Link className="button button-secondary" href="/admin/categories">Open Categories</Link></div>
          </article>
        </div>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Catalogue model" title="Product Types, attributes & taxonomy structure" note="Reference information stays available here, but detailed review and policy changes belong to the dedicated workspaces above." />
      <WorkspaceMetricStrip
        ariaLabel="Catalogue model summary"
        items={[
          { label: "Canonical attributes", value: data.attributes.totalAttributeDefinitions, hint: `${data.attributes.activeAttributeDefinitions} active` },
          { label: "Product Types", value: data.attributes.totalProductTypes, hint: `${data.attributes.activeProductTypes} active` },
          { label: "Attribute contracts", value: data.attributes.productTypeAttributeAssignments, hint: "Product Type ↔ attribute" },
          { label: "Taxonomy nodes", value: data.categories.length }
        ]}
      />
      {data.categories.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν taxonomy nodes στον κατάλογο." body="Μόλις δημιουργηθεί taxonomy ή εισαχθούν canonical προϊόντα, η δομή θα εμφανιστεί εδώ." /> : <WorkspaceRecordDetails label={`Browse taxonomy tree · ${data.categories.length} nodes`}>
        <div className="catalogue-taxonomy-list">
          {data.categories.map((category) => <details className={`catalogue-taxonomy-row depth-${Math.min(category.depth, 5)}`} key={category.categoryCode}>
            <summary>
              <span className="catalogue-taxonomy-identity"><strong>{category.labelEl}</strong><small>{taxonomyRoleLabel(category.taxonomyRole)} · {category.categoryCode}</small></span>
              <span><strong>{category.directProducts}</strong><small>direct</small></span>
              <span><strong>{category.subtreeProducts}</strong><small>branch</small></span>
              <span><strong>{category.childCount}</strong><small>children</small></span>
              <WorkspaceStatusBadge status={category.active ? "active" : "inactive"} label={category.active ? "Active" : "Inactive"} />
            </summary>
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Path</strong><span>{category.pathLabels.join(" › ")}</span></div>
              <div className="workspace-compact-row"><strong>Semantic role</strong><span>{taxonomyRoleLabel(category.taxonomyRole)} · {category.taxonomyRole}</span></div>
              <div className="workspace-compact-row"><strong>Assignable / discoverable</strong><span>{category.assignable ? "Assignable" : "Navigation only"} · {category.discoverable ? "Discoverable" : "Hidden from browse"}</span></div>
              <div className="workspace-compact-row"><strong>Live products</strong><span>{category.directLiveProducts} direct · {category.subtreeLiveProducts} in branch</span></div>
              <div className="workspace-compact-row"><strong>Parent</strong><span>{category.parentCategoryCode ?? "— root —"}</span></div>
            </div>
          </details>)}
        </div>
      </WorkspaceRecordDetails>}
    </section>
  </main>;
}
