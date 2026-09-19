"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  COLOR_FINDER_PRESETS,
  colorMatchPercent,
  deltaE2000,
  hexToLab,
  normalizeHex,
  type ColorFinderProduct,
  type ColorFinish,
  type ColorProductType
} from "../lib/color-finder";
import styles from "./ColorFinderExperience.module.css";

type FinishFilter = "all" | ColorFinish;
type ProductTypeFilter = "all" | ColorProductType;

const FINISH_LABELS: Readonly<Record<ColorFinish, string>> = {
  cream: "Cream",
  pearly: "Pearly",
  shimmer: "Shimmer",
  metallic: "Metallic",
  glitter: "Glitter",
  matte: "Matte",
  jelly: "Jelly",
  classic: "Classic"
};

const TYPE_LABELS: Readonly<Record<ColorProductType, string>> = {
  gel: "Gel",
  regular: "Regular",
  other: "Other"
};

export function ColorFinderExperience({ products }: { products: readonly ColorFinderProduct[] }) {
  const [selectedHex, setSelectedHex] = useState("#B52E2E");
  const [hexDraft, setHexDraft] = useState("#B52E2E");
  const [finish, setFinish] = useState<FinishFilter>("all");
  const [productType, setProductType] = useState<ProductTypeFilter>("all");

  const matches = useMemo(() => {
    const targetLab = hexToLab(selectedHex);
    return products
      .filter((product) => finish === "all" || product.finish === finish)
      .filter((product) => productType === "all" || product.productType === productType)
      .map((product) => {
        const deltaE = deltaE2000(targetLab, hexToLab(product.colorHex));
        return { ...product, deltaE, match: colorMatchPercent(deltaE) };
      })
      .sort((left, right) => left.deltaE - right.deltaE || left.priceMinor - right.priceMinor);
  }, [finish, productType, products, selectedHex]);

  const visibleMatches = matches.slice(0, 24);
  const availableFinishes = useMemo(() => [...new Set(products.map((product) => product.finish))], [products]);
  const availableTypes = useMemo(() => [...new Set(products.map((product) => product.productType))], [products]);

  function applyHex(value: string) {
    setHexDraft(value);
    const normalized = normalizeHex(value);
    if (normalized) setSelectedHex(normalized);
  }

  return (
    <div className={styles.experience}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>COLOR FINDER · NAIL EDITION</span>
          <h1>Find the shade<br /><em>you imagined.</em></h1>
          <p>
            Διάλεξε ένα χρώμα και ανακάλυψε τα πιο κοντινά βερνίκια που μπορείς να αγοράσεις απευθείας στο ΚΟΝΤΑ ΜΟΥ.
          </p>
          <div className={styles.signature}>
            <span>Perceptual matching</span>
            <span aria-hidden="true">·</span>
            <span>CIE LAB / ΔE2000</span>
          </div>
        </div>

        <div className={styles.selectorCard}>
          <div className={styles.selectorHeading}>
            <span>YOUR COLOR</span>
            <strong>{selectedHex}</strong>
          </div>
          <label className={styles.colorStage} style={{ "--selected-color": selectedHex } as React.CSSProperties}>
            <span className={styles.colorHalo} aria-hidden="true" />
            <span className={styles.colorDisc} aria-hidden="true" />
            <span className={styles.pickHint}>Tap to choose a color</span>
            <input
              aria-label="Διάλεξε χρώμα"
              type="color"
              value={selectedHex}
              onChange={(event) => {
                const value = event.target.value.toUpperCase();
                setSelectedHex(value);
                setHexDraft(value);
              }}
            />
          </label>
          <div className={styles.hexField}>
            <label htmlFor="color-finder-hex">HEX</label>
            <input
              id="color-finder-hex"
              value={hexDraft}
              maxLength={7}
              spellCheck={false}
              onChange={(event) => applyHex(event.target.value)}
              onBlur={() => setHexDraft(selectedHex)}
            />
          </div>
          <div className={styles.presetRail} aria-label="Προτεινόμενες αποχρώσεις">
            {COLOR_FINDER_PRESETS.map((preset) => (
              <button
                key={preset.hex}
                type="button"
                title={preset.label}
                aria-label={preset.label}
                aria-pressed={selectedHex === preset.hex}
                className={styles.preset}
                style={{ backgroundColor: preset.hex }}
                onClick={() => {
                  setSelectedHex(preset.hex);
                  setHexDraft(preset.hex);
                }}
              />
            ))}
          </div>
        </div>
      </section>

      <section className={styles.resultsSection} id="matches" aria-labelledby="color-finder-results">
        <div className={styles.resultsHeader}>
          <div>
            <span className={styles.eyebrow}>CURATED BY COLOR</span>
            <h2 id="color-finder-results">Your closest matches</h2>
            <p>
              {visibleMatches.length
                ? `${visibleMatches.length} από ${matches.length} διαθέσιμες αντιστοιχίες, ταξινομημένες με βάση την οπτική απόσταση από ${selectedHex}.`
                : "Δεν υπάρχουν ακόμη προϊόντα με επαρκές χρωματικό προφίλ για αυτόν τον συνδυασμό φίλτρων."}
            </p>
          </div>
          <div className={styles.targetChip}>
            <span style={{ backgroundColor: selectedHex }} />
            <strong>{selectedHex}</strong>
          </div>
        </div>

        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <span>TYPE</span>
            <div>
              <button type="button" className={productType === "all" ? styles.activeFilter : undefined} onClick={() => setProductType("all")}>All</button>
              {availableTypes.map((type) => (
                <button key={type} type="button" className={productType === type ? styles.activeFilter : undefined} onClick={() => setProductType(type)}>
                  {TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.filterGroup}>
            <span>FINISH</span>
            <div>
              <button type="button" className={finish === "all" ? styles.activeFilter : undefined} onClick={() => setFinish("all")}>All</button>
              {availableFinishes.map((item) => (
                <button key={item} type="button" className={finish === item ? styles.activeFilter : undefined} onClick={() => setFinish(item)}>
                  {FINISH_LABELS[item]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {visibleMatches.length ? (
          <div className={styles.grid}>
            {visibleMatches.map((product, index) => (
              <article className={styles.productCard} key={product.id}>
                <Link className={styles.imageWrap} href={`/product/${encodeURIComponent(product.slug || product.id)}`} prefetch={false}>
                  <span className={styles.rank}>#{String(index + 1).padStart(2, "0")}</span>
                  <img src={product.imageSrc} alt={product.mediaAlt ?? product.title} loading={index < 4 ? "eager" : "lazy"} decoding="async" />
                </Link>
                <div className={styles.productBody}>
                  <div className={styles.brandRow}>
                    <span>{product.brand ?? "KONTA MOY"}</span>
                    <strong>{product.match}% match</strong>
                  </div>
                  <h3><Link href={`/product/${encodeURIComponent(product.slug || product.id)}`} prefetch={false}>{product.title}</Link></h3>
                  {product.brandShade ? <p className={styles.shadeName}>{product.brandShade}</p> : null}
                  <div className={styles.swatches}>
                    <div>
                      <span style={{ backgroundColor: product.colorHex }} />
                      <small>PRODUCT</small>
                    </div>
                    <div>
                      <span style={{ backgroundColor: selectedHex }} />
                      <small>YOUR COLOR</small>
                    </div>
                    <p>ΔE {product.deltaE.toFixed(1)}</p>
                  </div>
                  <div className={styles.cardFooter}>
                    <div>
                      <span>{FINISH_LABELS[product.finish]}</span>
                      <strong>{product.price}</strong>
                    </div>
                    <Link href={`/product/${encodeURIComponent(product.slug || product.id)}`} prefetch={false}>View shade →</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <span className={styles.emptySwatch} style={{ backgroundColor: selectedHex }} />
            <h3>We are still learning this shade.</h3>
            <p>Δοκίμασε διαφορετικό finish ή τύπο προϊόντος. Ο Color Finder θα γίνεται πλουσιότερος όσο εμπλουτίζονται τα χρωματικά δεδομένα του καταλόγου.</p>
          </div>
        )}
      </section>
    </div>
  );
}
