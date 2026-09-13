"use client";

import Link from "next/link";
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { googleAnalyticsItem, trackGoogleAnalyticsEvent } from "../lib/google-analytics-client";
import { useCart, type CartItem } from "./CartProvider";
import styles from "./CartDrawer.module.css";

function money(minor: number) {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

function trackCartDelta(eventName: "add_to_cart" | "remove_from_cart", item: CartItem, quantity: number) {
  if (quantity <= 0) return;
  trackGoogleAnalyticsEvent(eventName, {
    currency: "EUR",
    value: item.priceMinor * quantity / 100,
    items: [googleAnalyticsItem({ id: item.canonicalVariantId, name: item.title, priceMinor: item.priceMinor, quantity })],
    surface: "cart_drawer"
  });
}

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>;
}

function EmptyBagIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 8h12l1 13H5L6 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></svg>;
}

export function CartDrawer() {
  const { items, count, subtotalMinor, hydrated, detailsReady, cartOpen, closeCart, setQuantity, removeItem } = useCart();
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!cartOpen) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCart();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((element) => !element.hasAttribute("aria-hidden"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [cartOpen, closeCart]);

  const stopPropagation = (event: ReactKeyboardEvent<HTMLElement>) => event.stopPropagation();

  if (!cartOpen) return null;

  return (
    <div className={styles.root} data-cart-drawer="open">
      <button className={styles.backdrop} type="button" aria-label="Κλείσιμο καλαθιού" onClick={closeCart} />
      <aside
        ref={dialogRef}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        onKeyDown={stopPropagation}
      >
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Το καλάθι σου</span>
            <h2 id="cart-drawer-title">{count > 0 ? `${count} ${count === 1 ? "προϊόν" : "προϊόντα"}` : "Καλάθι"}</h2>
          </div>
          <button ref={closeButtonRef} className={styles.close} type="button" aria-label="Κλείσιμο καλαθιού" onClick={closeCart}>
            <CloseIcon />
          </button>
        </header>

        <div className={styles.content}>
          {!hydrated || !detailsReady ? (
            <div className={styles.loading} aria-busy="true" aria-live="polite">
              <span className="sr-only">Φόρτωση καλαθιού…</span>
              {[0, 1].map((key) => <div className={styles.loadingLine} key={key} aria-hidden="true"><i /><span><b /><b /></span></div>)}
            </div>
          ) : items.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}><EmptyBagIcon /></span>
              <h3>Το καλάθι σου είναι άδειο</h3>
              <p>Τα προϊόντα που επιλέγεις μένουν εδώ, χωρίς να χάνεις το σημείο που βρίσκεσαι.</p>
              <button className="button" type="button" onClick={closeCart}>Συνέχεια αγορών</button>
            </div>
          ) : (
            <div className={styles.lines}>
              {items.map((item) => (
                <article className={styles.line} key={item.canonicalVariantId}>
                  <Link className={styles.thumb} href={`/product/${encodeURIComponent(item.canonicalVariantId)}`} onClick={closeCart} aria-label={`Άνοιγμα προϊόντος ${item.title}`}>
                    {item.imageUrl ? <img src={item.imageUrl} alt={item.imageAlt ?? item.title} loading="lazy" /> : <span aria-hidden="true">{item.title.slice(0, 2).toUpperCase()}</span>}
                  </Link>
                  <div className={styles.lineMain}>
                    <Link className={styles.title} href={`/product/${encodeURIComponent(item.canonicalVariantId)}`} onClick={closeCart}>{item.title}</Link>
                    {(item.size || item.color) ? <div className={styles.meta}>{item.size ? <span>Μέγεθος: <b>{item.size}</b></span> : null}{item.color ? <span>Χρώμα: <b>{item.color}</b></span> : null}</div> : null}
                    <strong className={styles.unitPrice}>{money(item.priceMinor)}</strong>
                    <div className={styles.lineActions}>
                      <div className={styles.stepper} role="group" aria-label={`Ποσότητα για ${item.title}`}>
                        <button type="button" aria-label="Μείωση ποσότητας" onClick={() => {
                          if (item.quantity <= 1) {
                            trackCartDelta("remove_from_cart", item, 1);
                            removeItem(item.canonicalVariantId);
                            return;
                          }
                          trackCartDelta("remove_from_cart", item, 1);
                          setQuantity(item.canonicalVariantId, item.quantity - 1);
                        }}>−</button>
                        <output aria-live="polite">{item.quantity}</output>
                        <button type="button" aria-label="Αύξηση ποσότητας" disabled={item.quantity >= 99} onClick={() => {
                          trackCartDelta("add_to_cart", item, 1);
                          setQuantity(item.canonicalVariantId, item.quantity + 1);
                        }}>+</button>
                      </div>
                      <button className={styles.remove} type="button" onClick={() => {
                        trackCartDelta("remove_from_cart", item, item.quantity);
                        removeItem(item.canonicalVariantId);
                      }}>Αφαίρεση</button>
                    </div>
                  </div>
                  <strong className={styles.lineTotal}>{money(item.priceMinor * item.quantity)}</strong>
                </article>
              ))}
            </div>
          )}
        </div>

        {hydrated && detailsReady && items.length > 0 ? (
          <footer className={styles.footer}>
            <div className={styles.deliveryNote}>
              <strong>Παράδοση ή παραλαβή</strong>
              <span>Θα επιλέξεις τον τρόπο στο checkout. Το τελικό κόστος εμφανίζεται πριν από την πληρωμή.</span>
            </div>
            <div className={styles.subtotal}><span>Υποσύνολο</span><strong>{money(subtotalMinor)}</strong></div>
            <Link className={`button ${styles.checkout}`} href="/checkout" onClick={closeCart}>Παράδοση & πληρωμή →</Link>
            <div className={styles.secondaryActions}>
              <Link href="/cart" onClick={closeCart}>Προβολή καλαθιού</Link>
              <button type="button" onClick={closeCart}>Συνέχεια αγορών</button>
            </div>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
