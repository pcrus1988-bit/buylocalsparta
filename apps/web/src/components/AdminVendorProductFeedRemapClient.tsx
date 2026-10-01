"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { VendorXmlFieldMapping } from "@buy-local-sparta/core";

type Category = { id: string; code: string; name: string; path?: string };
type Preview = {
  itemTag: string;
  fields: readonly string[];
  mapping: VendorXmlFieldMapping;
  sourceCategories: readonly string[];
  categories: readonly Category[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: readonly { rowNumber: number; externalId?: string; field?: string; message: string }[];
};

const fieldLabels: ReadonlyArray<[keyof VendorXmlFieldMapping, string]> = [
  ["externalId", "Product ID"],
  ["vendorSku", "SKU"],
  ["title", "Τίτλος"],
  ["description", "Περιγραφή"],
  ["brand", "Μάρκα"],
  ["model", "Μοντέλο"],
  ["mpn", "MPN"],
  ["gtin", "EAN / GTIN"],
  ["price", "Τελική τιμή πώλησης"],
  ["currency", "Νόμισμα"],
  ["stock", "Απόθεμα"],
  ["availability", "Availability"],
  ["categoryCode", "KONTA MOU category code"],
  ["sourceCategory", "Κατηγορία XML"],
  ["imageUrl", "Κύρια εικόνα"],
  ["additionalImageUrl", "Επιπλέον εικόνες"],
  ["productUrl", "Product URL"],
  ["itemGroupId", "Ομάδα / parent προϊόντος"],
  ["size", "Μέγεθος"],
  ["color", "Χρώμα"],
  ["condition", "Κατάσταση"]
];

export function AdminVendorProductFeedRemapClient({
  csrfToken,
  feed
}: {
  csrfToken: string;
  feed: {
    id: string;
    name: string;
    sourceUrl: string;
    fieldMapping: VendorXmlFieldMapping;
    categoryMapping: Readonly<Record<string, string>>;
    defaultCategoryCode?: string;
  };
}) {
  const router = useRouter();
  const [mapping, setMapping] = useState<VendorXmlFieldMapping>(feed.fieldMapping ?? {});
  const [categoryMapping, setCategoryMapping] = useState<Record<string, string>>({ ...(feed.categoryMapping ?? {}) });
  const [defaultCategoryCode, setDefaultCategoryCode] = useState(feed.defaultCategoryCode ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"preview" | "save" | "">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function run(action: "preview" | "save") {
    setBusy(action);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/admin/catalogue/vendor-feeds/${encodeURIComponent(feed.id)}/remap`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          action,
          fieldMapping: mapping,
          categoryMapping,
          defaultCategoryCode: defaultCategoryCode || undefined
        })
      });
      const data = await response.json() as { error?: string; preview?: Preview };
      if (!response.ok || !data.preview) throw new Error(data.error ?? "Το remap δεν ολοκληρώθηκε.");
      setPreview(data.preview);
      setMapping(data.preview.mapping);
      if (action === "save") {
        setMessage("Το mapping αποθηκεύτηκε και το feed επανεπεξεργάστηκε.");
        router.refresh();
      } else {
        setMessage("Η νέα αντιστοίχιση αναλύθηκε χωρίς να αλλάξει ακόμη το feed.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Το remap δεν ολοκληρώθηκε.");
    } finally {
      setBusy("");
    }
  }

  return <div className="workspace-tool-panel">
    <div className="workspace-tool-body">
      <div className="workspace-inline-note">
        <strong>{feed.name}</strong>
        <p>{feed.sourceUrl}</p>
      </div>

      {message && <div className="workspace-inline-note" role="status"><strong>Έτοιμο.</strong> {message}</div>}
      {error && <div className="form-error vendor-error" role="alert">{error}</div>}

      <div className="workspace-action-bar">
        <span>Πρώτα κάνε preview. Το Save κάνει validation, αποθηκεύει το mapping και reprocess του ίδιου URL feed.</span>
        <div className="workspace-action-buttons">
          <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => void run("preview")}>
            {busy === "preview" ? "Ανάλυση…" : "Analyze / Preview"}
          </button>
          {preview && preview.validRows > 0 && <button className="button" type="button" disabled={Boolean(busy)} onClick={() => void run("save")}>
            {busy === "save" ? "Αποθήκευση…" : "Save mapping & reprocess"}
          </button>}
        </div>
      </div>

      {preview && <>
        <div className="workspace-metric-strip" style={{ marginTop: 18 }}>
          <div><small>XML rows</small><strong>{preview.totalRows.toLocaleString("el-GR")}</strong></div>
          <div><small>Ready</small><strong>{preview.validRows.toLocaleString("el-GR")}</strong></div>
          <div><small>Errors</small><strong>{preview.errorRows.toLocaleString("el-GR")}</strong></div>
          <div><small>Fields</small><strong>{preview.fields.length.toLocaleString("el-GR")}</strong></div>
        </div>

        <details open>
          <summary><strong>Field mapping</strong></summary>
          <div className="workspace-form-grid" style={{ marginTop: 14 }}>
            {fieldLabels.map(([key,label]) => <label key={key}>
              <span>{label}</span>
              <select value={mapping[key] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [key]: event.target.value || undefined }))}>
                <option value="">— Δεν χρησιμοποιείται —</option>
                {preview.fields.map((field) => <option key={field} value={field}>{field}</option>)}
              </select>
            </label>)}
          </div>
        </details>

        <details style={{ marginTop: 16 }}>
          <summary><strong>Category mapping</strong></summary>
          <div className="workspace-form-grid" style={{ marginTop: 14 }}>
            <label>
              <span>Default category</span>
              <select value={defaultCategoryCode} onChange={(event) => setDefaultCategoryCode(event.target.value)}>
                <option value="">Automatic</option>
                {preview.categories.map((category) => <option key={category.code} value={category.code}>{category.path ?? category.name}</option>)}
              </select>
            </label>
          </div>
          <div className="workspace-compact-list" style={{ marginTop: 14 }}>
            {preview.sourceCategories.slice(0, 80).map((source) => <div className="workspace-compact-row" key={source}>
              <strong>{source}</strong>
              <select value={categoryMapping[source] ?? ""} onChange={(event) => setCategoryMapping((current) => ({ ...current, [source]: event.target.value }))}>
                <option value="">Automatic / default</option>
                {preview.categories.map((category) => <option key={category.code} value={category.code}>{category.path ?? category.name}</option>)}
              </select>
            </div>)}
          </div>
        </details>

        {preview.errors.length > 0 && <details style={{ marginTop: 16 }}>
          <summary><strong>Validation errors</strong></summary>
          <div className="workspace-compact-list">
            {preview.errors.slice(0, 60).map((item,index) => <div className="workspace-compact-row" key={index}>
              <strong>Row {item.rowNumber}{item.externalId ? " · " + item.externalId : ""}</strong>
              <span>{item.field ? item.field + ": " : ""}{item.message}</span>
            </div>)}
          </div>
        </details>}
      </>}
    </div>
  </div>;
}
