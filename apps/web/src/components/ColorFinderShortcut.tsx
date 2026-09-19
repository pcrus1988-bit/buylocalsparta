"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { resolveColorFinderContext } from "../lib/color-finder-context";
import styles from "./ColorFinderShortcut.module.css";

export function ColorFinderShortcut({
  categoryCode,
  categoryLabel,
  vendorId,
  vendorName,
  colorCount
}: {
  categoryCode: string;
  categoryLabel: string;
  vendorId?: string;
  vendorName?: string;
  colorCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [returnTo, setReturnTo] = useState<string>();
  const context = useMemo(
    () => resolveColorFinderContext(categoryCode, categoryLabel),
    [categoryCode, categoryLabel]
  );

  useEffect(() => {
    setReturnTo(`${window.location.pathname}${window.location.search}`);
  }, [categoryCode]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const href = useMemo(() => {
    const params = new URLSearchParams({
      category: categoryCode,
      categoryLabel
    });
    if (vendorId) params.set("vendor", vendorId);
    if (returnTo) params.set("returnTo", returnTo);
    return `/color-finder?${params.toString()}`;
  }, [categoryCode, categoryLabel, returnTo, vendorId]);

  if (colorCount < 2) return null;

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
        aria-label={`Άνοιξε ${context.studioLabel} Color Finder`}
        title={`${context.studioLabel} · ${categoryLabel}`}
      >
        <span className={styles.symbol} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className={styles.triggerText}>
          <small>COLOR FINDER</small>
          <strong>{context.studioLabel}</strong>
        </span>
      </button>

      {open ? (
        <div className={styles.layer} role="dialog" aria-modal="true" aria-labelledby="color-finder-shortcut-title">
          <button className={styles.backdrop} type="button" onClick={() => setOpen(false)} aria-label="Κλείσιμο Color Finder" />
          <section className={styles.sheet}>
            <header>
              <span className={styles.sheetSymbol} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Κλείσιμο">×</button>
            </header>
            <div className={styles.kicker}>KONTA MOY COLOR FINDER · {context.studioLabel}</div>
            <h2 id="color-finder-shortcut-title">{context.shortcutTitle}</h2>
            <p>{context.shortcutBody}</p>
            <div className={styles.contextRow}>
              <span>ΤΡΕΧΟΥΣΑ ΚΑΤΗΓΟΡΙΑ</span>
              <strong>{categoryLabel}</strong>
              <small>{colorCount} χρωματικές επιλογές{vendorName ? ` · ${vendorName}` : ""}</small>
            </div>
            <Link href={href} className={styles.openButton}>
              OPEN {context.studioLabel} <span>→</span>
            </Link>
            <small className={styles.note}>Το εργαλείο ανοίγει ήδη περιορισμένο στην κατηγορία που βλέπεις.</small>
          </section>
        </div>
      ) : null}
    </>
  );
}
