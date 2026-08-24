"use client";

import { useMemo, useState } from "react";
import type { CatalogCard } from "../lib/catalog-view";
import { CatalogProductCard } from "./CatalogProductCard";
import styles from "./VendorStorefront.module.css";

type AvailabilityFilter = "all" | "available";
const SHOWCASE_LIMIT = 10;

function normalized(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("el");
}

function unique(values: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))]
    .sort((left, right) => left.localeCompare(right, "el"));
}

function rank(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function showcase(products: readonly CatalogCard[], seed: string): readonly CatalogCard[] {
  return [...products]
    .sort((left, right) => rank(`${seed}:${left.id}`) - rank(`${seed}:${right.id}`))
    .slice(0, SHOWCASE_LIMIT);
}

export function VendorCatalogBrowser({ products, vendor, demoVendorId }: {
  products: readonly CatalogCard[];
  vendor: Readonly<{ name: string; adviser?: string }>;
  demoVendorId?: string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [brand, setBrand] = useState("all");
  const [color, setColor] = useState("all");
  const [size, setSize] = useState("all");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const demoMode = Boolean(demoVendorId);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of products) map.set(product.categoryCode, product.categoryLabel ?? product.categoryCode);
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, "el"));
  }, [products]);

  const categoryProducts = useMemo(
    () => category === "all" ? products : products.filter((product) => product.categoryCode === category),
    [category, products]
  );
  const brands = useMemo(() => unique(categoryProducts.map((product) => product.brand)), [categoryProducts]);
  const colors = useMemo(() => unique(categoryProducts.map((product) => product.color)), [categoryProducts]);
  const sizes = useMemo(() => unique(categoryProducts.flatMap((product) => product.sizes)), [categoryProducts]);

  const filtered = useMemo(() => {
    const needle = normalized(query);
    return categoryProducts.filter((product) => {
      if (brand !== "all" && product.brand !== brand) return false;
      if (color !== "all" && product.color !== color) return false;
      if (size !== "all" && !product.sizes.includes(size)) return false;
      if (availability === "available" && !product.available) return false;
      if (!needle) return true;
      return normalized([
        product.title,
        product.description,
        product.categoryLabel,
        product.brand,
        product.color,
        product.mpn,
        product.gtin,
        ...product.sizes
      ].filter(Boolean).join(" ")).includes(needle);
    });
  }, [availability, brand, categoryProducts, color, query, size]);

  const categoryFiltersActive = brand !== "all" || color !== "all" || size !== "all" || availability !== "all";
  const discoveryActive = Boolean(query) || categoryFiltersActive;
  const visibleProducts = useMemo(
    () => discoveryActive ? filtered : showcase(filtered, `${vendor.name}:${category}`),
    [category, discoveryActive, filtered, vendor.name]
  );

  const resetCategoryFilters = () => {
    setBrand("all");
    setColor("all");
    setSize("all");
    setAvailability("all");
  };

  const selectCategory = (nextCategory: string) => {
    setCategory(nextCategory);
    setQuery("");
    resetCategoryFilters();
  };

  return (
    <div>
      <div className={styles.catalogToolbar} style={{ gridTemplateColumns: "minmax(0, 720px)", marginBottom: 22 }} aria-label={`Αναζήτηση προϊόντων ${vendor.name}`}>
        <label className={styles.field}>
          <span>Αναζήτηση στο κατάστημα</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value.slice(0, 120))}
            placeholder="Προϊόν, μάρκα, κωδικός…"
          />
        </label>
      </div>

      {categories.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 14, marginBottom: 8 }}>
            <div>
              <span style={{ display: "block", color: "var(--ink-soft)", fontSize: 10, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase" }}>Κατηγορίες προϊόντων</span>
              <strong style={{ display: "block", marginTop: 5, fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 20 }}>
                {category === "all" ? "Περιηγήσου στον κατάλογο" : categories.find((entry) => entry.value === category)?.label}
              </strong>
            </div>
            {category !== "all" ? <button type="button" className={styles.clearButton} onClick={() => selectCategory("all")}>Όλες οι κατηγορίες</button> : null}
          </div>
          <div className={styles.categoryBar} aria-label="Κατηγορίες προϊόντων">
            <button
              type="button"
              className={`${styles.categoryChip} ${category === "all" ? styles.categoryChipActive : ""}`}
              onClick={() => selectCategory("all")}
            >
              Όλα · {products.length}
            </button>
            {categories.map((entry) => {
              const count = products.filter((product) => product.categoryCode === entry.value).length;
              return (
                <button
                  type="button"
                  className={`${styles.categoryChip} ${category === entry.value ? styles.categoryChipActive : ""}`}
                  onClick={() => selectCategory(entry.value)}
                  key={entry.value}
                >
                  {entry.label} · {count}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {category !== "all" && (
        <div style={{ marginBottom: 22, padding: 16, border: "1px solid var(--line)", borderRadius: 18, background: "rgba(255,253,248,.55)" }} aria-label="Φίλτρα επιλεγμένης κατηγορίας">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", marginBottom: 12 }}>
            <div>
              <strong style={{ display: "block", fontSize: 13 }}>Φίλτρα κατηγορίας</strong>
              <span style={{ display: "block", marginTop: 3, color: "var(--ink-soft)", fontSize: 11 }}>Εμφανίζονται μόνο μέσα στην κατηγορία που άνοιξες.</span>
            </div>
            {categoryFiltersActive ? <button type="button" className={styles.clearButton} onClick={resetCategoryFilters}>Καθαρισμός</button> : null}
          </div>
          <div className={styles.catalogToolbar} style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginBottom: 0 }}>
            {brands.length > 1 && (
              <label className={styles.field}>
                <span>Μάρκα</span>
                <select value={brand} onChange={(event) => setBrand(event.target.value)}>
                  <option value="all">Όλες</option>
                  {brands.map((value) => <option value={value} key={value}>{value}</option>)}
                </select>
              </label>
            )}
            {colors.length > 1 && (
              <label className={styles.field}>
                <span>Χρώμα</span>
                <select value={color} onChange={(event) => setColor(event.target.value)}>
                  <option value="all">Όλα</option>
                  {colors.map((value) => <option value={value} key={value}>{value}</option>)}
                </select>
              </label>
            )}
            {sizes.length > 1 && (
              <label className={styles.field}>
                <span>Μέγεθος</span>
                <select value={size} onChange={(event) => setSize(event.target.value)}>
                  <option value="all">Όλα</option>
                  {sizes.map((value) => <option value={value} key={value}>{value}</option>)}
                </select>
              </label>
            )}
            <label className={styles.field}>
              <span>{demoMode ? "Τιμή παρουσίασης" : "Διαθεσιμότητα"}</span>
              <select value={availability} onChange={(event) => setAvailability(event.target.value as AvailabilityFilter)}>
                <option value="all">Όλα</option>
                <option value="available">{demoMode ? "Με διαθέσιμη τιμή παρουσίασης" : "Διαθέσιμα τώρα"}</option>
              </select>
            </label>
          </div>
        </div>
      )}

      <div className={styles.catalogMeta}>
        {discoveryActive ? (
          <span><strong>{filtered.length}</strong> αποτελέσματα.</span>
        ) : (
          <span><strong>{Math.min(SHOWCASE_LIMIT, filtered.length)}</strong> τυχαίες επιλογές από {filtered.length} προϊόντα.</span>
        )}
        {demoMode ? <span>DEMO · οι κάρτες ανοίγουν πλήρη προεπισκόπηση προϊόντος, χωρίς checkout.</span> : null}
        {query ? <button type="button" className={styles.clearButton} onClick={() => setQuery("")}>Καθαρισμός αναζήτησης</button> : null}
      </div>

      {visibleProducts.length > 0 ? (
        <div className="vendorCatalogGrid">
          {visibleProducts.map((product, index) => (
            <CatalogProductCard product={product} index={index} vendorContext={vendor} demoVendorId={demoVendorId} key={product.id} />
          ))}
        </div>
      ) : (
        <div className={styles.noResults}>
          <h3>Δεν βρέθηκε προϊόν.</h3>
          <p>{demoMode ? "Δοκίμασε άλλη λέξη ή άλλα φίλτρα μέσα στην επιλεγμένη κατηγορία." : "Δοκίμασε άλλη λέξη ή κατηγορία. Αν ψάχνεις κάτι που δεν είναι καταχωρισμένο, μπορείς να ρωτήσεις απευθείας το κατάστημα στο Ask Local παρακάτω."}</p>
          <button type="button" className="button button-secondary" onClick={() => { setQuery(""); resetCategoryFilters(); }}>Καθαρισμός αναζήτησης</button>
        </div>
      )}

      <style jsx>{`
        .vendorCatalogGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }
        @media (max-width: 980px) {
          .vendorCatalogGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 640px) {
          .vendorCatalogGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
          .vendorCatalogGrid :global(.product-art) { height: 160px; padding: 8px; }
          .vendorCatalogGrid :global(.product-body) { padding: 12px; }
          .vendorCatalogGrid :global(.product-body h3) { font-size: 18px; }
          .vendorCatalogGrid :global(.product-body .eyebrow) { font-size: 9px; }
          .vendorCatalogGrid :global(.partner) { min-height: 0; font-size: 10px; }
          .vendorCatalogGrid :global(.product-bottom) { margin-top: 12px; }
          .vendorCatalogGrid :global(.price) { font-size: 17px; }
          .vendorCatalogGrid :global(.round-add) { width: 34px; height: 34px; font-size: 18px; }
          .vendorCatalogGrid :global(.product-badge) { padding: 5px 7px; font-size: 8px; }
        }
      `}</style>
    </div>
  );
}
