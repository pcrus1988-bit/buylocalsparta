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
        eyebrow="Δεδομένα προϊόντων · Icecat"
        title="Τι γνωρίζει το ΚΟΝΤΑ ΜΟΥ για κάθε προϊόν"
        note="Εδώ φαίνεται αν υπάρχει συνδεδεμένο Open Icecat evidence, σε ποια κατάσταση βρίσκεται ο εμπλουτισμός και ποια κοινά στοιχεία προϊόντος προέρχονται από Icecat. Η προβολή είναι μόνο για το δικό σου catalogue."
      />
      <WorkspaceMetricStrip items={[
        { label: "Προϊόντα στη σημερινή προβολή", value: records.length },
        { label: "Με Icecat evidence", value: linked, tone: linked ? "positive" : "default" },
        { label: "Greek-ready", value: ready, tone: ready ? "positive" : "default" },
        { label: "Χρειάζονται εμπλουτισμό", value: attention, tone: attention ? "attention" : "positive" }
      ]} />
      <div className="workspace-inline-note">
        <strong>Σαφές όριο:</strong> το Icecat μπορεί να δώσει κοινά στοιχεία όπως τίτλο, περιγραφή, κατηγορία, τεχνικά χαρακτηριστικά και εικόνες. Δεν αλλάζει το δικό σου SKU, την τιμή προμηθευτή/πώλησης, το φυσικό stock, την ορατότητα ή την έγκριση του offer.
      </div>
      {records.length === 0 ? <WorkspaceEmptyState
        title="Δεν υπάρχουν ακόμη προϊόντα για έλεγχο Icecat."
        body="Μόλις δημιουργηθεί ή ανατεθεί προϊόν, η κατάσταση προέλευσης δεδομένων θα εμφανιστεί εδώ."
      /> : <div className="workspace-queue-list">{records.map((record) => {
        const presentation = statusPresentation(record.status);
        return <article className="workspace-queue-card" key={`${record.contextKind}:${record.contextId}`}>
          <div className="workspace-queue-head">
            <div><strong>{record.title}</strong><small>{contextLabel(record.contextKind)}{record.canonicalVariantId ? ` · ${record.canonicalVariantId}` : " · canonical matching εκκρεμεί"}</small></div>
            <WorkspaceStatusBadge status={record.status} label={presentation.label} tone={presentation.tone} />
          </div>
          <div className="workspace-queue-primary">
            <span><strong>{record.hasIcecatEvidence ? "Icecat συνδεδεμένο" : "Χωρίς Icecat link"}</strong></span>
            <span>Ελληνικά: {completenessLabel(record.greekCompleteness)}</span>
            <span>{record.specificationCount} χαρακτηριστικά</span>
            <span>{record.imageCount} εικόνες evidence</span>
          </div>
          {!record.hasIcecatEvidence && <div className="workspace-inline-note">Δεν υπάρχει ακόμη εγκεκριμένη σύνδεση αυτού του προϊόντος με Open Icecat evidence. Αυτό δεν μπλοκάρει από μόνο του το δικό σου offer· η σύνδεση μπορεί να εμφανιστεί μετά το canonical matching.</div>}
          {record.hasIcecatEvidence && <WorkspaceRecordDetails label="Τι έδωσε το Icecat" open={record.status === "needs_enrichment" || record.status === "retry" || record.status === "failed"}>
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Κατάσταση enrichment</strong><span>{presentation.label}</span></div>
              <div className="workspace-compact-row"><strong>Πεδία από Icecat</strong><span>{record.providedFields.length ? record.providedFields.map(fieldLabel).join(" · ") : "Source evidence χωρίς ολοκληρωμένα localized fields"}</span></div>
              <div className="workspace-compact-row"><strong>Προέλευση περιεχομένου</strong><span>{originLabel(record.contentOrigin)}{record.sourceLocale ? ` · source locale ${record.sourceLocale}` : ""}</span></div>
              <div className="workspace-compact-row"><strong>Greek quality</strong><span>{completenessLabel(record.greekCompleteness)}{record.qualityStatus ? ` · ${record.qualityStatus}` : ""}</span></div>
              {record.qualityMissing.length > 0 && <div className="workspace-compact-row"><strong>Λείπουν ακόμη</strong><span>{record.qualityMissing.join(" · ")}</span></div>}
              {record.providerProductId && <div className="workspace-compact-row"><strong>Icecat product</strong><span className="vendor-technical-id">{record.providerProductId}</span></div>}
              {record.updatedAt && <div className="workspace-compact-row"><strong>Τελευταίο evidence update</strong><span>{when(record.updatedAt)}</span></div>}
            </div>
          </WorkspaceRecordDetails>}
        </article>;
      })}</div>}
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

function statusPresentation(status: ProductIcecatVisibilityStatus): { label: string; tone: "positive" | "attention" | "danger" | "default" } {
  switch (status) {
    case "ready": return { label: "Icecat · Greek-ready", tone: "positive" };
    case "processing": return { label: "Icecat · processing", tone: "attention" };
    case "pending": return { label: "Icecat · pending", tone: "attention" };
    case "needs_enrichment": return { label: "Icecat · needs enrichment", tone: "attention" };
    case "retry": return { label: "Icecat · retry", tone: "attention" };
    case "failed": return { label: "Icecat · failed", tone: "danger" };
    case "skipped": return { label: "Icecat · skipped", tone: "default" };
    case "evidence": return { label: "Icecat evidence", tone: "positive" };
    default: return { label: "Δεν έχει συνδεθεί με Icecat", tone: "default" };
  }
}

function contextLabel(kind: ProductIcecatVisibility["contextKind"]): string {
  if (kind === "offer") return "Ενεργό catalogue product";
  if (kind === "submission") return "Νέα καταχώρηση";
  if (kind === "assigned") return "Supplier PIM assignment";
  return "Admin source product";
}
function completenessLabel(value?: number): string { return value === undefined ? "—" : `${Math.round(value * 100)}%`; }
function originLabel(value?: string): string {
  if (value === "icecat_native") return "Native Greek Icecat";
  if (value === "translated_verified") return "Verified translation from Icecat";
  if (value === "mixed") return "Mixed verified Icecat evidence";
  if (value === "manual_verified") return "Manually verified source evidence";
  return value ?? "—";
}
function fieldLabel(value: string): string {
  if (value === "title") return "τίτλος";
  if (value === "description") return "περιγραφή";
  if (value === "category") return "κατηγορία";
  if (value === "specifications") return "χαρακτηριστικά";
  if (value === "images") return "εικόνες";
  return value;
}
function when(value: number): string {
  return new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));
}
