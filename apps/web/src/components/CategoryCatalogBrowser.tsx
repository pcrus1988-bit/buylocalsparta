"use client";

import { useMemo, useState } from "react";
import type { CatalogCard } from "../lib/catalog-view";
import { CatalogProductCard } from "./CatalogProductCard";

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

export function CategoryCatalogBrowser({ products, categoryName }: { products: readonly CatalogCard[]; categoryName: string }) {
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("all");
  const [color, setColor] = useState("all");
  const [size, setSize] = useState("all");

  const brands = useMemo(() => unique(products.map((product) => product.brand)), [products]);
  const colors = useMemo(() => unique(products.map((product) => product.color)), [products]);
  const sizes = useMemo(() => unique(products.flatMap((product) => product.sizes)), [products]);

  const filtered = useMemo(() => {
    const needle = normalized(query);
    return products.filter((product) => {
      if (brand !== "all" && product.brand !== brand) return false;
      if (color !== "all" && product.color !== color) return false;
      if (size !== "all" && !product.sizes.includes(size)) return false;
      if (!needle) return true;
      return normalized([
        product.title,
        product.description,
        product.brand,
        product.color,
        product.mpn,
        product.gtin,
        ...product.sizes
      ].filter(Boolean).join(" ")).includes(needle);
    });
  }, [brand, color, products, query, size]);

  const filtering = Boolean(query) || brand !== "all" || color !== "all" || size !== "all";
  const visibleProducts = useMemo(
    () => filtering ? filtered : showcase(filtered, categoryName),
    [categoryName, filtered, filtering]
  );

  const clear = () => {
    setQuery("");
    setBrand("all");
    setColor("all");
    setSize("all");
  };

  return (
    <div className="categoryBrowser">
      <div className="categoryTools">
        <label className="categorySearch">
          <span>Αναζήτηση στην κατηγορία</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value.slice(0, 120))} placeholder={`Αναζήτηση σε ${categoryName}…`} />
        </label>
        {brands.length > 1 && <label><span>Μάρκα</span><select value={brand} onChange={(event) => setBrand(event.target.value)}><option value="all">Όλες</option>{brands.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>}
        {colors.length > 1 && <label><span>Χρώμα</span><select value={color} onChange={(event) => setColor(event.target.value)}><option value="all">Όλα</option>{colors.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>}
        {sizes.length > 1 && <label><span>Μέγεθος</span><select value={size} onChange={(event) => setSize(event.target.value)}><option value="all">Όλα</option>{sizes.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>}
      </div>

      <div className="categoryMeta">
        <span>{filtering ? <><strong>{filtered.length}</strong> αποτελέσματα στην κατηγορία.</> : <><strong>{Math.min(SHOWCASE_LIMIT, products.length)}</strong> τυχαίες επιλογές από {products.length} προϊόντα.</>}</span>
        {filtering ? <button type="button" onClick={clear}>Καθαρισμός</button> : null}
      </div>

      {visibleProducts.length ? (
        <div className="categoryProductGrid">
          {visibleProducts.map((product, index) => <CatalogProductCard product={product} index={index} key={product.id} />)}
        </div>
      ) : (
        <div className="empty-state category-empty-state">
          <div className="eyebrow">Δεν βρέθηκε αποτέλεσμα</div>
          <h2>Δοκίμασε διαφορετική αναζήτηση.</h2>
          <p>Τα φίλτρα αφορούν μόνο την τρέχουσα κατηγορία.</p>
          <button className="button" type="button" onClick={clear}>Καθαρισμός</button>
        </div>
      )}

      <style jsx>{`
        .categoryTools {
          display: grid;
          grid-template-columns: minmax(260px, 1.4fr) repeat(3, minmax(140px, .55fr));
          gap: 10px;
          margin-bottom: 16px;
        }
        label { display: flex; flex-direction: column; gap: 7px; }
        label span { color: var(--ink-soft); font-size: 10px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
        input, select { width: 100%; min-height: 48px; border: 1px solid var(--line); border-radius: 14px; background: var(--white); color: var(--ink); padding: 0 14px; font: inherit; }
        input:focus-visible, select:focus-visible { outline: 3px solid var(--brass); outline-offset: 2px; }
        .categoryMeta { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin: 0 0 22px; color: var(--ink-soft); font-size: 11px; }
        .categoryMeta button { border: 0; background: transparent; color: var(--ink); cursor: pointer; font: inherit; font-size: 11px; font-weight: 900; }
        .categoryProductGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
        @media (max-width: 980px) {
          .categoryTools { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .categorySearch { grid-column: 1 / -1; }
          .categoryProductGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 640px) {
          .categoryTools { grid-template-columns: 1fr 1fr; }
          .categorySearch { grid-column: 1 / -1; }
          .categoryMeta { align-items: flex-start; flex-direction: column; }
          .categoryProductGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
          .categoryProductGrid :global(.product-art) { height: 160px; padding: 8px; }
          .categoryProductGrid :global(.product-body) { padding: 12px; }
          .categoryProductGrid :global(.product-body h3) { font-size: 18px; }
          .categoryProductGrid :global(.product-body .eyebrow) { font-size: 9px; }
          .categoryProductGrid :global(.partner) { min-height: 0; font-size: 10px; }
          .categoryProductGrid :global(.product-bottom) { margin-top: 12px; }
          .categoryProductGrid :global(.price) { font-size: 17px; }
          .categoryProductGrid :global(.round-add) { width: 34px; height: 34px; font-size: 18px; }
          .categoryProductGrid :global(.product-badge) { padding: 5px 7px; font-size: 8px; }
        }
      `}</style>
    </div>
  );
}
