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
      <WorkspaceSectionHeading eyebrow="Add products" title="Νέο προϊόν" note="Η τιμή που ορίζεις είναι η τελική τιμή που θα δει και θα πληρώσει ο πελάτης. Το Buy Local δεν προσθέτει markup στην τιμή προϊόντος." />
      <details className="workspace-tool-panel" open>
        <summary><span><strong>Χειροκίνητη καταχώρηση</strong><small>Η αποθήκευση δημιουργεί draft, όχι δημόσιο listing.</small></span></summary>
        <div className="workspace-tool-body">
          <div className="workspace-inline-note">Για σωστό matching του ίδιου προϊόντος μεταξύ διαφορετικών καταστημάτων, συμπλήρωσε GTIN / EAN και model όπου υπάρχουν. Το ίδιο canonical προϊόν μπορεί να έχει διαφορετική τελική τιμή ανά vendor χωρίς να δημιουργείται διπλό δημόσιο προϊόν.</div>
          <form onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void call("create", "/api/vendor/catalog/products", {
              title: form.get("title"),
              categoryCode: form.get("category"),
              vendorSku: form.get("sku"),
              brand: form.get("brand"),
              model: form.get("model"),
              gtin: form.get("gtin"),
              customerPriceMinor: Number(form.get("price")),
              stockOnHand: Number(form.get("stock")),
              safetyStock: Number(form.get("safety"))
            });
          }}>
            <div className="workspace-form-grid">
              <div className="workspace-form-field span-2"><label htmlFor="catalog-title">Τίτλος προϊόντος</label><input id="catalog-title" name="title" required /></div>
              <div className="workspace-form-field"><label htmlFor="catalog-category">Category code</label><input id="catalog-category" name="category" required /></div>
              <div className="workspace-form-field"><label htmlFor="catalog-sku">Δικό σου SKU</label><input id="catalog-sku" name="sku" /></div>
              <div className="workspace-form-field"><label htmlFor="catalog-brand">Brand</label><input id="catalog-brand" name="brand" /></div>
              <div className="workspace-form-field"><label htmlFor="catalog-model">Model</label><input id="catalog-model" name="model" autoComplete="off" /></div>
              <div className="workspace-form-field"><label htmlFor="catalog-gtin">GTIN / EAN</label><input id="catalog-gtin" name="gtin" inputMode="numeric" autoComplete="off" placeholder="π.χ. 5201234567890" /></div>
              <div className="workspace-form-field"><label htmlFor="catalog-price">Τελική τιμή πελάτη · cents</label><input id="catalog-price" name="price" required type="number" min="0" step="1" /><small>π.χ. 4490 = €44,90. Αυτή είναι η ακριβής τιμή πώλησης, χωρίς προσαύξηση από Buy Local.</small></div>
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
          <div className="workspace-inline-note">Το πεδίο supplier_price_minor στο παλιό CSV template αντιμετωπίζεται προσωρινά ως <strong>τελική τιμή πελάτη</strong> για backward compatibility. Θα μετονομαστεί σε customer_price_minor στο νέο template χωρίς αλλαγή οικονομικής σημασίας.</div>
          <div className="workspace-form-field" style={{ marginTop: 12 }}><label htmlFor="catalog-csv">CSV data</label><textarea id="catalog-csv" className="vendor-csv" value={csv} onChange={(event) => { setCsv(event.target.value); setPreview(null); }} /></div>
          <div className="workspace-form-actions"><button type="button" className="button button-secondary" onClick={() => void call("preview", "/api/vendor/catalog/import", { csv, confirm: false })} disabled={Boolean(busy)}>Dry-run</button><button type="button" className="button" onClick={() => void call("commit", "/api/vendor/catalog/import", { csv, confirm: true })} disabled={Boolean(busy) || !canConfirmImport}>Confirm import</button></div>
          {preview && <div className="vendor-preview"><strong>{preview.totalRows} rows · {preview.errors.length} errors</strong>{preview.errors.map((item, index) => <span key={`${item.rowNumber}:${item.field ?? index}`}>Row {item.rowNumber}{item.field ? ` · ${item.field}` : ""}: {item.message}</span>)}{preview.errors.length === 0 && preview.totalRows > 0 && <span>Το preview είναι καθαρό. Μπορείς να επιβεβαιώσεις την εισαγωγή.</span>}</div>}
        </div>
      </details>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Product Matching Centre" title="Source products" note="Κάθε source product συνδέεται με ένα canonical προϊόν. Πολλοί vendors μπορούν να έχουν ξεχωριστή τιμή και stock στο ίδιο canonical." />
      {initial.submissions.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν source products." body="Δημιούργησε ένα προϊόν ή χρησιμοποίησε το CSV εργαλείο για μαζική εισαγωγή." /> : <div className="workspace-queue-list">{initial.submissions.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head"><div><strong>{item.title}</strong><small>{item.vendorSku ?? "Χωρίς SKU"} · {item.categoryCode} · {when(item.updatedAt)}</small></div><span className="status-pill">{item.status}</span></div>
        <div className="workspace-queue-primary"><span>Τελική τιμή {item.supplierPrice}</span><span>Stock {item.stockOnHand}</span><span>{item.canonicalVariantId ? "Linked" : `${item.candidates.length} candidates`}</span></div>
        {item.rejectionReason && <p className="workspace-queue-summary">{item.rejectionReason}</p>}
        <WorkspaceRecordDetails label="Matching evidence & technical details" open={item.status === "rejected"}>
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Source product</strong><span>{item.id}</span></div>
            {item.canonicalVariantId && <div className="workspace-compact-row"><strong>Canonical variant</strong><span>{item.canonicalVariantId}</span></div>}
            {item.candidates.map((candidate) => <div className="workspace-compact-row" key={candidate.id}><strong>{candidate.canonicalTitle}</strong><span>{candidate.level} · {(candidate.confidence * 100).toFixed(0)}%</span><small>{candidate.status} · {candidate.canonicalVariantId}</small></div>)}
          </div>
        </WorkspaceRecordDetails>
        <div className="workspace-action-bar"><span>Το matching και η έγκριση offer ελέγχονται από την πλατφόρμα.</span><div className="workspace-action-buttons">{item.status === "draft" && <button className="button" disabled={Boolean(busy)} onClick={() => void call(`submit:${item.id}`, `/api/vendor/catalog/products/${item.id}/submit`, {})}>{busy === `submit:${item.id}` ? "Υποβολή…" : "Υποβολή"}</button>}</div></div>
      </article>)}</div>}
    </div></section>
  </>;
}
