"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

type Workspace = {
  csrfToken: string;
  vendorId: string;
  csvTemplate: string;
  submissions: ReadonlyArray<{
    id: string;
    vendorSku?: string;
    title: string;
    categoryCode: string;
    status: string;
    canonicalVariantId?: string;
    supplierPrice: string;
    stockOnHand: number;
    fulfilmentModes: readonly string[];
    adviceAvailable: boolean;
    rejectionReason?: string;
    updatedAt: number;
    candidates: ReadonlyArray<{ id: string; canonicalVariantId: string; canonicalTitle: string; level: string; confidence: number; status: string }>;
  }>;
};

type Preview = { totalRows: number; rows: readonly unknown[]; errors: readonly { rowNumber: number; field?: string; message: string }[] };

const when = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function VendorCatalogClient({ initial }: { initial: Workspace }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [csv, setCsv] = useState(initial.csvTemplate);

  const awaitingReview = initial.submissions.filter((item) => ["submitted", "needs_review"].includes(item.status)).length;
  const linked = initial.submissions.filter((item) => Boolean(item.canonicalVariantId)).length;
  const rejected = initial.submissions.filter((item) => item.status === "rejected").length;

  async function call(key: string, url: string, body: unknown) {
    setBusy(key);
    setError("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": initial.csrfToken }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Η ενέργεια απέτυχε");
      if (payload.preview) setPreview(payload.preview as Preview);
      router.refresh();
      return payload;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η ενέργεια απέτυχε");
    } finally { setBusy(""); }
  }

  const canConfirmImport = Boolean(preview && preview.totalRows > 0 && preview.errors.length === 0);

  return <>
    {error && <div className="shell form-error vendor-error" role="alert">{error}</div>}

    <WorkspaceMetricStrip items={[
      { label: "Source products", value: initial.submissions.length },
      { label: "Needs review", value: awaitingReview, tone: awaitingReview ? "attention" : "default" },
      { label: "Linked", value: linked, tone: linked ? "positive" : "default" },
      { label: "Rejected", value: rejected, tone: rejected ? "attention" : "default" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Add products" title="Νέο προϊόν" note="Manual entry για μεμονωμένα προϊόντα. Η αποθήκευση δημιουργεί draft και όχι δημόσιο listing." />
      <details className="workspace-tool-panel" open>
        <summary><span><strong>Χειροκίνητη καταχώρηση</strong><small>Γρήγορη δημιουργία ενός source product.</small></span></summary>
        <div className="workspace-tool-body">
          <form onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void call("create", "/api/vendor/catalog/products", {
              title: form.get("title"), categoryCode: form.get("category"), vendorSku: form.get("sku"), brand: form.get("brand"),
              supplierUnitPriceMinor: Number(form.get("price")), stockOnHand: Number(form.get("stock")), safetyStock: Number(form.get("safety"))
            });
          }}>
            <div className="workspace-form-grid">
              <div className="workspace-form-field span-2"><label htmlFor="catalog-title">Τίτλος προϊόντος</label><input id="catalog-title" name="title" required /></div>
              <div className="workspace-form-field"><label htmlFor="catalog-category">Category code</label><input id="catalog-category" name="category" required /></div>
              <div className="workspace-form-field"><label htmlFor="catalog-sku">SKU</label><input id="catalog-sku" name="sku" /></div>
              <div className="workspace-form-field"><label htmlFor="catalog-brand">Brand</label><input id="catalog-brand" name="brand" /></div>
              <div className="workspace-form-field"><label htmlFor="catalog-price">Supplier price · cents</label><input id="catalog-price" name="price" required type="number" min="0" step="1" /></div>
              <div className="workspace-form-field"><label htmlFor="catalog-stock">Stock</label><input id="catalog-stock" name="stock" required type="number" min="0" step="1" /></div>
              <div className="workspace-form-field"><label htmlFor="catalog-safety">Safety stock</label><input id="catalog-safety" name="safety" type="number" min="0" step="1" defaultValue="0" /></div>
            </div>
            <div className="workspace-form-actions"><button className="button" disabled={busy === "create"}>{busy === "create" ? "Αποθήκευση…" : "Αποθήκευση draft"}</button></div>
          </form>
        </div>
      </details>

      <details className="workspace-tool-panel">
        <summary><span><strong>Μαζική εισαγωγή CSV</strong><small>Advanced εργαλείο · πρώτα dry-run, μετά confirm.</small></span></summary>
        <div className="workspace-tool-body">
          <div className="workspace-inline-note">Το CSV ξεκινά μόνο με το ασφαλές template. Δεν προστίθεται demo product και κάθε αλλαγή ακυρώνει το προηγούμενο preview.</div>
          <div className="workspace-form-field" style={{ marginTop: 12 }}><label htmlFor="catalog-csv">CSV data</label><textarea id="catalog-csv" className="vendor-csv" value={csv} onChange={(event) => { setCsv(event.target.value); setPreview(null); }} /></div>
          <div className="workspace-form-actions"><button type="button" className="button button-secondary" onClick={() => void call("preview", "/api/vendor/catalog/import", { csv, confirm: false })} disabled={Boolean(busy)}>Dry-run</button><button type="button" className="button" onClick={() => void call("commit", "/api/vendor/catalog/import", { csv, confirm: true })} disabled={Boolean(busy) || !canConfirmImport}>Confirm import</button></div>
          {preview && <div className="vendor-preview"><strong>{preview.totalRows} rows · {preview.errors.length} errors</strong>{preview.errors.map((item, index) => <span key={`${item.rowNumber}:${item.field ?? index}`}>Row {item.rowNumber}{item.field ? ` · ${item.field}` : ""}: {item.message}</span>)}{preview.errors.length === 0 && preview.totalRows > 0 && <span>Το preview είναι καθαρό. Μπορείς να επιβεβαιώσεις την εισαγωγή.</span>}</div>}
        </div>
      </details>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Product Matching Centre" title="Source products" note="Canonical evidence και IDs εμφανίζονται μόνο όταν τα χρειάζεσαι." />
      {initial.submissions.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν source products." body="Δημιούργησε ένα προϊόν ή χρησιμοποίησε το CSV εργαλείο για μαζική εισαγωγή." /> : <div className="workspace-queue-list">{initial.submissions.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head"><div><strong>{item.title}</strong><small>{item.vendorSku ?? "Χωρίς SKU"} · {item.categoryCode} · {when(item.updatedAt)}</small></div><span className="status-pill">{item.status}</span></div>
        <div className="workspace-queue-primary"><span>{item.supplierPrice}</span><span>Stock {item.stockOnHand}</span><span>{item.canonicalVariantId ? "Linked" : `${item.candidates.length} candidates`}</span></div>
        {item.rejectionReason && <p className="workspace-queue-summary">{item.rejectionReason}</p>}
        <WorkspaceRecordDetails label="Matching evidence & technical details" open={item.status === "rejected"}>
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Source product</strong><span>{item.id}</span></div>
            {item.canonicalVariantId && <div className="workspace-compact-row"><strong>Canonical variant</strong><span>{item.canonicalVariantId}</span></div>}
            {item.candidates.map((candidate) => <div className="workspace-compact-row" key={candidate.id}><strong>{candidate.canonicalTitle}</strong><span>{candidate.level} · {(candidate.confidence * 100).toFixed(0)}%</span><small>{candidate.status} · {candidate.canonicalVariantId}</small></div>)}
          </div>
        </WorkspaceRecordDetails>
        <div className="workspace-action-bar"><span>Platform-controlled match & offer approval.</span><div className="workspace-action-buttons">{["draft", "needs_review", "linked", "rejected"].includes(item.status) && <button className="button" disabled={Boolean(busy)} onClick={() => void call(`submit:${item.id}`, `/api/vendor/catalog/products/${item.id}/submit`, {})}>{busy === `submit:${item.id}` ? "Υποβολή…" : "Υποβολή"}</button>}</div></div>
      </article>)}</div>}
    </div></section>
  </>;
}
