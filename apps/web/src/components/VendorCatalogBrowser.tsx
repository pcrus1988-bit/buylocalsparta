"use client";

import { useMemo, useState } from "react";
import type { CatalogCard } from "../lib/catalog-view";
import { CatalogProductCard } from "./CatalogProductCard";
import styles from "./VendorStorefront.module.css";

type AvailabilityFilter = "all" | "available";

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

export function VendorCatalogBrowser({ products, vendor }: {
  products: readonly CatalogCard[];
  vendor: Readonly<{ name: string; adviser?: string }>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [brand, setBrand] = useState("all");
  const [color, setColor] = useState("all");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of products) map.set(product.categoryCode, product.categoryLabel ?? product.categoryCode);
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, "el"));
  }, [products]);
  const brands = useMemo(() => unique(products.map((product) => product.brand)), [products]);
  const colors = useMemo(() => unique(products.map((product) => product.color)), [products]);

  const filtered = useMemo(() => {
    const needle = normalized(query);
    return products.filter((product) => {
      if (category !== "all" && product.categoryCode !== category) return false;
      if (brand !== "all" && product.brand !== brand) return false;
      if (color !== "all" && product.color !== color) return false;
      if (availability === "available" && !product.available) return false;
      if (!needle) return true;
      return normalized([
        product.title,
        product.description,
        product.categoryLabel,
        product.brand,
        product.color,
        product.mpn,
        ...product.sizes
      ].filter(Boolean).join(" ")).includes(needle);
    });
  }, [availability, brand, category, color, products, query]);

  const hasFilters = Boolean(query) || category !== "all" || brand !== "all" || color !== "all" || availability !== "all";
  const clear = () => {
    setQuery("");
    setCategory("all");
    setBrand("all");
    setColor("all");
    setAvailability("all");
  };

  return (
    <div>
      <div className={styles.catalogToolbar} aria-label={`Αναζήτηση και φίλτρα προϊόντων ${vendor.name}`}>
        <label className={styles.field}>
          <span>Αναζήτηση στο κατάστημα</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value.slice(0, 120))}
            placeholder="Προϊόν, μάρκα, κωδικός…"
          />
        </label>
        {brands.length > 0 && (
          <label className={styles.field}>
            <span>Μάρκα</span>
            <select value={brand} onChange={(event) => setBrand(event.target.value)}>
              <option value="all">Όλες</option>
              {brands.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
        )}
        {colors.length > 0 && (
          <label className={styles.field}>
            <span>Χρώμα</span>
            <select value={color} onChange={(event) => setColor(event.target.value)}>
              <option value="all">Όλα</option>
              {colors.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
        )}
        <label className={styles.field}>
          <span>Διαθεσιμότητα</span>
          <select value={availability} onChange={(event) => setAvailability(event.target.value as AvailabilityFilter)}>
            <option value="all">Όλα</option>
            <option value="available">Διαθέσιμα τώρα</option>
          </select>
        </label>
      </div>

      {categories.length > 0 && (
        <div className={styles.categoryBar} aria-label="Κατηγορίες προϊόντων">
          <button
            type="button"
            className={`${styles.categoryChip} ${category === "all" ? styles.categoryChipActive : ""}`}
            onClick={() => setCategory("all")}
          >
            Όλα · {products.length}
          </button>
          {categories.map((entry) => {
            const count = products.filter((product) => product.categoryCode === entry.value).length;
            return (
              <button
                type="button"
                className={`${styles.categoryChip} ${category === entry.value ? styles.categoryChipActive : ""}`}
                onClick={() => setCategory(entry.value)}
                key={entry.value}
              >
                {entry.label} · {count}
              </button>
            );
          })}
        </div>
      )}

      <div className={styles.catalogMeta}>
        <span><strong>{filtered.length}</strong> από {products.length} προϊόντα εμφανίζονται.</span>
        {hasFilters && <button type="button" className={styles.clearButton} onClick={clear}>Καθαρισμός φίλτρων</button>}
      </div>

      {filtered.length > 0 ? (
        <div className="product-grid">
          {filtered.map((product, index) => (
            <CatalogProductCard product={product} index={index} vendorContext={vendor} key={product.id} />
          ))}
        </div>
      ) : (
        <div className={styles.noResults}>
          <h3>Δεν βρέθηκε προϊόν με αυτά τα φίλτρα.</h3>
          <p>Δοκίμασε άλλη λέξη ή κατηγορία. Αν ψάχνεις κάτι που δεν είναι καταχωρισμένο, μπορείς να ρωτήσεις απευθείας το κατάστημα στο Ask Local παρακάτω.</p>
          <button type="button" className="button button-secondary" onClick={clear}>Εμφάνιση όλων</button>
        </div>
      )}
    </div>
  );
}