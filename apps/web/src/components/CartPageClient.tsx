"use client";

import { useCart, type CartItem } from "./CartProvider";
import { googleAnalyticsItem, trackGoogleAnalyticsEvent } from "../lib/google-analytics-client";

function money(minor: number) { return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100); }

function trackCartDelta(eventName: "add_to_cart" | "remove_from_cart", item: CartItem, quantity: number) {
  if (quantity <= 0) return;
  trackGoogleAnalyticsEvent(eventName, {
    currency: "EUR",
    value: item.priceMinor * quantity / 100,
    items: [googleAnalyticsItem({ id: item.canonicalVariantId, name: item.title, priceMinor: item.priceMinor, quantity })],
    surface: "cart"
  });
}

export function CartPageClient() {
  const { items, count, subtotalMinor, hydrated, setQuantity, removeItem } = useCart();
  if (!hydrated) return <div className="empty-state"><p>Φόρτωση καλαθιού…</p></div>;
  if (items.length === 0) return <div className="empty-state"><div className="eyebrow">Το καλάθι σου είναι άδειο</div><h2>Βρες κάτι καλό στη Σπάρτη.</h2><p>Ό,τι διαλέξεις από τα τοπικά καταστήματα συγκεντρώνεται εδώ και ολοκληρώνεται με μία αγορά.</p><a className="button" href="/shop">Βρες προϊόντα</a></div>;

  return <div className="cart-layout cart-friendly-layout">
    <div className="cart-lines">
      <div className="cart-friendly-intro"><div><div className="eyebrow">{count} {count === 1 ? "προϊόν" : "προϊόντα"}</div><strong>Έλεγξέ τα με μια ματιά.</strong></div><span>Μέγεθος, χρώμα και κωδικοί εμφανίζονται όπου υπάρχουν στο προϊόν.</span></div>
      {items.map((item) => <article className="cart-line cart-friendly-line" key={item.canonicalVariantId}>
        <a className={`cart-thumb cart-product-thumb ${item.imageUrl ? "has-image" : ""}`} href={`/product/${encodeURIComponent(item.canonicalVariantId)}`} aria-label={`Άνοιγμα προϊόντος ${item.title}`}>
          {item.imageUrl ? <img src={item.imageUrl} alt={item.imageAlt ?? item.title} loading="lazy" /> : <span>{item.title.slice(0, 2).toUpperCase()}</span>}
        </a>
        <div className="cart-line-main">
          <h2><a href={`/product/${encodeURIComponent(item.canonicalVariantId)}`}>{item.title}</a></h2>
          <div className="cart-product-meta" aria-label="Στοιχεία προϊόντος">
            {item.size ? <span><b>Μέγεθος</b>{item.size}</span> : null}
            {item.color ? <span><b>Χρώμα</b>{item.color}</span> : null}
            {item.sku ? <span><b>SKU</b>{item.sku}</span> : null}
            {item.gtin ? <span><b>GTIN</b>{item.gtin}</span> : null}
          </div>
          <div className="cart-unit-price">{money(item.priceMinor)} / τεμ.</div>
          <button className="text-button cart-remove-button" type="button" onClick={() => {
            trackCartDelta("remove_from_cart", item, item.quantity);
            removeItem(item.canonicalVariantId);
          }}>Αφαίρεση</button>
        </div>
        <div className="cart-line-controls">
          <span className="cart-quantity-label">Ποσότητα</span>
          <div className="quantity-stepper" role="group" aria-label={`Ποσότητα για ${item.title}`}>
            <button type="button" aria-label="Μείωση ποσότητας" disabled={item.quantity <= 1} onClick={() => {
              trackCartDelta("remove_from_cart", item, 1);
              setQuantity(item.canonicalVariantId, item.quantity - 1);
            }}>−</button>
            <output aria-live="polite">{item.quantity}</output>
            <button type="button" aria-label="Αύξηση ποσότητας" disabled={item.quantity >= 99} onClick={() => {
              trackCartDelta("add_to_cart", item, 1);
              setQuantity(item.canonicalVariantId, item.quantity + 1);
            }}>+</button>
          </div>
          <strong className="cart-line-total">{money(item.priceMinor * item.quantity)}</strong>
        </div>
      </article>)}
    </div>
    <aside className="order-summary cart-friendly-summary">
      <div className="eyebrow">Η αγορά σου</div>
      <h2>{money(subtotalMinor)}</h2>
      <div className="summary-row"><span>{count === 1 ? "1 προϊόν" : `${count} προϊόντα`}</span><strong>{money(subtotalMinor)}</strong></div>
      <div className="summary-row"><span>Παράδοση</span><strong>Στο επόμενο βήμα</strong></div>
      <p>Στο checkout διαλέγεις εύκολα παραλαβή ή παράδοση και επιβεβαιώνεις τη διεύθυνσή σου. Μία αγορά, χωρίς περιττά βήματα.</p>
      <a className="button summary-cta" href="/checkout">Παράδοση & πληρωμή →</a>
      <div className="cart-trust-note">Ασφαλής πληρωμή · Το καλάθι σου παραμένει αποθηκευμένο.</div>
      <a className="text-link" href="/shop">← Συνέχεια αγορών</a>
    </aside>
  </div>;
}
