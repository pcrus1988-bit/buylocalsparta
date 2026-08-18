"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./VendorCatalogClient.module.css";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

type CatalogProduct = {
  offerId: string; canonicalVariantId: string; title: string; vendorSku?: string; gtin?: string; brand?: string;
  categoryId: string; categoryCode: string; categoryName: string; categoryPathIds: readonly string[]; categoryPathCodes: readonly string[]; categoryPathNames: readonly string[]; categoryPath: string;
  retailPrice: string; retailPriceMinor: number; supplierPrice: string;
  onHand: number; reserved: number; blocked: number; safetyStock: number; availableToSell: number;
  offerStatus: string; productVisible: boolean; categoryVisible: boolean; effectiveVisible: boolean; merchantPauseActive: boolean; canToggleVisibility: boolean; updatedAt: number;
};
type CategoryControl = { id: string; code: string; name: string; path: string; depth: number; productCount: number; configuredVisible: boolean; effectiveVisible: boolean };
type CategoryOption = { id: string; code: string; name: string; path: string; depth: number };
type CatalogMetrics = { totalProducts: number; visibleProducts: number; hiddenProducts: number; inStockProducts: number; outOfStockProducts: number; lowStockProducts: number; availableUnits: number; categoryCount: number };
type Submission = {
  id: string; vendorSku?: string; title: string; categoryCode: string; status: string; canonicalVariantId?: string; supplierPrice: string;
  stockOnHand: number; fulfilmentModes: readonly string[]; adviceAvailable: boolean; rejectionReason?: string; updatedAt: number;
  candidates: ReadonlyArray<{ id: string; canonicalVariantId: string; canonicalTitle: string; level: string; confidence: number; status: string }>;
};
type Workspace = { csrfToken: string; vendorId: string; csvTemplate: string; catalogProducts: ReadonlyArray<CatalogProduct>; categories: ReadonlyArray<CategoryControl>; categoryOptions: ReadonlyArray<CategoryOption>; catalogMetrics: CatalogMetrics; submissions: ReadonlyArray<Submission> };
type Preview = { totalRows: number; rows: readonly unknown[]; errors: readonly { rowNumber: number; field?: string; message: string }[] };
type StockDraft = { onHand: string; safetyStock: string };

const when = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const isLowStock = (product: CatalogProduct) => product.availableToSell > 0 && product.availableToSell <= Math.max(2, product.safetyStock);

export function VendorCatalogClient({ initial }: { initial: Workspace }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [csv, setCsv] = useState(initial.csvTemplate);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [visibility, setVisibility] = useState("all");
  const [stock, setStock] = useState("all");
  const [brand, setBrand] = useState("all");
  const [sort, setSort] = useState("updated");
  const [stockDrafts, setStockDrafts] = useState<Record<string, StockDraft>>(() => Object.fromEntries(initial.catalogProducts.map((product) => [product.offerId, { onHand: String(product.onHand), safetyStock: String(product.safetyStock) }])));

  useEffect(() => {
    setStockDrafts(Object.fromEntries(initial.catalogProducts.map((product) => [product.offerId, { onHand: String(product.onHand), safetyStock: String(product.safetyStock) }])));
  }, [initial.catalogProducts]);

  const awaitingReview = initial.submissions.filter((item) => ["submitted", "needs_review"].includes(item.status)).length;
  const linked = initial.submissions.filter((item) => Boolean(item.canonicalVariantId)).length;
  const rejected = initial.submissions.filter((item) => item.status === "rejected").length;
  const brands = useMemo(() => [...new Set(initial.catalogProducts.map((item) => item.brand).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "el")), [initial.catalogProducts]);

  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("el");
    const rows = initial.catalogProducts.filter((product) => {
      if (needle) {
        const haystack = [product.title, product.vendorSku, product.gtin, product.brand, product.categoryPath, product.offerId].filter(Boolean).join(" ").toLocaleLowerCase("el");
        if (!haystack.includes(needle)) return false;
      }
      if (category !== "all" && !product.categoryPathIds.includes(category)) return false;
      if (visibility === "visible" && !product.effectiveVisible) return false;
      if (visibility === "hidden" && product.effectiveVisible) return false;
      if (brand !== "all" && product.brand !== brand) return false;
      if (stock === "in" && product.availableToSell <= 0) return false;
      if (stock === "out" && product.availableToSell > 0) return false;
      if (stock === "low" && !isLowStock(product)) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title, "el");
      if (sort === "category") return a.categoryPath.localeCompare(b.categoryPath, "el") || a.title.localeCompare(b.title, "el");
      if (sort === "stock") return a.availableToSell - b.availableToSell || a.title.localeCompare(b.title, "el");
      return b.updatedAt - a.updatedAt;
    });
  }, [initial.catalogProducts, query, category, visibility, brand, stock, sort]);

  async function call(key: string, url: string, body: unknown, method = "POST") {
    setBusy(key);
    setError("");
    try {
      const response = await fetch(url, { method, headers: { "content-type": "application/json", "x-csrf-token": initial.csrfToken }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: string; preview?: Preview };
      if (!response.ok) throw new Error(payload.error ?? "Η ενέργεια απέτυχε");
      if (payload.preview) setPreview(payload.preview);
      router.refresh();
      return payload;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η ενέργεια απέτυχε");
    } finally {
      setBusy("");
    }
  }

  const canConfirmImport = Boolean(preview && preview.totalRows > 0 && preview.errors.length === 0);
  const filtersActive = Boolean(query || category !== "all" || visibility !== "all" || stock !== "all" || brand !== "all" || sort !== "updated");
  const resetFilters = () => { setQuery(""); setCategory("all"); setVisibility("all"); setStock("all"); setBrand("all"); setSort("updated"); };

  return <>
    {error && <div className="shell form-error vendor-error" role="alert">{error}</div>}

    <WorkspaceMetricStrip items={[
      { label: "Ορατά στο κατάστημα", value: initial.catalogMetrics.visibleProducts, tone: initial.catalogMetrics.visibleProducts ? "positive" : "default" },
      { label: "Κρυφά", value: initial.catalogMetrics.hiddenProducts, tone: initial.catalogMetrics.hiddenProducts ? "attention" : "default" },
      { label: "Χαμηλό stock", value: initial.catalogMetrics.lowStockProducts, tone: initial.catalogMetrics.lowStockProducts ? "attention" : "default" },
      { label: "Χωρίς stock", value: initial.catalogMetrics.outOfStockProducts, tone: initial.catalogMetrics.outOfStockProducts ? "attention" : "default" }
    ]} />

    <section className="shell vendor-section" id="live-catalog">
      <WorkspaceSectionHeading eyebrow="Shop control centre" title="Κατάλογος, ορατότητα & απόθεμα" note="Έλεγξε τι βλέπει ο πελάτης, κρύψε ένα προϊόν ή ολόκληρη κατηγορία, και ενημέρωσε το πραγματικό stock χωρίς να διαγράφεις προϊόντα." />

      {initial.categories.length > 0 && <details className="workspace-tool-panel" open>
        <summary><span><strong>Ορατότητα κατηγοριών</strong><small>Το OFF σε μια κατηγορία κρύβει αυτόματα όλα τα προϊόντα και τις υποκατηγορίες της.</small></span></summary>
        <div className="workspace-tool-body">
          <div className={styles.categoryPanel}>
            {initial.categories.map((item) => <div className={styles.categoryRow} key={item.id}>
              <div className={styles.categoryMeta} style={{ paddingLeft: Math.min(item.depth, 4) * 13 }}>
                <div className={styles.categoryToggleTitle}><strong>{item.name}</strong><span>{item.productCount} προϊόντα</span></div>
                <small>{item.path}{item.configuredVisible && !item.effectiveVisible ? " · κρυφή από ανώτερη κατηγορία" : ""}</small>
              </div>
              <div className={styles.switchWrap}>
                <span>{item.effectiveVisible ? "Ορατή" : "Κρυφή"}</span>
                <label className={styles.switch} aria-label={`${item.name}: ${item.configuredVisible ? "ορατή" : "κρυφή"}`}>
                  <input type="checkbox" checked={item.configuredVisible} disabled={Boolean(busy)} onChange={(event) => void call(`category:${item.id}`, "/api/vendor/catalog/visibility", { scope: "category", categoryId: item.id, visible: event.target.checked }, "PUT")} />
                  <span className={styles.slider} />
                </label>
              </div>
            </div>)}
          </div>
          <p className={styles.bulkHint}>Η απενεργοποίηση δεν διαγράφει προϊόντα και δεν μηδενίζει το απόθεμα. Απλώς τα αφαιρεί από τη δημόσια πώληση μέχρι να τα ενεργοποιήσεις ξανά.</p>
        </div>
      </details>}

      <div className={styles.controlBar} aria-label="Φίλτρα καταλόγου">
        <div className={`${styles.field} ${styles.search}`}><label htmlFor="vendor-product-search">Αναζήτηση</label><input id="vendor-product-search" type="search" placeholder="Τίτλος, SKU, GTIN, brand…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className={styles.field}><label htmlFor="vendor-category-filter">Κατηγορία</label><select id="vendor-category-filter" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Όλες</option>{initial.categories.map((item) => <option value={item.id} key={item.id}>{`${"— ".repeat(Math.min(item.depth, 3))}${item.name} (${item.productCount})`}</option>)}</select></div>
        <div className={styles.field}><label htmlFor="vendor-visibility-filter">Ορατότητα</label><select id="vendor-visibility-filter" value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="all">Όλα</option><option value="visible">Ορατά</option><option value="hidden">Κρυφά</option></select></div>
        <div className={styles.field}><label htmlFor="vendor-stock-filter">Απόθεμα</label><select id="vendor-stock-filter" value={stock} onChange={(event) => setStock(event.target.value)}><option value="all">Όλα</option><option value="in">Σε απόθεμα</option><option value="low">Χαμηλό stock</option><option value="out">Εξαντλημένα</option></select></div>
        <div className={styles.field}><label htmlFor="vendor-brand-filter">Brand</label><select id="vendor-brand-filter" value={brand} onChange={(event) => setBrand(event.target.value)}><option value="all">Όλα</option>{brands.map((item) => <option value={item} key={item}>{item}</option>)}</select></div>
      </div>
      <div className={styles.filterSummary}><strong>{filteredProducts.length} από {initial.catalogMetrics.totalProducts} προϊόντα</strong><div className={styles.sectionTools}><div className={styles.field}><label htmlFor="vendor-sort">Ταξινόμηση</label><select id="vendor-sort" value={sort} onChange={(event) => setSort(event.target.value)}><option value="updated">Πρόσφατη ενημέρωση</option><option value="title">Όνομα A–Ω</option><option value="category">Κατηγορία</option><option value="stock">Χαμηλότερο stock</option></select></div>{filtersActive && <button className={styles.reset} type="button" onClick={resetFilters}>Καθαρισμός φίλτρων</button>}</div></div>

      {initial.catalogProducts.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν ακόμη προϊόντα." body="Δημιούργησε νέο προϊόν ή εισήγαγε CSV. Μόλις εγκριθεί, θα εμφανιστεί εδώ." /> : filteredProducts.length === 0 ? <div className={styles.emptyFiltered}>Δεν βρέθηκαν προϊόντα με αυτά τα φίλτρα. <button className={styles.reset} type="button" onClick={resetFilters}>Εμφάνιση όλων</button></div> : <div className={styles.productGrid}>{filteredProducts.map((product) => {
        const draft = stockDrafts[product.offerId] ?? { onHand: String(product.onHand), safetyStock: String(product.safetyStock) };
        const hiddenReason = !product.productVisible ? "Απενεργοποιημένο από το κατάστημά σου." : !product.categoryVisible ? "Κρυφό επειδή μία κατηγορία του είναι απενεργοποιημένη." : product.offerStatus !== "approved" ? `Μη δημόσιο λόγω κατάστασης: ${product.offerStatus}.` : "";
        return <article className={`${styles.productCard} ${!product.effectiveVisible ? styles.productCardHidden : ""}`} key={product.offerId}>
          <div className={styles.productHead}>
            <div><div className={styles.crumb}>{product.categoryPath}</div><h3>{product.title}</h3><div className={styles.identifierLine}>{product.brand && <span>{product.brand}</span>}{product.vendorSku && <span>SKU {product.vendorSku}</span>}{product.gtin && <span>GTIN {product.gtin}</span>}</div></div>
            <div className={styles.switchWrap}>
              <span>{product.effectiveVisible ? "Live" : "Hidden"}</span>
              <label className={styles.switch} title={product.canToggleVisibility ? "Ενεργοποίηση / απενεργοποίηση προϊόντος" : "Η κατάσταση ελέγχεται από την πλατφόρμα"}>
                <input type="checkbox" checked={product.productVisible} disabled={!product.canToggleVisibility || Boolean(busy)} onChange={(event) => void call(`product:${product.offerId}`, "/api/vendor/catalog/visibility", { scope: "product", offerId: product.offerId, visible: event.target.checked }, "PUT")} />
                <span className={styles.slider} />
              </label>
            </div>
          </div>
          {!product.effectiveVisible && <p className={styles.visibilityReason}>{hiddenReason || "Το προϊόν δεν είναι αυτή τη στιγμή δημόσια ορατό."}</p>}
          <div className={styles.badges}>{product.availableToSell <= 0 ? <span className={`${styles.badge} ${styles.badgeOff}`}>Χωρίς stock</span> : isLowStock(product) ? <span className={`${styles.badge} ${styles.badgeWarn}`}>Χαμηλό stock</span> : <span className={styles.badge}>Stock OK</span>}{product.blocked > 0 && <span className={`${styles.badge} ${styles.badgeWarn}`}>{product.blocked} blocked</span>}{!product.canToggleVisibility && <span className={`${styles.badge} ${styles.badgeOff}`}>Platform control</span>}</div>
          <div className={styles.facts}>
            <div className={styles.fact}><span>Τιμή</span><strong>{product.retailPrice}</strong></div>
            <div className={styles.fact}><span>On hand</span><strong>{product.onHand}</strong></div>
            <div className={styles.fact}><span>Δεσμευμένα</span><strong>{product.reserved}</strong></div>
            <div className={styles.fact}><span>Διαθέσιμα</span><strong>{product.availableToSell}</strong></div>
          </div>
          <div className={styles.stockEditor}>
            <div className={styles.field}><label htmlFor={`onhand-${product.offerId}`}>On hand</label><input id={`onhand-${product.offerId}`} type="number" min={product.reserved} step="1" value={draft.onHand} onChange={(event) => setStockDrafts((current) => ({ ...current, [product.offerId]: { ...draft, onHand: event.target.value } }))} /></div>
            <div className={styles.field}><label htmlFor={`safety-${product.offerId}`}>Safety stock</label><input id={`safety-${product.offerId}`} type="number" min="0" step="1" value={draft.safetyStock} onChange={(event) => setStockDrafts((current) => ({ ...current, [product.offerId]: { ...draft, safetyStock: event.target.value } }))} /></div>
            <button className={`button ${styles.saveButton}`} type="button" disabled={busy === `inventory:${product.offerId}`} onClick={() => void call(`inventory:${product.offerId}`, "/api/vendor/catalog/inventory", { offerId: product.offerId, onHand: Number(draft.onHand), safetyStock: Number(draft.safetyStock) }, "PUT")}>{busy === `inventory:${product.offerId}` ? "Αποθήκευση…" : "Αποθήκευση"}</button>
          </div>
          <div className={styles.cardFoot}><span>{product.offerId}</span><span>Ενημέρωση {when(product.updatedAt)}</span></div>
        </article>;
      })}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Add products" title="Προσθήκη προϊόντος" note="Η τιμή είναι η τελική τιμή πώλησης στον πελάτη. Διάλεξε σωστή κατηγορία ώστε τα φίλτρα και το matching να λειτουργούν σωστά." />
      <details className="workspace-tool-panel" open>
        <summary><span><strong>Χειροκίνητη καταχώρηση</strong><small>Δημιουργεί draft για matching και έγκριση.</small></span></summary>
        <div className="workspace-tool-body">
          <form onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const priceEuro = Number(form.get("priceEuro"));
            void call("create", "/api/vendor/catalog/products", {
              title: form.get("title"), categoryCode: form.get("category"), vendorSku: form.get("sku"), brand: form.get("brand"), model: form.get("model"), gtin: form.get("gtin"),
              customerPriceMinor: Math.round(priceEuro * 100), stockOnHand: Number(form.get("stock")), safetyStock: Number(form.get("safety"))
            });
          }}>
            <div className="workspace-form-grid">
              <div className="workspace-form-field span-2"><label htmlFor="catalog-title">Τίτλος προϊόντος</label><input id="catalog-title" name="title" required /></div>
              <div className="workspace-form-field span-2"><label htmlFor="catalog-category">Κατηγορία</label><select id="catalog-category" name="category" required defaultValue=""><option value="" disabled>Επίλεξε κατηγορία</option>{initial.categoryOptions.map((item) => <option key={item.id} value={item.code}>{item.path}</option>)}</select></div>
              <div className="workspace-form-field"><label htmlFor="catalog-sku">Δικό σου SKU</label><input id="catalog-sku" name="sku" /></div>
              <div className="workspace-form-field"><label htmlFor="catalog-brand">Brand</label><input id="catalog-brand" name="brand" /></div>
              <div className="workspace-form-field"><label htmlFor="catalog-model">Model</label><input id="catalog-model" name="model" autoComplete="off" /></div>
              <div className="workspace-form-field"><label htmlFor="catalog-gtin">GTIN / EAN / ISBN</label><input id="catalog-gtin" name="gtin" inputMode="numeric" autoComplete="off" placeholder="π.χ. 9781408855652" /></div>
              <div className="workspace-form-field"><label htmlFor="catalog-price">Τελική τιμή €</label><input id="catalog-price" name="priceEuro" required type="number" min="0" step="0.01" placeholder="44.90" /></div>
              <div className="workspace-form-field"><label htmlFor="catalog-stock">On hand</label><input id="catalog-stock" name="stock" required type="number" min="0" step="1" /></div>
              <div className="workspace-form-field"><label htmlFor="catalog-safety">Safety stock</label><input id="catalog-safety" name="safety" type="number" min="0" step="1" defaultValue="0" /></div>
            </div>
            <div className="workspace-form-actions"><button className="button" disabled={busy === "create"}>{busy === "create" ? "Αποθήκευση…" : "Αποθήκευση draft"}</button></div>
          </form>
        </div>
      </details>
      <details className="workspace-tool-panel"><summary><span><strong>Μαζική εισαγωγή CSV</strong><small>Advanced εργαλείο · dry-run πριν την εισαγωγή.</small></span></summary><div className="workspace-tool-body">
        <div className="workspace-form-field"><label htmlFor="catalog-csv">CSV data</label><textarea id="catalog-csv" className="vendor-csv" value={csv} onChange={(event) => { setCsv(event.target.value); setPreview(null); }} /></div>
        <div className="workspace-form-actions"><button type="button" className="button button-secondary" onClick={() => void call("preview", "/api/vendor/catalog/import", { csv, confirm: false })} disabled={Boolean(busy)}>Dry-run</button><button type="button" className="button" onClick={() => void call("commit", "/api/vendor/catalog/import", { csv, confirm: true })} disabled={Boolean(busy) || !canConfirmImport}>Confirm import</button></div>
        {preview && <div className="vendor-preview"><strong>{preview.totalRows} rows · {preview.errors.length} errors</strong>{preview.errors.map((item, index) => <span key={`${item.rowNumber}:${item.field ?? index}`}>Row {item.rowNumber}{item.field ? ` · ${item.field}` : ""}: {item.message}</span>)}{preview.errors.length === 0 && preview.totalRows > 0 && <span>Το preview είναι καθαρό. Μπορείς να επιβεβαιώσεις την εισαγωγή.</span>}</div>}
      </div></details>
    </div></section>

    <section className="shell vendor-section"><WorkspaceSectionHeading eyebrow="Product Matching Centre" title="Onboarding & matching" note="Εδώ βρίσκονται μόνο οι εγγραφές που περνούν από matching/έγκριση — όχι ο live κατάλογος." />
      <WorkspaceMetricStrip items={[{ label: "Source records", value: initial.submissions.length },{ label: "Needs review", value: awaitingReview, tone: awaitingReview ? "attention" : "default" },{ label: "Linked", value: linked, tone: linked ? "positive" : "default" },{ label: "Rejected", value: rejected, tone: rejected ? "attention" : "default" }]} />
      {initial.submissions.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν εκκρεμείς source products." body="Αυτό είναι φυσιολογικό όταν τα προϊόντα έχουν ήδη εγκριθεί." /> : <div className="workspace-queue-list">{initial.submissions.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head"><div><strong>{item.title}</strong><small>{item.vendorSku ?? "Χωρίς SKU"} · {item.categoryCode} · {when(item.updatedAt)}</small></div><span className="status-pill">{item.status}</span></div>
        <div className="workspace-queue-primary"><span>Τελική τιμή {item.supplierPrice}</span><span>Stock {item.stockOnHand}</span><span>{item.canonicalVariantId ? "Linked" : `${item.candidates.length} candidates`}</span></div>
        {item.rejectionReason && <p className="workspace-queue-summary">{item.rejectionReason}</p>}
        <WorkspaceRecordDetails label="Matching evidence & technical details" open={item.status === "rejected"}><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Source product</strong><span>{item.id}</span></div>{item.canonicalVariantId && <div className="workspace-compact-row"><strong>Canonical variant</strong><span>{item.canonicalVariantId}</span></div>}{item.candidates.map((candidate) => <div className="workspace-compact-row" key={candidate.id}><strong>{candidate.canonicalTitle}</strong><span>{candidate.level} · {(candidate.confidence * 100).toFixed(0)}%</span><small>{candidate.status}</small></div>)}</div></WorkspaceRecordDetails>
        <div className="workspace-action-bar"><span>Το matching και η έγκριση offer ελέγχονται από την πλατφόρμα.</span><div className="workspace-action-buttons">{item.status === "draft" && <button className="button" disabled={Boolean(busy)} onClick={() => void call(`submit:${item.id}`, `/api/vendor/catalog/products/${item.id}/submit`, {})}>{busy === `submit:${item.id}` ? "Υποβολή…" : "Υποβολή"}</button>}</div></div>
      </article>)}</div>}
    </section>
  </>;
}
