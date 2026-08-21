"use client";

import Link from "next/link";
import { useState } from "react";
import { STOREFRONT_CATEGORIES, categoryCodeMatches } from "../lib/storefront-taxonomy";
import { CustomerHowItWorks } from "./CustomerAccountPrimitives";

type ProductAlert = Readonly<{
  backInStockEnabled: boolean;
  priceDropEnabled: boolean;
  minimumPriceDropMinor: number;
}>;
type SavedProduct = Readonly<{
  canonicalVariantId: string;
  title?: string;
  price?: string;
  available?: boolean;
  unavailable?: boolean;
  alert?: ProductAlert | null;
}>;
type SavedSearch = Readonly<{
  id: string;
  name: string;
  alertsEnabled: boolean;
  lastObservedCount: number;
  query: Readonly<{ q: string; categoryCode?: string; availability?: "any" | "in_stock" | "pickup_today" }>;
}>;
type SearchDraft = { name: string; q: string; categoryCode: string; availability: "any" | "in_stock" };

const PRICE_DROP_THRESHOLDS = [100, 300, 500, 1000, 2000] as const;
const DEFAULT_ALERT: ProductAlert = Object.freeze({ backInStockEnabled: false, priceDropEnabled: false, minimumPriceDropMinor: 100 });

function euroMinor(value: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", maximumFractionDigits: value % 100 === 0 ? 0 : 2 }).format(value / 100);
}

function alertThresholds(alert: ProductAlert): readonly number[] {
  return [...new Set([...PRICE_DROP_THRESHOLDS, alert.minimumPriceDropMinor])].sort((a, b) => a - b);
}

function categorySlug(categoryCode?: string): string {
  if (!categoryCode) return "";
  return STOREFRONT_CATEGORIES.find((category) => categoryCodeMatches(categoryCode, category.slug))?.slug ?? "";
}

function searchHref(search: SavedSearch): string {
  const params = new URLSearchParams();
  if (search.query.q) params.set("q", search.query.q);
  const category = categorySlug(search.query.categoryCode);
  if (category) params.set("category", category);
  if (search.query.availability === "in_stock" || search.query.availability === "pickup_today") params.set("availability", "available");
  const query = params.toString();
  return query ? `/shop?${query}` : "/shop";
}

function searchSummary(search: SavedSearch): string {
  const category = STOREFRONT_CATEGORIES.find((item) => item.slug === categorySlug(search.query.categoryCode));
  const parts = [
    search.query.q ? `«${search.query.q}»` : undefined,
    category?.label,
    search.query.availability === "in_stock" || search.query.availability === "pickup_today" ? "διαθέσιμο τώρα" : undefined
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Όλη η τοπική αγορά";
}

function draftFor(search: SavedSearch): SearchDraft {
  return {
    name: search.name,
    q: search.query.q,
    categoryCode: categorySlug(search.query.categoryCode),
    availability: search.query.availability === "in_stock" || search.query.availability === "pickup_today" ? "in_stock" : "any"
  };
}

export function AccountSavedClient({ initialProducts, searches: initialSearches, csrfToken }: { initialProducts: readonly SavedProduct[]; searches: readonly SavedSearch[]; csrfToken: string }) {
  const [products, setProducts] = useState(initialProducts);
  const [searches, setSearches] = useState(initialSearches);
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState<SearchDraft | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function remove(productId: string) {
    if (busy) return;
    setBusy(`product:${productId}`);
    setError("");
    setStatus("");
    try {
      const response = await fetch(`/api/account/saved-products/${encodeURIComponent(productId)}`, { method: "DELETE", headers: { "x-csrf-token": csrfToken } });
      if (!response.ok) throw new Error("Δεν ήταν δυνατή η αφαίρεση του προϊόντος.");
      setProducts((current) => current.filter((item) => item.canonicalVariantId !== productId));
      setStatus("Το προϊόν αφαιρέθηκε από τα αποθηκευμένα.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η αφαίρεση του προϊόντος.");
    } finally {
      setBusy("");
    }
  }

  async function updateProductAlert(product: SavedProduct, patch: Partial<ProductAlert>) {
    if (busy || product.unavailable) return;
    const key = `product-alert:${product.canonicalVariantId}`;
    setBusy(key);
    setError("");
    setStatus("");
    try {
      const response = await fetch(`/api/account/saved-products/${encodeURIComponent(product.canonicalVariantId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(patch)
      });
      const payload = await response.json() as { alert?: ProductAlert; error?: string };
      if (!response.ok || !payload.alert) throw new Error(payload.error ?? "Δεν ήταν δυνατή η αλλαγή των ειδοποιήσεων προϊόντος.");
      setProducts((current) => current.map((item) => item.canonicalVariantId === product.canonicalVariantId ? { ...item, alert: payload.alert } : item));
      setStatus("Οι ειδοποιήσεις του προϊόντος ενημερώθηκαν.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η αλλαγή των ειδοποιήσεων προϊόντος.");
    } finally {
      setBusy("");
    }
  }

  function beginEdit(search: SavedSearch) {
    setEditingId(search.id);
    setDraft(draftFor(search));
    setConfirmDeleteId("");
    setError("");
    setStatus("");
  }

  function cancelEdit() {
    setEditingId("");
    setDraft(null);
  }

  async function saveSearch(search: SavedSearch) {
    if (!draft || busy) return;
    const key = `search-edit:${search.id}`;
    setBusy(key);
    setError("");
    setStatus("");
    try {
      const response = await fetch(`/api/account/saved-searches/${encodeURIComponent(search.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ action: "edit", ...draft })
      });
      const payload = await response.json() as { search?: SavedSearch; error?: string };
      if (!response.ok || !payload.search) throw new Error(payload.error ?? "Δεν ήταν δυνατή η αποθήκευση της αναζήτησης.");
      setSearches((current) => current.map((item) => item.id === search.id ? payload.search! : item));
      setEditingId("");
      setDraft(null);
      setStatus("Η αποθηκευμένη αναζήτηση ενημερώθηκε.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η αποθήκευση της αναζήτησης.");
    } finally {
      setBusy("");
    }
  }

  async function toggleSearchAlerts(search: SavedSearch) {
    if (busy) return;
    const key = `search-alerts:${search.id}`;
    setBusy(key);
    setError("");
    setStatus("");
    try {
      const response = await fetch(`/api/account/saved-searches/${encodeURIComponent(search.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ action: "alerts", alertsEnabled: !search.alertsEnabled })
      });
      const payload = await response.json() as { search?: SavedSearch; error?: string };
      if (!response.ok || !payload.search) throw new Error(payload.error ?? "Δεν ήταν δυνατή η αλλαγή των ειδοποιήσεων.");
      setSearches((current) => current.map((item) => item.id === search.id ? payload.search! : item));
      setStatus(payload.search.alertsEnabled ? "Οι ειδοποιήσεις της αναζήτησης ενεργοποιήθηκαν." : "Οι ειδοποιήσεις της αναζήτησης τέθηκαν σε παύση.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η αλλαγή των ειδοποιήσεων.");
    } finally {
      setBusy("");
    }
  }

  async function removeSearch(search: SavedSearch) {
    if (busy) return;
    const key = `search-delete:${search.id}`;
    setBusy(key);
    setError("");
    setStatus("");
    try {
      const response = await fetch(`/api/account/saved-searches/${encodeURIComponent(search.id)}`, { method: "DELETE", headers: { "x-csrf-token": csrfToken } });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Δεν ήταν δυνατή η διαγραφή της αναζήτησης.");
      setSearches((current) => current.filter((item) => item.id !== search.id));
      if (editingId === search.id) cancelEdit();
      setConfirmDeleteId("");
      setStatus("Η αποθηκευμένη αναζήτηση διαγράφηκε.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η διαγραφή της αναζήτησης.");
    } finally {
      setBusy("");
    }
  }

  return <section className="shell customer-account-page">
    <div className="customer-page-heading"><div><div className="eyebrow">Για αργότερα</div><h1>Αποθηκευμένα</h1></div><p>Προϊόντα που θέλεις να ξαναβρείς και αναζητήσεις που έχεις κρατήσει για να παρακολουθείς την αγορά.</p></div>
    {error && <p className="account-action-error" role="alert">{error}</p>}
    {status && <p className="customer-saved-status" role="status">{status}</p>}
    <div className="customer-account-grid">
      <article className="customer-account-panel">
        <div className="account-card-head"><div><div className="eyebrow">Προϊόντα</div><h2>Αποθηκευμένα προϊόντα</h2></div><span className="count-pill">{products.length}</span></div>
        {products.length ? <div className="customer-saved-product-list">{products.map((product) => {
          const alert = product.alert ?? DEFAULT_ALERT;
          const alertBusy = busy === `product-alert:${product.canonicalVariantId}`;
          return <div className="customer-saved-product-card" key={product.canonicalVariantId}>
            <div className="customer-account-panel-row customer-saved-product-head">
              <div><Link href={`/product/${product.canonicalVariantId}`}><strong>{product.title ?? "Αποθηκευμένο προϊόν"}</strong></Link><small>{product.price ?? ""} · {product.available ? "διαθέσιμο" : product.unavailable ? "δεν εμφανίζεται πλέον" : "μη διαθέσιμο"}</small></div>
              <button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => void remove(product.canonicalVariantId)}>{busy === `product:${product.canonicalVariantId}` ? "Αφαίρεση…" : "Αφαίρεση"}</button>
            </div>
            {product.unavailable ? <p className="customer-saved-product-unavailable">Οι ειδοποιήσεις δεν μπορούν να αλλάξουν όσο το προϊόν δεν υπάρχει στον ενεργό κατάλογο.</p> : <div className="customer-product-alerts" aria-label={`Ειδοποιήσεις για ${product.title ?? "αποθηκευμένο προϊόν"}`}>
              <label className="customer-product-alert-option"><input type="checkbox" checked={alert.backInStockEnabled} disabled={Boolean(busy)} onChange={(event) => void updateProductAlert(product, { backInStockEnabled: event.target.checked })} /><span><strong>Ξανά διαθέσιμο</strong><small>Ενημέρωσέ με όταν το προϊόν επιστρέψει σε διαθέσιμο απόθεμα.</small></span></label>
              <label className="customer-product-alert-option"><input type="checkbox" checked={alert.priceDropEnabled} disabled={Boolean(busy)} onChange={(event) => void updateProductAlert(product, { priceDropEnabled: event.target.checked })} /><span><strong>Πτώση τιμής</strong><small>Ενημέρωσέ με όταν η τιμή πέσει τουλάχιστον όσο το όριο που επιλέγω.</small></span></label>
              <label className="customer-price-drop-threshold"><span>Ελάχιστη πτώση τιμής</span><select value={alert.minimumPriceDropMinor} disabled={Boolean(busy) || !alert.priceDropEnabled} onChange={(event) => void updateProductAlert(product, { minimumPriceDropMinor: Number(event.target.value) })}>{alertThresholds(alert).map((value) => <option value={value} key={value}>{euroMinor(value)}</option>)}</select></label>
              {alertBusy && <small className="customer-alert-saving" role="status">Αποθήκευση ρύθμισης…</small>}
            </div>}
          </div>;
        })}</div> : <div className="account-empty"><p>Δεν έχεις αποθηκεύσει προϊόντα.</p><Link className="text-link" href="/shop">Ανακάλυψε προϊόντα →</Link></div>}
        <CustomerHowItWorks title="Τι γίνεται όταν αποθηκεύω προϊόν;"><p>Το προϊόν μένει στη λίστα σου για να το βρίσκεις ξανά εύκολα. Εσύ επιλέγεις χωριστά αν θέλεις ειδοποίηση όταν επιστρέψει σε απόθεμα ή όταν πέσει η τιμή. Κάθε αλλαγή ρύθμισης χρησιμοποιεί την τωρινή διαθεσιμότητα και τιμή ως νέο σημείο αναφοράς, ώστε να μη λάβεις αμέσως ειδοποίηση για κάτι που ήδη ίσχυε.</p></CustomerHowItWorks>
      </article>
      <article className="customer-account-panel">
        <div className="account-card-head"><div><div className="eyebrow">Αναζητήσεις</div><h2>Αποθηκευμένες αναζητήσεις</h2></div><span className="count-pill">{searches.length}</span></div>
        {searches.length ? <div className="customer-saved-search-list">{searches.map((search) => <div className="customer-saved-search-card" key={search.id}>
          <div className="customer-saved-search-head">
            <div><Link href={searchHref(search)}><strong>{search.name}</strong></Link><small>{search.lastObservedCount} αποτελέσματα · {searchSummary(search)}</small></div>
            <span className={`status-pill${search.alertsEnabled ? "" : " is-muted"}`}>Ειδοποιήσεις {search.alertsEnabled ? "ενεργές" : "σε παύση"}</span>
          </div>
          {editingId === search.id && draft ? <div className="customer-saved-search-editor" aria-label={`Επεξεργασία ${search.name}`}>
            <label><span>Όνομα αναζήτησης</span><input value={draft.name} maxLength={100} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label><span>Τι ψάχνεις;</span><input value={draft.q} maxLength={160} placeholder="π.χ. ακουστικά, φόρεμα, φωτιστικό" onChange={(event) => setDraft({ ...draft, q: event.target.value })} /></label>
            <label><span>Κατηγορία</span><select value={draft.categoryCode} onChange={(event) => setDraft({ ...draft, categoryCode: event.target.value })}><option value="">Όλες οι κατηγορίες</option>{STOREFRONT_CATEGORIES.map((category) => <option key={category.slug} value={category.slug}>{category.label}</option>)}</select></label>
            <label><span>Διαθεσιμότητα</span><select value={draft.availability} onChange={(event) => setDraft({ ...draft, availability: event.target.value as SearchDraft["availability"] })}><option value="any">Οποιαδήποτε</option><option value="in_stock">Διαθέσιμο τώρα</option></select></label>
            <div className="customer-saved-search-editor-actions"><button className="button" type="button" disabled={Boolean(busy)} onClick={() => void saveSearch(search)}>{busy === `search-edit:${search.id}` ? "Αποθήκευση…" : "Αποθήκευση αλλαγών"}</button><button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={cancelEdit}>Άκυρο</button></div>
          </div> : <div className="customer-saved-search-actions">
            <Link className="text-link" href={searchHref(search)}>Αποτελέσματα →</Link>
            <button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => beginEdit(search)}>Επεξεργασία</button>
            <button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => void toggleSearchAlerts(search)}>{busy === `search-alerts:${search.id}` ? "Ενημέρωση…" : search.alertsEnabled ? "Παύση ειδοποιήσεων" : "Ενεργοποίηση ειδοποιήσεων"}</button>
            {confirmDeleteId === search.id ? <span className="customer-saved-search-confirm"><span>Να διαγραφεί οριστικά;</span><button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => void removeSearch(search)}>{busy === `search-delete:${search.id}` ? "Διαγραφή…" : "Ναι, διαγραφή"}</button><button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => setConfirmDeleteId("")}>Άκυρο</button></span> : <button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => setConfirmDeleteId(search.id)}>Διαγραφή</button>}
          </div>}
        </div>)}</div> : <div className="account-empty"><p>Δεν έχεις αποθηκευμένες αναζητήσεις.</p><Link className="text-link" href="/shop">Ξεκίνα αναζήτηση →</Link></div>}
        <CustomerHowItWorks title="Πώς λειτουργούν οι αποθηκευμένες αναζητήσεις;"><p>Κρατούν το όνομα και τα κριτήρια που επέλεξες. Μπορείς να αλλάξεις αναζήτηση, κατηγορία ή διαθεσιμότητα, να παύσεις προσωρινά τις ειδοποιήσεις ή να διαγράψεις την αναζήτηση. Όταν αλλάζεις κριτήρια ή ενεργοποιείς ξανά ειδοποιήσεις, τα τωρινά αποτελέσματα γίνονται το νέο σημείο αναφοράς ώστε να μη λάβεις παλιές αντιστοιχίσεις ως νέες.</p></CustomerHowItWorks>
      </article>
    </div>
  </section>;
}
