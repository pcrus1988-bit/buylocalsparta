import Link from "next/link";
import type { ProductIcecatVisibility, ProductIcecatVisibilityStatus } from "../lib/product-icecat-visibility";
import {
  WorkspaceEmptyState,
  WorkspaceMetricStrip,
  WorkspaceRecordDetails,
  WorkspaceSectionHeading,
  WorkspaceStatusBadge
} from "./WorkspacePagePrimitives";

export function VendorProductIcecatVisibilityPanel({ records }: Readonly<{ records: readonly ProductIcecatVisibility[] }>) {
  const linked = records.filter((record) => record.hasIcecatEvidence).length;
  const ready = records.filter((record) => record.status === "ready" || record.qualityStatus === "ready" || record.qualityStatus === "verified").length;
  const attention = records.filter((record) => ["needs_enrichment", "retry", "failed"].includes(record.status)).length;

  return <section className="vendor-section section-tint" id="product-data-icecat">
    <div className="shell">
      <WorkspaceSectionHeading
        eyebrow="Στοιχεία προϊόντων"
        title="Icecat & εμπλουτισμός περιεχομένου"
        note="Δευτερεύουσα πληροφορία για τίτλους, περιγραφές, χαρακτηριστικά και εικόνες. Δεν επηρεάζει τιμή, stock ή τους τρόπους παράδοσης του προϊόντος."
      />
      <WorkspaceMetricStrip items={[
        { label: "Προϊόντα", value: records.length },
        { label: "Με Icecat", value: linked, tone: linked ? "positive" : "default" },
        { label: "Greek-ready", value: ready, tone: ready ? "positive" : "default" },
        { label: "Θέλουν προσοχή", value: attention, tone: attention ? "attention" : "positive" }
      ]} />
      {records.length === 0 ? <WorkspaceEmptyState
        title="Δεν υπάρχουν ακόμη προϊόντα για έλεγχο Icecat."
        body="Μόλις δημιουργηθεί ή ανατεθεί προϊόν, η κατάσταση προέλευσης δεδομένων θα εμφανιστεί εδώ."
      /> : <WorkspaceRecordDetails label={`Προβολή κατάστασης Icecat · ${records.length.toLocaleString("el-GR")} προϊόντα`}>
        <div className="workspace-inline-note">
          Το Icecat είναι βοηθητικό enrichment. Ένα προϊόν χωρίς σύνδεση Icecat μπορεί να συνεχίσει κανονικά στο δικό σου catalogue όταν τα εμπορικά του στοιχεία είναι έγκυρα. Δεν αλλάζει το δικό σου SKU, την τιμή προμηθευτή/πώλησης, το φυσικό stock, την ορατότητα ή την έγκριση του offer.
        </div>
        <div className="workspace-compact-list">{records.map((record) => {
          const presentation = statusPresentation(record.status);
          const details = [
            presentation.label,
            record.hasIcecatEvidence ? "συνδεδεμένο" : "χωρίς σύνδεση",
            record.greekCompleteness === undefined ? undefined : `EL ${completenessLabel(record.greekCompleteness)}`,
            record.specificationCount ? `${record.specificationCount} χαρακτηριστικά` : undefined,
            record.imageCount ? `${record.imageCount} εικόνες` : undefined
          ].filter(Boolean).join(" · ");
          return <div className="workspace-compact-row" key={`${record.contextKind}:${record.contextId}`}>
            <strong>{record.title}</strong>
            <span>{details}</span>
          </div>;
        })}</div>
      </WorkspaceRecordDetails>}
    </div>
  </section>;
}

export function AdminProductIcecatVisibilityPanel({ records }: Readonly<{ records: readonly ProductIcecatVisibility[] }>) {
  return <WorkspaceRecordDetails label={`Open Icecat provenance · ${records.length}`} open={records.some((record) => record.status === "failed" || record.status === "retry")}>
    {records.length === 0 ? <div className="workspace-inline-note">
      No approved Open Icecat evidence is linked to this source product yet. If canonical matching is still pending, Icecat evidence can appear after an approved canonical link exists. <Link className="text-link" href="/admin/icecat">Open Icecat Control Center</Link>
    </div> : <div className="workspace-queue-list">{records.map((record) => {
      const presentation = statusPresentation(record.status);
      return <article className="workspace-queue-card" key={`${record.sourceProductId ?? record.contextId}:${record.canonicalVariantId ?? "direct"}`}>
        <div className="workspace-queue-head">
          <div><strong>{record.title}</strong><small>{record.providerProductId ? `Icecat ${record.providerProductId}` : "Open Icecat source evidence"}</small></div>
          <WorkspaceStatusBadge status={record.status} label={presentation.label} tone={presentation.tone} />
        </div>
        <div className="workspace-queue-primary">
          <span>Greek {completenessLabel(record.greekCompleteness)}</span>
          <span>{record.specificationCount} specifications</span>
          <span>{record.imageCount} evidence images</span>
          <span>{record.providedFields.length} populated field groups</span>
        </div>
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Canonical variant</strong><span>{record.canonicalVariantId ?? "Direct Icecat source · no approved canonical link"}</span></div>
          <div className="workspace-compact-row"><strong>Fields supplied</strong><span>{record.providedFields.length ? record.providedFields.join(" · ") : "—"}</span></div>
          <div className="workspace-compact-row"><strong>Content origin</strong><span>{record.contentOrigin ?? "—"}{record.sourceLocale ? ` · ${record.sourceLocale}` : ""}</span></div>
          <div className="workspace-compact-row"><strong>Quality</strong><span>{record.qualityStatus ?? "—"}{record.qualityMissing.length ? ` · missing: ${record.qualityMissing.join(", ")}` : ""}</span></div>
          {record.lastError && <div className="workspace-compact-row"><strong>Latest worker error</strong><span>{record.lastError}</span></div>}
          {record.sourceProductId && <div className="workspace-compact-row"><strong>Icecat source product</strong><span className="vendor-technical-id">{record.sourceProductId}</span></div>}
        </div>
      </article>;
    })}<div className="workspace-action-bar"><span>Icecat remains source evidence only; canonical publication and commerce state stay separately governed.</span><Link className="button button-secondary" href="/admin/icecat">Open Icecat Control Center</Link></div></div>}
  </WorkspaceRecordDetails>;
}

function statusPresentation(status: ProductIcecatVisibilityStatus): { label: string; tone: "positive" | "attention" | "danger" | "neutral" } {
  switch (status) {
    case "ready": return { label: "Icecat · Greek-ready", tone: "positive" };
    case "processing": return { label: "Icecat · processing", tone: "attention" };
    case "pending": return { label: "Icecat · pending", tone: "attention" };
    case "needs_enrichment": return { label: "Icecat · needs enrichment", tone: "attention" };
    case "retry": return { label: "Icecat · retry", tone: "attention" };
    case "failed": return { label: "Icecat · failed", tone: "danger" };
    case "skipped": return { label: "Icecat · skipped", tone: "neutral" };
    case "evidence": return { label: "Icecat evidence", tone: "positive" };
    default: return { label: "Δεν έχει συνδεθεί με Icecat", tone: "neutral" };
  }
}

function completenessLabel(value?: number): string { return value === undefined ? "—" : `${Math.round(value * 100)}%`; }
