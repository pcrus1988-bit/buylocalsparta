"use client";

import { useEffect, useMemo, useState } from "react";
import type { CatalogCard } from "../lib/catalog-view";
import { CatalogProductCard } from "./CatalogProductCard";
import styles from "./VendorStorefront.module.css";

type AvailabilityFilter = "all" | "available";
type RemoteFacetOption = Readonly<{ value: string; label: string; count: number }>;
type RemoteFacets = Readonly<{
  total: number;
  categories: readonly RemoteFacetOption[];
  brands: readonly RemoteFacetOption[];
  colors: readonly RemoteFacetOption[];
  sizes: readonly RemoteFacetOption[];
}>;
type VendorCatalogApiResponse = Readonly<{
  products: readonly CatalogCard[];
  total: number;
  offset: number;
  limit: number;
  nextOffset: number | null;
  facets: RemoteFacets | null;
}>;

const SHOWCASE_LIMIT = 10;
const REMOTE_PAGE_SIZE = 36;

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

function isSupplierFulfilled(product: CatalogCard): boolean {
  return (product as CatalogCard & Readonly<{ supplierFulfilled?: boolean }>).supplierFulfilled === true;
}

function dedupeProducts(products: readonly CatalogCard[]): readonly CatalogCard[] {
  const byId = new Map<string, CatalogCard>();
  for (const product of products) byId.set(product.id, product);
  return [...byId.values()];
}

function fallbackCategoryOptions(products: readonly CatalogCard[]): readonly RemoteFacetOption[] {
  const map = new Map<string, { label: string; count: number }>();
  for (const product of products) {
    const existing = map.get(product.categoryCode);
    map.set(product.categoryCode, {
      label: product.categoryLabel ?? product.categoryCode,
      count: (existing?.count ?? 0) + 1
    });
  }
  return [...map.entries()]
    .map(([value, entry]) => ({ value, label: entry.label, count: entry.count }))
    .sort((left, right) => left.label.localeCompare(right.label, "el"));
}

function localMatches(
  product: CatalogCard,
  input: Readonly<{
    query: string;
    category: string;
    brand: string;
    color: string;
    size: string;
    availability: AvailabilityFilter;
  }>
): boolean {
  if (input.category !== "all" && product.categoryCode !== input.category) return false;
  if (input.brand !== "all" && product.brand !== input.brand) return false;
  if (input.color !== "all" && product.color !== input.color) return false;
  if (input.size !== "all" && !product.sizes.includes(input.size)) return false;
  if (input.availability === "available" && !product.available) return false;
  const needle = normalized(input.query);
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
  const [browseExpanded, setBrowseExpanded] = useState(false);
  const [publicVendorId, setPublicVendorId] = useState<string>();
  const [remoteProducts, setRemoteProducts] = useState<readonly CatalogCard[] | null>(null);
  const [remoteTotal, setRemoteTotal] = useState<number>();
  const [remoteNextOffset, setRemoteNextOffset] = useState<number | null>(null);
  const [remoteFacets, setRemoteFacets] = useState<RemoteFacets>();
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState(false);
  const demoMode = Boolean(demoVendorId);

  const initialLocalProducts = useMemo(
    () => products.filter((product) => !isSupplierFulfilled(product)),
    [products]
  );

  useEffect(() => {
    if (demoMode) return;
    const match = window.location.pathname.match(/^\/vendor\/([^/?#]+)/);
    const raw = match?.[1];
    if (!raw) return;
    try {
      const decoded = decodeURIComponent(raw);
      if (/^[A-Za-z0-9_-]{3,128}$/.test(decoded)) setPublicVendorId(decoded);
    } catch {
      // Keep the SSR catalogue if the route segment is malformed.
    }
  }, [demoMode]);

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

  useEffect(() => {
    if (!publicVendorId || demoMode) return;
    const controller = new AbortController();
    const delay = query.trim() ? 260 : 0;
    const timer = window.setTimeout(async () => {
      setRemoteLoading(true);
      setRemoteError(false);
      const params = new URLSearchParams({ offset: "0", limit: String(REMOTE_PAGE_SIZE) });
      if (query.trim()) params.set("q", query.trim());
      if (category !== "all") params.set("category", category);
      if (brand !== "all") params.set("brand", brand);
      if (color !== "all") params.set("color", color);
      if (size !== "all") params.set("size", size);
      if (availability === "available") params.set("available", "1");
      if (!remoteFacets) params.set("facets", "1");

      try {
        const response = await fetch(`/api/catalog/vendor/${encodeURIComponent(publicVendorId)}?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store"
        });
        if (!response.ok) throw new Error(`Catalogue request failed with ${response.status}`);
        const payload = await response.json() as VendorCatalogApiResponse;
        setRemoteProducts(payload.products);
        setRemoteTotal(payload.total);
        setRemoteNextOffset(payload.nextOffset);
        if (payload.facets) setRemoteFacets(payload.facets);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Vendor catalogue pagination failed", error);
        setRemoteError(true);
      } finally {
        if (!controller.signal.aborted) setRemoteLoading(false);
      }
    }, delay);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // Facets are intentionally not a dependency: once loaded they remain the stable
    // five-minute catalogue vocabulary while product pages react to every filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability, brand, category, color, demoMode, publicVendorId, query, size]);

  const localFiltered = useMemo(
    () => initialLocalProducts.filter((product) => localMatches(product, { query, category, brand, color, size, availability })),
    [availability, brand, category, color, initialLocalProducts, query, size]
  );

  const fallbackFiltered = useMemo(
    () => products.filter((product) => localMatches(product, { query, category, brand, color, size, availability })),
    [availability, brand, category, color, products, query, size]
  );

  const workingProducts = useMemo(
    () => remoteProducts === null ? fallbackFiltered : dedupeProducts([...localFiltered, ...remoteProducts]),
    [fallbackFiltered, localFiltered, remoteProducts]
  );

  const categories = useMemo(
    () => remoteFacets?.categories ?? fallbackCategoryOptions(products),
    [products, remoteFacets]
  );
  const fallbackCategoryProducts = useMemo(
    () => category === "all" ? products : products.filter((product) => product.categoryCode === category),
    [category, products]
  );
  const brands = useMemo(
    () => remoteFacets?.brands.map((entry) => entry.value) ?? unique(fallbackCategoryProducts.map((product) => product.brand)),
    [fallbackCategoryProducts, remoteFacets]
  );
  const colors = useMemo(
    () => remoteFacets?.colors.map((entry) => entry.value) ?? unique(fallbackCategoryProducts.map((product) => product.color)),
    [fallbackCategoryProducts, remoteFacets]
  );
  const sizes = useMemo(
    () => remoteFacets?.sizes.map((entry) => entry.value) ?? unique(fallbackCategoryProducts.flatMap((product) => product.sizes)),
    [fallbackCategoryProducts, remoteFacets]
  );

  const filtersActive = category !== "all" || brand !== "all" || color !== "all" || size !== "all" || availability !== "all";
  const activeFilterCount = [category !== "all", brand !== "all", color !== "all", size !== "all", availability !== "all"].filter(Boolean).length;
  const discoveryActive = Boolean(query.trim()) || filtersActive;
  const visibleProducts = useMemo(
    () => discoveryActive || browseExpanded ? workingProducts : showcase(workingProducts, `${vendor.name}:${category}`),
    [browseExpanded, category, discoveryActive, vendor.name, workingProducts]
  );
  const resultTotal = remoteProducts === null
    ? fallbackFiltered.length
    : (remoteTotal ?? remoteProducts.length) + localFiltered.length;
  const catalogueTotal = remoteFacets?.total !== undefined
    ? remoteFacets.total + initialLocalProducts.length
    : remoteTotal !== undefined
      ? remoteTotal + initialLocalProducts.length
      : products.length;
  const canExpandShowcase = !discoveryActive && !browseExpanded && workingProducts.length > SHOWCASE_LIMIT;
  const canLoadMore = !demoMode && remoteNextOffset !== null;

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

  const loadMore = async () => {
    if (canExpandShowcase) {
      setBrowseExpanded(true);
      return;
    }
    if (!publicVendorId || remoteNextOffset === null || remoteLoading) return;
    setRemoteLoading(true);
    setRemoteError(false);
    const params = new URLSearchParams({ offset: String(remoteNextOffset), limit: String(REMOTE_PAGE_SIZE) });
    if (query.trim()) params.set("q", query.trim());
    if (category !== "all") params.set("category", category);
    if (brand !== "all") params.set("brand", brand);
    if (color !== "all") params.set("color", color);
    if (size !== "all") params.set("size", size);
    if (availability === "available") params.set("available", "1");
    try {
      const response = await fetch(`/api/catalog/vendor/${encodeURIComponent(publicVendorId)}?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Catalogue request failed with ${response.status}`);
      const payload = await response.json() as VendorCatalogApiResponse;
      setRemoteProducts((current) => dedupeProducts([...(current ?? []), ...payload.products]));
      setRemoteTotal(payload.total);
      setRemoteNextOffset(payload.nextOffset);
      setBrowseExpanded(true);
    } catch (error) {
      console.error("Vendor catalogue load-more failed", error);
      setRemoteError(true);
    } finally {
      setRemoteLoading(false);
    }
  };

  const filterPanel = (mobile = false) => (
    <div className={styles.catalogFilterPanel}>
      <div className={styles.filterHeader}>
        <div>
          <strong>Φίλτρα προϊόντων</strong>
          <span>Η αναζήτηση και τα φίλτρα καλύπτουν ολόκληρο τον κατάλογο του καταστήματος.</span>
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
              <span className={styles.filterCategoryCount}>{catalogueTotal}</span>
            </button>
            {categories.map((entry) => (
              <button
                type="button"
                className={`${styles.filterCategoryButton} ${category === entry.value ? styles.filterCategoryButtonActive : ""}`}
                onClick={() => selectCategory(entry.value)}
                key={entry.value}
              >
                <span>{entry.label}</span>
                <span className={styles.filterCategoryCount}>{entry.count}</span>
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
          {remoteLoading ? "Ενημέρωση καταλόγου…" : `${resultTotal} ${resultTotal === 1 ? "προϊόν" : "προϊόντα"} με τα επιλεγμένα φίλτρα`}
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
              <span><strong>{resultTotal}</strong> αποτελέσματα στον πλήρη κατάλογο.</span>
            ) : (
              <span><strong>{Math.min(SHOWCASE_LIMIT, workingProducts.length)}</strong> επιλογές από {catalogueTotal} προϊόντα.</span>
            )}
            {remoteLoading ? <span>Ενημέρωση…</span> : null}
            {remoteError ? <span>Ο πλήρης κατάλογος δεν ήταν προσωρινά διαθέσιμος· εμφανίζεται η τελευταία διαθέσιμη επιλογή.</span> : null}
            {demoMode ? <span>DEMO · οι κάρτες ανοίγουν πλήρη προεπισκόπηση προϊόντος, χωρίς checkout.</span> : null}
            {query ? <button type="button" className={styles.clearButton} onClick={() => setQuery("")}>Καθαρισμός αναζήτησης</button> : null}
          </div>

          {visibleProducts.length > 0 ? (
            <>
              <div className="vendorCatalogGrid">
                {visibleProducts.map((product, index) => (
                  <CatalogProductCard product={product} index={index} vendorContext={vendor} demoVendorId={demoVendorId} key={product.id} />
                ))}
              </div>
              {(canExpandShowcase || canLoadMore) ? (
                <div style={{ display: "flex", justifyContent: "center", paddingTop: 24 }}>
                  <button type="button" className="button button-secondary" onClick={loadMore} disabled={remoteLoading}>
                    {remoteLoading ? "Φόρτωση…" : canExpandShowcase ? "Δες περισσότερα προϊόντα" : "Φόρτωση περισσότερων"}
                  </button>
                </div>
              ) : null}
            </>
          ) : remoteLoading ? (
            <div className={styles.noResults}>
              <h3>Αναζήτηση στον κατάλογο…</h3>
              <p>Ελέγχουμε ολόκληρο τον κατάλογο του καταστήματος.</p>
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
                Προβολή {resultTotal} {resultTotal === 1 ? "προϊόντος" : "προϊόντων"}
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
