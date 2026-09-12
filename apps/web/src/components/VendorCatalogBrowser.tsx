"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const demoMode = Boolean(demoVendorId);

  useEffect(() => {
    if (!filtersOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [filtersOpen]);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of products) map.set(product.categoryCode, product.categoryLabel ?? product.categoryCode);
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, "el"));
  }, [products]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) counts.set(product.categoryCode, (counts.get(product.categoryCode) ?? 0) + 1);
    return counts;
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

  const filtersActive = category !== "all" || brand !== "all" || color !== "all" || size !== "all" || availability !== "all";
  const activeFilterCount = [category !== "all", brand !== "all", color !== "all", size !== "all", availability !== "all"].filter(Boolean).length;
  const discoveryActive = Boolean(query.trim()) || filtersActive;
  const visibleProducts = useMemo(
    () => discoveryActive ? filtered : showcase(filtered, `${vendor.name}:${category}`),
    [category, discoveryActive, filtered, vendor.name]
  );

  const resetSecondaryFilters = () => {
    setBrand("all");
    setColor("all");
    setSize("all");
    setAvailability("all");
  };

  const resetAllFilters = () => {
    setCategory("all");
    resetSecondaryFilters();
  };

  const resetDiscovery = () => {
    setQuery("");
    resetAllFilters();
  };

  const selectCategory = (nextCategory: string) => {
    setCategory(nextCategory);
    resetSecondaryFilters();
  };

  const filterPanel = (mobile = false) => (
    <div className={styles.catalogFilterPanel}>
      <div className={styles.filterHeader}>
        <div>
          <strong>Φίλτρα προϊόντων</strong>
          <span>Βρες γρήγορα αυτό που ψάχνεις στο συγκεκριμένο κατάστημα.</span>
        </div>
        {filtersActive ? <button type="button" className={styles.clearButton} onClick={resetAllFilters}>Καθαρισμός</button> : null}
      </div>

      {categories.length > 0 && (
        <div className={styles.filterSection}>
          <span className={styles.filterLabel}>Κατηγορίες</span>
          <div className={styles.filterCategoryList} aria-label="Κατηγορίες προϊόντων">
            <button
              type="button"
              className={`${styles.filterCategoryButton} ${category === "all" ? styles.filterCategoryButtonActive : ""}`}
              onClick={() => selectCategory("all")}
            >
              <span>Όλα τα προϊόντα</span>
              <span className={styles.filterCategoryCount}>{products.length}</span>
            </button>
            {categories.map((entry) => (
              <button
                type="button"
                className={`${styles.filterCategoryButton} ${category === entry.value ? styles.filterCategoryButtonActive : ""}`}
                onClick={() => selectCategory(entry.value)}
                key={entry.value}
              >
                <span>{entry.label}</span>
                <span className={styles.filterCategoryCount}>{categoryCounts.get(entry.value) ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.filterSection}>
        <span className={styles.filterLabel}>Περισσότερα φίλτρα</span>
        <div className={styles.filterFields}>
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

      {mobile ? (
        <div className={styles.mobileFilterHint}>
          {filtered.length} {filtered.length === 1 ? "προϊόν" : "προϊόντα"} με τα επιλεγμένα φίλτρα
        </div>
      ) : null}
    </div>
  );

  return (
    <div className={styles.catalogBrowser}>
      <div className={styles.catalogLayout}>
        <aside className={styles.catalogSidebar} aria-label="Κατηγορίες και φίλτρα προϊόντων">
          {filterPanel()}
        </aside>

        <div className={styles.catalogResults}>
          <label className={`${styles.field} ${styles.desktopCatalogSearch}`}>
            <span>Αναζήτηση στο κατάστημα</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value.slice(0, 120))}
              placeholder="Προϊόν, μάρκα, κωδικός…"
            />
          </label>

          <div className={styles.catalogMeta}>
            {discoveryActive ? (
              <span><strong>{filtered.length}</strong> αποτελέσματα.</span>
            ) : (
              <span><strong>{Math.min(SHOWCASE_LIMIT, filtered.length)}</strong> επιλογές από {filtered.length} προϊόντα.</span>
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
              <p>{demoMode ? "Δοκίμασε άλλη λέξη ή άλλα φίλτρα." : "Δοκίμασε άλλη λέξη ή άλλα φίλτρα. Αν ψάχνεις κάτι που δεν είναι καταχωρισμένο, μπορείς να ρωτήσεις απευθείας το κατάστημα στο Ask Local παρακάτω."}</p>
              <button type="button" className="button button-secondary" onClick={resetDiscovery}>Καθαρισμός αναζήτησης & φίλτρων</button>
            </div>
          )}
        </div>
      </div>

      <div className={styles.mobileCatalogDock} role="search" aria-label={`Αναζήτηση προϊόντων ${vendor.name}`}>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value.slice(0, 120))}
          placeholder="Αναζήτηση προϊόντος…"
          aria-label={`Αναζήτηση στο ${vendor.name}`}
        />
        <button
          type="button"
          className={styles.mobileFilterTrigger}
          onClick={() => setFiltersOpen(true)}
          aria-expanded={filtersOpen}
          aria-controls="vendor-mobile-filters"
        >
          Φίλτρα{activeFilterCount ? ` · ${activeFilterCount}` : ""}
        </button>
      </div>

      {filtersOpen ? (
        <>
          <button type="button" className={styles.mobileFilterBackdrop} onClick={() => setFiltersOpen(false)} aria-label="Κλείσιμο φίλτρων" />
          <aside id="vendor-mobile-filters" className={styles.mobileFilterSheet} role="dialog" aria-modal="true" aria-label="Φίλτρα προϊόντων">
            <div className={styles.mobileFilterSheetHeader}>
              <div>
                <span>Κατάλογος</span>
                <strong>Κατηγορίες & φίλτρα</strong>
              </div>
              <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Κλείσιμο">×</button>
            </div>
            <div className={styles.mobileFilterSheetBody}>{filterPanel(true)}</div>
            <div className={styles.mobileFilterSheetFooter}>
              <button type="button" className="button" onClick={() => setFiltersOpen(false)}>
                Προβολή {filtered.length} {filtered.length === 1 ? "προϊόντος" : "προϊόντων"}
              </button>
            </div>
          </aside>
        </>
      ) : null}

      <style jsx>{`
        .vendorCatalogGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }
        @media (max-width: 1180px) {
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
