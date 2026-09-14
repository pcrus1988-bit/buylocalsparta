"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { useCart, type CartItem } from "./CartProvider";
import styles from "./CartDrawer.module.css";

function formatMoney(minor: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

function itemMeta(item: CartItem): string | undefined {
  return [item.color, item.size].filter(Boolean).join(" · ") || undefined;
}

function itemCountLabel(count: number): string {
  return `${count} ${count === 1 ? "προϊόν" : "προϊόντα"}`;
}

function CartLine({ item }: { item: CartItem }) {
  const { setQuantity, removeItem } = useCart();
  const meta = itemMeta(item);

  return (
    <article className={styles.line}>
      <div className={styles.thumb} aria-hidden={!item.imageUrl}>
        {item.imageUrl ? <img src={item.imageUrl} alt={item.imageAlt ?? item.title} loading="lazy" /> : <span>ΚΜ</span>}
      </div>
      <div className={styles.lineBody}>
        <div className={styles.lineTop}>
          <div>
            <strong>{item.title}</strong>
            {meta ? <span className={styles.meta}>{meta}</span> : null}
          </div>
          <strong className={styles.price}>{formatMoney(item.priceMinor * item.quantity)}</strong>
        </div>
        <div className={styles.lineBottom}>
          <div className={styles.quantity} aria-label={`Ποσότητα για ${item.title}`}>
            <button type="button" onClick={() => setQuantity(item.canonicalVariantId, item.quantity - 1)} aria-label="Μείωση ποσότητας">−</button>
            <span aria-live="polite">{item.quantity}</span>
            <button type="button" onClick={() => setQuantity(item.canonicalVariantId, item.quantity + 1)} aria-label="Αύξηση ποσότητας">+</button>
          </div>
          <button className={styles.remove} type="button" onClick={() => removeItem(item.canonicalVariantId)}>Αφαίρεση</button>
        </div>
      </div>
    </article>
  );
}

export function CartDrawer() {
  const { items, count, subtotalMinor, isCartOpen, closeCart, detailsReady } = useCart();
  const [mounted, setMounted] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const touchStartX = useRef<number>();

  const groups = useMemo(() => {
    const local: CartItem[] = [];
    const partner: CartItem[] = [];
    for (const item of items) {
      if (item.fulfilmentKind === "partner") partner.push(item);
      else local.push(item);
    }
    return { local, partner };
  }, [items]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isCartOpen) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCart();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [closeCart, isCartOpen]);

  const onTouchStart = (event: TouchEvent<HTMLElement>) => {
    touchStartX.current = event.changedTouches[0]?.clientX;
  };
  const onTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = touchStartX.current;
    touchStartX.current = undefined;
    const end = event.changedTouches[0]?.clientX;
    if (start !== undefined && end !== undefined && end - start > 90) closeCart();
  };

  if (!mounted) return null;

  return createPortal(
    <div className={`${styles.root}${isCartOpen ? ` ${styles.open}` : ""}`} aria-hidden={!isCartOpen}>
      <button className={styles.backdrop} type="button" tabIndex={isCartOpen ? 0 : -1} aria-label="Κλείσιμο καλαθιού" onClick={closeCart} />
      <aside
        id="global-cart-drawer"
        className={styles.panel}
        role="dialog"
        aria-modal={isCartOpen ? "true" : undefined}
        aria-labelledby="global-cart-drawer-title"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>ΚΟΝΤΑ ΜΟΥ</span>
            <h2 id="global-cart-drawer-title">Το καλάθι σου · {itemCountLabel(count)}</h2>
          </div>
          <button ref={closeButtonRef} className={styles.close} type="button" onClick={closeCart} aria-label="Κλείσιμο καλαθιού">×</button>
        </header>

        <div className={styles.content}>
          {!detailsReady && items.length ? <div className={styles.loading} role="status">Φορτώνουμε τις λεπτομέρειες του καλαθιού…</div> : null}
          {!items.length ? (
            <div className={styles.empty}>
              <span aria-hidden="true">🛍️</span>
              <strong>Το καλάθι σου είναι άδειο.</strong>
              <p>Συνέχισε την περιήγηση και πρόσθεσε προϊόντα χωρίς να χάσεις τη θέση σου.</p>
              <button type="button" onClick={closeCart}>Συνέχεια αγορών</button>
            </div>
          ) : (
            <>
              {groups.local.length ? (
                <section className={styles.group} aria-labelledby="cart-local-group">
                  <div className={styles.groupHeading}>
                    <div><strong id="cart-local-group">ΚΟΝΤΑ ΣΟΥ — Σπάρτη</strong><span>Τοπικά προϊόντα και διαθέσιμες επιλογές εκπλήρωσης</span></div>
                    <span>{itemCountLabel(groups.local.reduce((sum, item) => sum + item.quantity, 0))}</span>
                  </div>
                  <div className={styles.lines}>{groups.local.map((item) => <CartLine key={item.canonicalVariantId} item={item} />)}</div>
                </section>
              ) : null}

              {groups.partner.length ? (
                <section className={styles.group} aria-labelledby="cart-partner-group">
                  <div className={styles.groupHeading}>
                    <div><strong id="cart-partner-group">Αποστολή συνεργάτη</strong><span>Αποστολή από συνεργαζόμενο προμηθευτή</span></div>
                    <span>{itemCountLabel(groups.partner.reduce((sum, item) => sum + item.quantity, 0))}</span>
                  </div>
                  <div className={styles.lines}>{groups.partner.map((item) => <CartLine key={item.canonicalVariantId} item={item} />)}</div>
                </section>
              ) : null}
            </>
          )}
        </div>

        {items.length ? (
          <footer className={styles.footer}>
            <div className={styles.summaryRow}><span>Προϊόντα</span><strong>{formatMoney(subtotalMinor)}</strong></div>
            <div className={styles.summaryRow}><span>Μεταφορικά</span><span>Υπολογίζονται στο checkout</span></div>
            <div className={`${styles.summaryRow} ${styles.total}`}><span>Σύνολο προϊόντων</span><strong>{formatMoney(subtotalMinor)}</strong></div>
            <Link className={styles.checkout} href="/checkout" onClick={closeCart}>Ολοκλήρωση αγοράς</Link>
            <Link className={styles.fullCart} href="/cart" onClick={closeCart}>Προβολή πλήρους καλαθιού</Link>
          </footer>
        ) : null}
      </aside>
    </div>,
    document.body
  );
}
