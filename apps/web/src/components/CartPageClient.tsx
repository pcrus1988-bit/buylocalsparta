"use client";

import { useCart } from "./CartProvider";

function money(minor: number) { return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100); }

export function CartPageClient() {
  const { items, subtotalMinor, hydrated, setQuantity, removeItem } = useCart();
  if (!hydrated) return <div className="empty-state"><p>Φόρτωση καλαθιού…</p></div>;
  if (items.length === 0) return <div className="empty-state"><div className="eyebrow">Το καλάθι είναι άδειο</div><h2>Βρες κάτι καλό στη Σπάρτη.</h2><p>Τα προϊόντα από διαφορετικά τοπικά καταστήματα συγκεντρώνονται σε ένα checkout.</p><a className="button" href="/shop">Πήγαινε στις αγορές</a></div>;
  return <div className="cart-layout">
    <div className="cart-lines">
      {items.map((item) => <article className="cart-line" key={item.canonicalVariantId}>
        <div className="cart-thumb"><span>{item.title.slice(0, 2).toUpperCase()}</span></div>
        <div className="cart-line-main"><h2>{item.title}</h2><p>Η ανάθεση καταστήματος οριστικοποιείται από τη λογική Fair Vendor Exposure στο checkout· το backend παραμένει η πηγή αλήθειας για διαθεσιμότητα και προμηθευτή.</p><button className="text-button" onClick={() => removeItem(item.canonicalVariantId)}>Αφαίρεση</button></div>
        <div className="cart-line-controls"><label htmlFor={`qty-${item.canonicalVariantId}`}>Ποσότητα</label><select id={`qty-${item.canonicalVariantId}`} value={item.quantity} onChange={(event) => setQuantity(item.canonicalVariantId, Number(event.target.value))}>{Array.from({ length: 99 }, (_, i) => i + 1).map((qty) => <option key={qty} value={qty}>{qty}</option>)}</select><strong>{money(item.priceMinor * item.quantity)}</strong></div>
      </article>)}
    </div>
    <aside className="order-summary"><div className="eyebrow">Σύνοψη</div><h2>{money(subtotalMinor)}</h2><div className="summary-row"><span>Προϊόντα</span><strong>{money(subtotalMinor)}</strong></div><div className="summary-row"><span>Παράδοση</span><strong>Υπολογίζεται στο checkout</strong></div><p>Μία πληρωμή προς το Buy Local Sparta. Η παραγγελία διαχωρίζεται ιδιωτικά στους συνεργάτες εκπλήρωσης.</p><a className="button summary-cta" href="/checkout">Συνέχεια στο checkout</a><a className="text-link" href="/shop">← Συνέχεια αγορών</a></aside>
  </div>;
}
