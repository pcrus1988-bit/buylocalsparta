"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
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

export function ProductVariantBottomSheet({ title, options }: ProductVariantBottomSheetProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const selected = useMemo(() => options.find((option) => option.selected), [options]);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button className={styles.trigger} type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="product-variant-bottom-sheet">
        <span><small>{title}</small><strong>{selected?.label ?? "Επίλεξε παραλλαγή"}</strong></span>
        <b aria-hidden="true">Αλλαγή</b>
      </button>
      {mounted ? createPortal(
        <div className={`${styles.root}${open ? ` ${styles.open}` : ""}`} aria-hidden={!open}>
          <button className={styles.backdrop} type="button" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} aria-label="Κλείσιμο επιλογών" />
          <section id="product-variant-bottom-sheet" className={styles.sheet} role="dialog" aria-modal={open ? "true" : undefined} aria-labelledby="variant-sheet-title">
            <div className={styles.grabber} aria-hidden="true" />
            <header className={styles.header}>
              <div><span>Επιλογές προϊόντος</span><h2 id="variant-sheet-title">{title}</h2></div>
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Κλείσιμο επιλογών">×</button>
            </header>
            <div className={styles.options}>
              {options.map((option) => {
                const content = <>
                  {option.imageSrc ? <span className={styles.image}><img src={option.imageSrc} alt={option.imageAlt ?? option.label} loading="lazy" /></span> : null}
                  {option.swatch ? <i className={styles.swatch} style={swatchStyle(option.swatch)} aria-hidden="true" /> : null}
                  <span className={styles.label}><strong>{option.label}</strong>{option.unavailable ? <small>Μη διαθέσιμο</small> : option.selected ? <small>Επιλεγμένο</small> : null}</span>
                  {option.selected ? <b className={styles.check} aria-hidden="true">✓</b> : null}
                </>;
                const className = `${styles.option}${option.selected ? ` ${styles.selected}` : ""}${option.unavailable ? ` ${styles.unavailable}` : ""}`;
                return option.unavailable && !option.selected
                  ? <span key={option.id} className={className} aria-disabled="true">{content}</span>
                  : <a key={option.id} className={className} href={option.href} aria-current={option.selected ? "page" : undefined} onClick={() => setOpen(false)}>{content}</a>;
              })}
            </div>
          </section>
        </div>, document.body
      ) : null}
    </>
  );
}
