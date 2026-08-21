"use client";

import Link from "next/link";
import { useState } from "react";
import { CustomerHowItWorks } from "./CustomerAccountPrimitives";

type SavedProduct = Readonly<{ canonicalVariantId: string; title?: string; price?: string; available?: boolean; unavailable?: boolean }>;
type SavedSearch = Readonly<{
  id: string;
  name: string;
  alertsEnabled: boolean;
  lastObservedCount: number;
  query: Readonly<{ q: string; categoryCode?: string; availability?: "any" | "in_stock" | "pickup_today" }>;
}>;

function searchHref(search: SavedSearch): string {
  const params = new URLSearchParams();
  if (search.query.q) params.set("q", search.query.q);
  if (search.query.categoryCode) params.set("category", search.query.categoryCode);
  if (search.query.availability === "in_stock" || search.query.availability === "pickup_today") params.set("availability", "available");
  const query = params.toString();
  return query ? `/shop?${query}` : "/shop";
}

export function AccountSavedClient({ initialProducts, searches: initialSearches, csrfToken }: { initialProducts: readonly SavedProduct[]; searches: readonly SavedSearch[]; csrfToken: string }) {
  const [products, setProducts] = useState(initialProducts);
  const [searches, setSearches] = useState(initialSearches);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function remove(productId: string) {
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

  async function toggleSearchAlerts(search: SavedSearch) {
    const key = `search-toggle:${search.id}`;
    setBusy(key);
    setError("");
    setStatus("");
    try {
      const response = await fetch(`/api/account/saved-searches/${encodeURIComponent(search.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ alertsEnabled: !search.alertsEnabled })
      });
      const payload = await response.json() as { search?: SavedSearch; error?: string };
      if (!response.ok || !payload.search) throw new Error(payload.error ?? "Δεν ήταν δυνατή η αλλαγή των ειδοποιήσεων.");
      setSearches((current) => current.map((item) => item.id === search.id ? { ...item, ...payload.search } : item));
      setStatus(payload.search.alertsEnabled ? "Οι ειδοποιήσεις της αναζήτησης ενεργοποιήθηκαν." : "Οι ειδοποιήσεις της αναζήτησης απενεργοποιήθηκαν.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η αλλαγή των ειδοποιήσεων.");
    } finally {
      setBusy("");
    }
  }

  async function removeSearch(search: SavedSearch) {
    const key = `search-remove:${search.id}`;
    setBusy(key);
    setError("");
    setStatus("");
    try {
      const response = await fetch(`/api/account/saved-searches/${encodeURIComponent(search.id)}`, { method: "DELETE", headers: { "x-csrf-token": csrfToken } });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Δεν ήταν δυνατή η διαγραφή της αναζήτησης.");
      setSearches((current) => current.filter((item) => item.id !== search.id));
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
    {status && <p className="privacy-status" role="status">{status}</p>}
    <div className="customer-account-grid">
      <article className="customer-account-panel">
        <div className="account-card-head"><div><div className="eyebrow">Προϊόντα</div><h2>Αποθηκευμένα προϊόντα</h2></div><span className="count-pill">{products.length}</span></div>
        {products.length ? <div className="customer-account-panel-list">{products.map((product) => <div className="customer-account-panel-row" key={product.canonicalVariantId}>
          <div><Link href={`/product/${product.canonicalVariantId}`}><strong>{product.title ?? "Αποθηκευμένο προϊόν"}</strong></Link><small>{product.price ?? ""} · {product.available ? "διαθέσιμο" : product.unavailable ? "δεν εμφανίζεται πλέον" : "μη διαθέσιμο"}</small></div>
          <button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => void remove(product.canonicalVariantId)}>{busy === `product:${product.canonicalVariantId}` ? "Αφαίρεση…" : "Αφαίρεση"}</button>
        </div>)}</div> : <div className="account-empty"><p>Δεν έχεις αποθηκεύσει προϊόντα.</p><Link className="text-link" href="/shop">Ανακάλυψε προϊόντα →</Link></div>}
        <CustomerHowItWorks title="Τι γίνεται όταν αποθηκεύω προϊόν;"><p>Το προϊόν παραμένει στη λίστα σου ώστε να το βρίσκεις ξανά εύκολα. Όπου υποστηρίζεται, η πλατφόρμα μπορεί επίσης να χρησιμοποιεί αυτή την επιλογή για ειδοποιήσεις διαθεσιμότητας ή πτώσης τιμής.</p></CustomerHowItWorks>
      </article>
      <article className="customer-account-panel">
        <div className="account-card-head"><div><div className="eyebrow">Αναζητήσεις</div><h2>Αποθηκευμένες αναζητήσεις</h2></div><span className="count-pill">{searches.length}</span></div>
        {searches.length ? <div className="customer-account-panel-list">{searches.map((search) => <div className="customer-account-panel-row customer-saved-search-row" key={search.id}>
          <div><Link href={searchHref(search)}><strong>{search.name}</strong></Link><small>{search.lastObservedCount} αποτελέσματα · ειδοποιήσεις {search.alertsEnabled ? "ενεργές" : "ανενεργές"}</small></div>
          <div className="customer-saved-search-actions">
            <Link className="text-link" href={searchHref(search)}>Αποτελέσματα →</Link>
            <button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => void toggleSearchAlerts(search)}>{busy === `search-toggle:${search.id}` ? "Ενημέρωση…" : search.alertsEnabled ? "Παύση ειδοποιήσεων" : "Ενεργοποίηση ειδοποιήσεων"}</button>
            <button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => void removeSearch(search)}>{busy === `search-remove:${search.id}` ? "Διαγραφή…" : "Διαγραφή"}</button>
          </div>
        </div>)}</div> : <div className="account-empty"><p>Δεν έχεις αποθηκευμένες αναζητήσεις.</p><Link className="text-link" href="/shop">Ξεκίνα αναζήτηση →</Link></div>}
        <CustomerHowItWorks title="Πώς λειτουργούν οι αποθηκευμένες αναζητήσεις;"><p>Κρατούν τα κριτήρια που επέλεξες ώστε να επιστρέφεις στα ίδια αποτελέσματα. Μπορείς να παύσεις τις ειδοποιήσεις χωρίς να διαγράψεις την αναζήτηση ή να τη διαγράψεις οριστικά όταν δεν τη χρειάζεσαι.</p></CustomerHowItWorks>
      </article>
    </div>
  </section>;
}
