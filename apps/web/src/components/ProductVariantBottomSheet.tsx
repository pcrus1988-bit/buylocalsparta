"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { googleAnalyticsItem, trackGoogleAnalyticsEvent } from "../lib/google-analytics-client";
import { recordProductAnalyticsEvent } from "../lib/product-analytics-client";
import { OPEN_VARIANT_PURCHASE_EVENT, type VariantPurchaseRequestDetail } from "../lib/variant-purchase-events";
import { useCart, type CartItem } from "./CartProvider";
import styles from "./ProductVariantBottomSheet.module.css";

export type MobileVariantOption = Readonly<{
  id: string;
  href: string;
  label: string;
  selected: boolean;
  unavailable: boolean;
  imageSrc?: string;
  imageAlt?: string;
  swatch?: Readonly<{ kind: "solid" | "transparent" | "multicolor"; hex?: string }>;
}>;

type ProductVariantBottomSheetProps = Readonly<{
  title: string;
  options: readonly MobileVariantOption[];
}>;

type CartCandidateResponse = Readonly<{
  item?: Omit<CartItem, "quantity">;
  error?: string;
}>;

function swatchStyle(swatch: NonNullable<MobileVariantOption["swatch"]>) {
  if (swatch.kind === "transparent") {
    return {
      backgroundColor: "#fff",
      backgroundImage: "linear-gradient(45deg,#ddd 25%,transparent 25%),linear-gradient(-45deg,#ddd 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ddd 75%),linear-gradient(-45deg,transparent 75%,#ddd 75%)",
      backgroundSize: "8px 8px",
      backgroundPosition: "0 0,0 4px,4px -4px,-4px 0"
    };
  }
  if (swatch.kind === "multicolor") return { background: "linear-gradient(90deg,#d52b2b,#f2c230,#388a55,#2f6da8,#68478d)" };
  return { backgroundColor: swatch.hex ?? "#ddd" };
}

function purchaseErrorMessage(code?: string): string {
  if (code === "variant_unavailable") return "Η επιλογή μόλις έγινε μη διαθέσιμη. Διάλεξε άλλη παραλλαγή.";
  if (code === "variant_not_found") return "Η συγκεκριμένη επιλογή δεν είναι πλέον διαθέσιμη.";
  return "Δεν μπορέσαμε να προσθέσουμε αυτή την επιλογή τώρα. Δοκίμασε ξανά.";
}

export function ProductVariantBottomSheet({ title, options }: ProductVariantBottomSheetProps) {
  const { addItem } = useCart();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [purchaseMode, setPurchaseMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string>();
  const closeRef = useRef<HTMLButtonElement>(null);
  const selected = useMemo(() => options.find((option) => option.selected), [options]);
  const chosen = useMemo(() => options.find((option) => option.id === selectedId), [options, selectedId]);

  const resetSelection = useCallback(() => {
    const preferred = options.find((option) => option.selected && !option.unavailable)
      ?? options.find((option) => !option.unavailable);
    setSelectedId(preferred?.id);
    setError(undefined);
  }, [options]);

  const openForBrowsing = useCallback(() => {
    setPurchaseMode(false);
    setAdding(false);
    resetSelection();
    setOpen(true);
  }, [resetSelection]);

  useEffect(() => setMounted(true), []);
  useEffect(() => resetSelection(), [resetSelection]);

  useEffect(() => {
    const onPurchaseRequest = (event: Event) => {
      const detail = (event as CustomEvent<VariantPurchaseRequestDetail>).detail;
      if (!detail?.source) return;
      setPurchaseMode(true);
      setAdding(false);
      resetSelection();
      setOpen(true);
    };
    window.addEventListener(OPEN_VARIANT_PURCHASE_EVENT, onPurchaseRequest);
    return () => window.removeEventListener(OPEN_VARIANT_PURCHASE_EVENT, onPurchaseRequest);
  }, [resetSelection]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !adding) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [adding, open]);

  const addSelectedVariant = useCallback(async () => {
    if (!chosen || chosen.unavailable || adding) return;
    setAdding(true);
    setError(undefined);
    try {
      const response = await fetch("/api/cart/candidate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: chosen.id }),
        cache: "no-store"
      });
      const body = await response.json() as CartCandidateResponse;
      if (!response.ok || !body.item) {
        setError(purchaseErrorMessage(body.error));
        return;
      }

      setOpen(false);
      addItem(body.item, 1);
      recordProductAnalyticsEvent({ eventType: "add_to_cart", canonicalVariantId: body.item.canonicalVariantId, surface: "product_page" });
      trackGoogleAnalyticsEvent("add_to_cart", {
        currency: "EUR",
        value: body.item.priceMinor / 100,
        items: [googleAnalyticsItem({ id: body.item.canonicalVariantId, name: body.item.title, priceMinor: body.item.priceMinor, quantity: 1 })],
        surface: "product_variant_sheet_mobile"
      });
    } catch {
      setError(purchaseErrorMessage());
    } finally {
      setAdding(false);
    }
  }, [addItem, adding, chosen]);

  return (
    <>
      <button
        className={styles.trigger}
        type="button"
        data-km-variant-sheet-trigger="true"
        onClick={openForBrowsing}
        aria-expanded={open}
        aria-controls="product-variant-bottom-sheet"
      >
        <span><small>{title}</small><strong>{selected?.label ?? "Επίλεξε παραλλαγή"}</strong></span>
        <b aria-hidden="true">Αλλαγή</b>
      </button>
      {mounted ? createPortal(
        <div className={`${styles.root}${open ? ` ${styles.open}` : ""}`} aria-hidden={!open}>
          <button className={styles.backdrop} type="button" tabIndex={open ? 0 : -1} disabled={adding} onClick={() => setOpen(false)} aria-label="Κλείσιμο επιλογών" />
          <section id="product-variant-bottom-sheet" className={styles.sheet} role="dialog" aria-modal={open ? "true" : undefined} aria-labelledby="variant-sheet-title">
            <div className={styles.grabber} aria-hidden="true" />
            <header className={styles.header}>
              <div><span>{purchaseMode ? "Επίλεξε πριν την προσθήκη" : "Επιλογές προϊόντος"}</span><h2 id="variant-sheet-title">{title}</h2></div>
              <button ref={closeRef} type="button" disabled={adding} onClick={() => setOpen(false)} aria-label="Κλείσιμο επιλογών">×</button>
            </header>
            <div className={styles.options}>
              {options.map((option) => {
                const purchaseSelected = purchaseMode ? option.id === selectedId : option.selected;
                const content = <>
                  {option.imageSrc ? <span className={styles.image}><img src={option.imageSrc} alt={option.imageAlt ?? option.label} loading="lazy" /></span> : null}
                  {option.swatch ? <i className={styles.swatch} style={swatchStyle(option.swatch)} aria-hidden="true" /> : null}
                  <span className={styles.label}><strong>{option.label}</strong>{option.unavailable ? <small>Μη διαθέσιμο</small> : purchaseSelected ? <small>Επιλεγμένο</small> : null}</span>
                  {purchaseSelected ? <b className={styles.check} aria-hidden="true">✓</b> : null}
                </>;
                const className = `${styles.option}${purchaseSelected ? ` ${styles.selected}` : ""}${option.unavailable ? ` ${styles.unavailable}` : ""}`;
                if (option.unavailable) return <span key={option.id} className={className} aria-disabled="true">{content}</span>;
                if (purchaseMode) {
                  return <button key={option.id} className={`${className} ${styles.optionButton}`} type="button" onClick={() => { setSelectedId(option.id); setError(undefined); }}>{content}</button>;
                }
                return <a key={option.id} className={className} href={option.href} aria-current={option.selected ? "page" : undefined} onClick={() => setOpen(false)}>{content}</a>;
              })}
            </div>
            {purchaseMode ? (
              <footer className={styles.footer}>
                {error ? <p className={styles.error} role="alert">{error}</p> : null}
                <button className={styles.addButton} type="button" disabled={!chosen || chosen.unavailable || adding} onClick={addSelectedVariant}>
                  {adding ? "Ελέγχουμε διαθεσιμότητα…" : "Προσθήκη στο καλάθι"}
                </button>
              </footer>
            ) : null}
          </section>
        </div>, document.body
      ) : null}
    </>
  );
}
