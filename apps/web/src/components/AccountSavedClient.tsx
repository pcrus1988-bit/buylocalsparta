"use client";

import Link from "next/link";
import { useState } from "react";
import { CustomerHowItWorks } from "./CustomerAccountPrimitives";

type SavedProduct = Readonly<{ canonicalVariantId: string; title?: string; price?: string; available?: boolean; unavailable?: boolean }>;
type SavedSearch = Readonly<{ id: string; name: string; alertsEnabled: boolean; lastObservedCount: number }>;

export function AccountSavedClient({ initialProducts, searches, csrfToken }: { initialProducts: readonly SavedProduct[]; searches: readonly SavedSearch[]; csrfToken: string }) {
  const [products, setProducts] = useState(initialProducts);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function remove(productId: string) {
    setBusy(productId);
    setError("");
    try {
      const response = await fetch(`/api/account/saved-products/${encodeURIComponent(productId)}`, { method: "DELETE", headers: { "x-csrf-token": csrfToken } });
      if (!response.ok) throw new Error("Δεν ήταν δυνατή η αφαίρεση του προϊόντος.");
      setProducts((current) => current.filter((item) => item.canonicalVariantId !== productId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η αφαίρεση του προϊόντος.");
    } finally {
      setBusy("");
    }
  }

  return <section className="shell customer-account-page">
    <div className="customer-page-heading"><div><div className="eyebrow">Για αργότερα</div><h1>Αποθηκευμένα</h1></div><p>Προϊόντα που θέλεις να ξαναβρείς και αναζητήσεις που έχεις κρατήσει για να παρακολουθείς την αγορά.</p></div>
    {error && <p className="account-action-error" role="alert">{error}</p>}
    <div className="customer-account-grid">
      <article className="customer-account-panel">
        <div className="account-card-head"><div><div className="eyebrow">Προϊόντα</div><h2>Αποθηκευμένα προϊόντα</h2></div><span className="count-pill">{products.length}</span></div>
        {products.length ? <div className="customer-account-panel-list">{products.map((product) => <div className="customer-account-panel-row" key={product.canonicalVariantId}>
          <div><Link href={`/product/${product.canonicalVariantId}`}><strong>{product.title ?? "Αποθηκευμένο προϊόν"}</strong></Link><small>{product.price ?? ""} · {product.available ? "διαθέσιμο" : product.unavailable ? "δεν εμφανίζεται πλέον" : "μη διαθέσιμο"}</small></div>
          <button className="text-button" type="button" disabled={busy === product.canonicalVariantId} onClick={() => void remove(product.canonicalVariantId)}>{busy === product.canonicalVariantId ? "Αφαίρεση…" : "Αφαίρεση"}</button>
        </div>)}</div> : <div className="account-empty"><p>Δεν έχεις αποθηκεύσει προϊόντα.</p><Link className="text-link" href="/shop">Ανακάλυψε προϊόντα →</Link></div>}
        <CustomerHowItWorks title="Τι γίνεται όταν αποθηκεύω προϊόν;"><p>Το προϊόν παραμένει στη λίστα σου ώστε να το βρίσκεις ξανά εύκολα. Όπου υποστηρίζεται, η πλατφόρμα μπορεί επίσης να χρησιμοποιεί αυτή την επιλογή για ειδοποιήσεις διαθεσιμότητας ή πτώσης τιμής.</p></CustomerHowItWorks>
      </article>
      <article className="customer-account-panel">
        <div className="account-card-head"><div><div className="eyebrow">Αναζητήσεις</div><h2>Αποθηκευμένες αναζητήσεις</h2></div><span className="count-pill">{searches.length}</span></div>
        {searches.length ? <div className="customer-account-panel-list">{searches.map((search) => <div className="customer-account-panel-row" key={search.id}><div><strong>{search.name}</strong><small>{search.lastObservedCount} αποτελέσματα</small></div><span className="status-pill">Ειδοποιήσεις {search.alertsEnabled ? "ενεργές" : "ανενεργές"}</span></div>)}</div> : <div className="account-empty"><p>Δεν έχεις αποθηκευμένες αναζητήσεις.</p><Link className="text-link" href="/shop">Ξεκίνα αναζήτηση →</Link></div>}
        <CustomerHowItWorks title="Πώς λειτουργούν οι αποθηκευμένες αναζητήσεις;"><p>Κρατούν τα κριτήρια που επέλεξες ώστε να μπορείς να επιστρέψεις αργότερα. Η πλήρης διαχείριση των κριτηρίων και των ειδοποιήσεων θα γίνεται από την ίδια την αναζήτηση.</p></CustomerHowItWorks>
      </article>
    </div>
  </section>;
}
