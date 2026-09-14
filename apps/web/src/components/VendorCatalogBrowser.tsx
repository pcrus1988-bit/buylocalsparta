"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { CatalogCard } from "../lib/catalog-view";
import { publicBrandLogoUrl } from "../lib/brand-logo";
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
type FilterState = Readonly<{
  query: string;
  category: string;
  brand: string;
  color: string;
  size: string;
  availability: AvailabilityFilter;
}>;
type PrefetchedPage = Readonly<{
  key: string;
  offset: number;
  payload: VendorCatalogApiResponse;
}>;
type LoaderBrand = Readonly<{ name: string; logoObjectKey: string }>;

const PAGE_SIZE = 20;
const PREFETCH_ROOT_MARGIN = "1200px 0px";
const LOADER_FACT_INTERVAL_MS = 3200;
const LOADER_BRANDS: readonly LoaderBrand[] = [
  { name: "Tommy Hilfiger", logoObjectKey: "brands/tommy-hilfiger-75862adb/logo.png" },
  { name: "Bottega Veneta", logoObjectKey: "brands/bottega-veneta-48904e38/logo.png" },
  { name: "Burberry", logoObjectKey: "brands/burberry-eb203b02/logo.png" },
  { name: "Cartier", logoObjectKey: "brands/cartier-e34c2afa/logo.png" },
  { name: "Ami Paris", logoObjectKey: "brands/ami-paris-151ad16b/logo.webp" },
  { name: "Chloé", logoObjectKey: "brands/chloe-660bd74b/logo.svg" }
];

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

function localMatches(product: CatalogCard, input: FilterState): boolean {
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

function requestKey(filters: FilterState): string {
  return JSON.stringify(filters);
}

function pageParams(filters: FilterState, offset: number): URLSearchParams {
  const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) });
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.category !== "all") params.set("category", filters.category);
  if (filters.brand !== "all") params.set("brand", filters.brand);
  if (filters.color !== "all") params.set("color", filters.color);
  if (filters.size !== "all") params.set("size", filters.size);
  if (filters.availability === "available") params.set("available", "1");
  return params;
}

function VendorCatalogueLoadingOverlay({ fact }: { fact: string }) {
  return <div className="vendorCatalogueLoader" role="status" aria-live="polite" aria-label="Ετοιμάζουμε τα προϊόντα του καταστήματος">
    <div className="vendorLoaderGlow" aria-hidden="true" />
    <div className="vendorLoaderOrbit" aria-hidden="true">
      <div className="vendorLoaderOrbitTrack">
        {LOADER_BRANDS.map((brand, index) => {
          const logoUrl = publicBrandLogoUrl(brand.logoObjectKey);
          const orbitStyle = { "--orbit-angle": `${index * (360 / LOADER_BRANDS.length)}deg` } as CSSProperties;
          return <div className="vendorLoaderOrbitItem" style={orbitStyle} key={brand.name}>
            <div className="vendorLoaderLogoCard">
              {logoUrl ? <img
                src={logoUrl}
                alt=""
                loading="eager"
                decoding="async"
                onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
              /> : null}
            </div>
          </div>;
        })}
      </div>
      <div className="vendorLoaderCore">
        <img src="/brand/kontamou-sparta-logo.webp" alt="" width="92" height="62" />
      </div>
    </div>
    <div className="vendorLoaderCopy">
      <span className="vendorLoaderEyebrow">ΚΟΝΤΑ ΜΟΥ · LIVE CATALOGUE</span>
      <h3>Ετοιμάζουμε τη βιτρίνα</h3>
      <p className="vendorLoaderLead">Τα πρώτα 20 προϊόντα εμφανίζονται μόλις είναι έτοιμα. Τα επόμενα προετοιμάζονται ήδη στο παρασκήνιο.</p>
      <div className="vendorLoaderFact" aria-live="polite">
        <span>Το ήξερες;</span>
        <p key={fact}>{fact}</p>
      </div>
    </div>
  </div>;
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
  const [categoryTransitionLoading, setCategoryTransitionLoading] = useState(false);
  const [publicVendorId, setPublicVendorId] = useState<string>();
  const [remoteProducts, setRemoteProducts] = useState<readonly CatalogCard[] | null>(null);
  const [remoteTotal, setRemoteTotal] = useState<number>();
  const [remoteNextOffset, setRemoteNextOffset] = useState<number | null>(null);
  const [remoteFacets, setRemoteFacets] = useState<RemoteFacets>();
  const [remoteLoading, setRemoteLoading] = useState(!demoVendorId);
  const [remoteAttempted, setRemoteAttempted] = useState(Boolean(demoVendorId));
  const [facetsLoading, setFacetsLoading] = useState(false);
  const [remoteError, setRemoteError] = useState(false);
  const [renderLimit, setRenderLimit] = useState(PAGE_SIZE);
  const [loadingFactIndex, setLoadingFactIndex] = useState(0);
  const demoMode = Boolean(demoVendorId);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const catalogResultsRef = useRef<HTMLDivElement | null>(null);
  const prefetchedPageRef = useRef<PrefetchedPage | null>(null);
  const loadingMoreRef = useRef(false);
  const activeRequestKeyRef = useRef("");

  const filters = useMemo<FilterState>(() => ({
    query,
    category,
    brand,
    color,
    size,
    availability
  }), [availability, brand, category, color, query, size]);
  const filtersKey = useMemo(() => requestKey(filters), [filters]);
  const loadingFacts = useMemo(() => [
    `Στο ${vendor.name}, ο κατάλογος ανοίγει σε γρήγορες σελίδες των ${PAGE_SIZE} προϊόντων αντί να περιμένει ολόκληρο το απόθεμα.`,
    "Οι κατηγορίες και οι μάρκες οργανώνονται στο παρασκήνιο, ώστε η βιτρίνα να γίνει χρήσιμη όσο πιο γρήγορα γίνεται.",
    "Μπορείς να περιορίσεις τον κατάλογο ανά μάρκα, κατηγορία, χρώμα και μέγεθος μόλις ολοκληρωθούν τα φίλτρα.",
    "Η επόμενη σελίδα προϊόντων προφορτώνεται όσο περιηγείσαι, για πιο ομαλό endless scrolling.",
    "Τα λογότυπα εδώ προέρχονται από τον κανονικό κατάλογο brands του ΚΟΝΤΑ ΜΟΥ — όχι από εξωτερικό logo CDN.",
    "Στο ΚΟΝΤΑ ΜΟΥ μπορείς να ανακαλύψεις προϊόντα από διαφορετικά καταστήματα μέσα από μία ενιαία αγορά."
  ], [vendor.name]);

  const initialLocalProducts = useMemo(
    () => products.filter((product) => !isSupplierFulfilled(product)),
    [products]
  );
  const localFiltered = useMemo(
    () => initialLocalProducts.filter((product) => localMatches(product, filters)),
    [filters, initialLocalProducts]
  );
  const fallbackFiltered = useMemo(
    () => products.filter((product) => localMatches(product, filters)),
    [filters, products]
  );
  const workingProducts = useMemo(
    () => !demoMode && !remoteAttempted
      ? []
      : remoteProducts === null
        ? fallbackFiltered
        : dedupeProducts([...remoteProducts, ...localFiltered]),
    [demoMode, fallbackFiltered, localFiltered, remoteAttempted, remoteProducts]
  );
  const visibleProducts = useMemo(
    () => workingProducts.slice(0, renderLimit),
    [renderLimit, workingProducts]
  );

  useEffect(() => {
    if (!remoteLoading || visibleProducts.length > 0 || demoMode) {
      setLoadingFactIndex(0);
      return;
    }
    const interval = window.setInterval(() => {
      setLoadingFactIndex((current) => (current + 1) % loadingFacts.length);
    }, LOADER_FACT_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [demoMode, loadingFacts.length, remoteLoading, visibleProducts.length]);

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

  const fetchPage = useCallback(async (
    vendorId: string,
    input: FilterState,
    offset: number,
    signal?: AbortSignal
  ): Promise<VendorCatalogApiResponse> => {
    const response = await fetch(`/api/catalog/vendor/${encodeURIComponent(vendorId)}?${pageParams(input, offset).toString()}`, {
      signal,
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`Catalogue request failed with ${response.status}`);
    return response.json() as Promise<VendorCatalogApiResponse>;
  }, []);

  const prefetchNextPage = useCallback(async (
    vendorId: string,
    input: FilterState,
    key: string,
    offset: number | null
  ) => {
    if (offset === null || demoMode) {
      prefetchedPageRef.current = null;
      return;
    }
    try {
      const payload = await fetchPage(vendorId, input, offset);
      if (activeRequestKeyRef.current !== key) return;
      prefetchedPageRef.current = { key, offset, payload };
    } catch {
      // Prefetch is opportunistic. The sentinel will retry on demand.
    }
  }, [demoMode, fetchPage]);

  useEffect(() => {
    if (!publicVendorId || demoMode) return;
    const controller = new AbortController();
    const key = filtersKey;
    activeRequestKeyRef.current = key;
    prefetchedPageRef.current = null;
    setRenderLimit(PAGE_SIZE);
    setRemoteLoading(true);
    setRemoteError(false);
    const delay = query.trim() ? 240 : 0;
    const timer = window.setTimeout(async () => {
      try {
        const payload = await fetchPage(publicVendorId, filters, 0, controller.signal);
        if (controller.signal.aborted || activeRequestKeyRef.current !== key) return;
        setRemoteProducts(payload.products);
        setRemoteTotal(payload.total);
        setRemoteNextOffset(payload.nextOffset);
        setRemoteAttempted(true);
        void prefetchNextPage(publicVendorId, filters, key, payload.nextOffset);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Vendor catalogue first page failed", error);
        setRemoteAttempted(true);
        setRemoteError(true);
      } finally {
        if (!controller.signal.aborted && activeRequestKeyRef.current === key) {
          setRemoteLoading(false);
          setCategoryTransitionLoading(false);
        }
      }
    }, delay);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [demoMode, fetchPage, filters, filtersKey, prefetchNextPage, publicVendorId, query]);

  useEffect(() => {
    if (!publicVendorId || demoMode || remoteFacets) return;
    let cancelled = false;
    let timer = 0;
    const loadFacets = async () => {
      setFacetsLoading(true);
      try {
        const params = new URLSearchParams({ facets: "1", facetsOnly: "1" });
        const response = await fetch(`/api/catalog/vendor/${encodeURIComponent(publicVendorId)}?${params.toString()}`, {
          cache: "default"
        });
        if (!response.ok) throw new Error(`Facet request failed with ${response.status}`);
        const payload = await response.json() as VendorCatalogApiResponse;
        if (!cancelled && payload.facets) setRemoteFacets(payload.facets);
      } catch (error) {
        if (!cancelled) console.error("Vendor catalogue facets failed", error);
      } finally {
        if (!cancelled) setFacetsLoading(false);
      }
    };

    const idleWindow = window as Window & typeof globalThis & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(() => { void loadFacets(); }, { timeout: 1200 });
      return () => {
        cancelled = true;
        idleWindow.cancelIdleCallback?.(idleId);
      };
    }
    timer = window.setTimeout(() => { void loadFacets(); }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [demoMode, publicVendorId, remoteFacets]);

  const categories = useMemo(
    () => remoteFacets?.categories ?? (demoMode || remoteError ? fallbackCategoryOptions(products) : []),
    [demoMode, products, remoteError, remoteFacets]
  );
  const fallbackCategoryProducts = useMemo(
    () => category === "all" ? products : products.filter((product) => product.categoryCode === category),
    [category, products]
  );
  const brands = useMemo(
    () => remoteFacets?.brands.map((entry) => entry.value) ?? (demoMode || remoteError ? unique(fallbackCategoryProducts.map((product) => product.brand)) : []),
    [demoMode, fallbackCategoryProducts, remoteError, remoteFacets]
  );
  const colors = useMemo(
    () => remoteFacets?.colors.map((entry) => entry.value) ?? (demoMode || remoteError ? unique(fallbackCategoryProducts.map((product) => product.color)) : []),
    [demoMode, fallbackCategoryProducts, remoteError, remoteFacets]
  );
  const sizes = useMemo(
    () => remoteFacets?.sizes.map((entry) => entry.value) ?? (demoMode || remoteError ? unique(fallbackCategoryProducts.flatMap((product) => product.sizes)) : []),
    [demoMode, fallbackCategoryProducts, remoteError, remoteFacets]
  );

  const filtersActive = category !== "all" || brand !== "all" || color !== "all" || size !== "all" || availability !== "all";
  const activeFilterCount = [category !== "all", brand !== "all", color !== "all", size !== "all", availability !== "all"].filter(Boolean).length;
  const resultTotal = !demoMode && !remoteAttempted
    ? 0
    : remoteProducts === null
      ? fallbackFiltered.length
      : (remoteTotal ?? remoteProducts.length) + localFiltered.length;
  const catalogueTotal = remoteFacets?.total !== undefined
    ? remoteFacets.total + initialLocalProducts.length
    : remoteTotal !== undefined
      ? remoteTotal + initialLocalProducts.length
      : !demoMode && !remoteAttempted
        ? 0
        : products.length;
  const hasBufferedProducts = renderLimit < workingProducts.length;
  const canLoadRemote = !demoMode && remoteNextOffset !== null;
  const hasMore = hasBufferedProducts || canLoadRemote;

  const loadNext = useCallback(async () => {
    if (loadingMoreRef.current) return;
    if (renderLimit < workingProducts.length) {
      setRenderLimit((current) => current + PAGE_SIZE);
      return;
    }
    if (!publicVendorId || remoteNextOffset === null || demoMode) return;

    loadingMoreRef.current = true;
    const key = filtersKey;
    try {
      let payload: VendorCatalogApiResponse;
      const prefetched = prefetchedPageRef.current;
      if (prefetched && prefetched.key === key && prefetched.offset === remoteNextOffset) {
        payload = prefetched.payload;
        prefetchedPageRef.current = null;
      } else {
        payload = await fetchPage(publicVendorId, filters, remoteNextOffset);
      }
      if (activeRequestKeyRef.current !== key) return;
      setRemoteProducts((current) => dedupeProducts([...(current ?? []), ...payload.products]));
      setRemoteTotal(payload.total);
      setRemoteNextOffset(payload.nextOffset);
      setRenderLimit((current) => current + PAGE_SIZE);
      void prefetchNextPage(publicVendorId, filters, key, payload.nextOffset);
    } catch (error) {
      console.error("Vendor catalogue infinite pagination failed", error);
      setRemoteError(true);
    } finally {
      loadingMoreRef.current = false;
    }
  }, [demoMode, fetchPage, filters, filtersKey, prefetchNextPage, publicVendorId, remoteNextOffset, renderLimit, workingProducts.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadNext();
    }, { rootMargin: PREFETCH_ROOT_MARGIN });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadNext]);

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
    const categoryChanged = nextCategory !== category;
    if (categoryChanged && !demoMode) {
      setCategoryTransitionLoading(true);
      setRemoteLoading(true);
    }
    setCategory(nextCategory);
    resetSecondaryFilters();
    setFiltersOpen(false);

    // The mobile sheet locks body scrolling. Wait until it has closed and its
    // scroll lock has been released, then place the results section at the top
    // of the viewport regardless of the user's previous scroll position.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        catalogResultsRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
      });
    });
  };

  const filterPanel = (mobile = false) => (
    <div className={styles.catalogFilterPanel}>
      <div className={styles.filterHeader}>
        <div>
          <strong>Φίλτρα προϊόντων</strong>
          <span>{facetsLoading ? "Φορτώνουμε κατηγορίες και μάρκες στο παρασκήνιο…" : "Η αναζήτηση και τα φίλτρα καλύπτουν ολόκληρο τον κατάλογο του καταστήματος."}</span>
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
          {remoteLoading ? "Ετοιμάζουμε τη βιτρίνα…" : `${resultTotal} ${resultTotal === 1 ? "προϊόν" : "προϊόντα"} με τα επιλεγμένα φίλτρα`}
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

        <div ref={catalogResultsRef} className={styles.catalogResults} style={{ scrollMarginTop: 88 }}>
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
            <span><strong>{Math.min(PAGE_SIZE, visibleProducts.length)}</strong> άμεσες επιλογές · {resultTotal} προϊόντα στον κατάλογο.</span>
            {facetsLoading ? <span>Κατηγορίες & μάρκες φορτώνουν στο παρασκήνιο…</span> : null}
            {remoteError ? <span>Ο πλήρης κατάλογος δεν ήταν προσωρινά διαθέσιμος· εμφανίζεται η τελευταία διαθέσιμη επιλογή.</span> : null}
            {demoMode ? <span>DEMO · οι κάρτες ανοίγουν πλήρη προεπισκόπηση προϊόντος, χωρίς checkout.</span> : null}
            {query ? <button type="button" className={styles.clearButton} onClick={() => setQuery("")}>Καθαρισμός αναζήτησης</button> : null}
          </div>

          {categoryTransitionLoading ? (
            <VendorCatalogueLoadingOverlay fact={loadingFacts[loadingFactIndex] ?? loadingFacts[0]} />
          ) : visibleProducts.length > 0 ? (
            <>
              <div className="vendorCatalogGrid">
                {visibleProducts.map((product, index) => (
                  <CatalogProductCard product={product} index={index} vendorContext={vendor} demoVendorId={demoVendorId} key={product.id} />
                ))}
              </div>
              {hasMore ? (
                <div ref={sentinelRef} aria-live="polite" style={{ minHeight: 72, display: "grid", placeItems: "center", paddingTop: 16 }}>
                  <span>{loadingMoreRef.current ? "Φόρτωση επόμενων προϊόντων…" : ""}</span>
                </div>
              ) : null}
            </>
          ) : remoteLoading ? (
            <VendorCatalogueLoadingOverlay fact={loadingFacts[loadingFactIndex] ?? loadingFacts[0]} />
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
        .vendorCatalogueLoader {
          position: relative;
          min-height: 500px;
          overflow: hidden;
          display: grid;
          grid-template-columns: minmax(280px, .9fr) minmax(300px, 1.1fr);
          align-items: center;
          gap: 46px;
          padding: clamp(34px, 6vw, 72px);
          border: 1px solid rgba(24,48,39,.14);
          border-radius: 28px;
          background: linear-gradient(145deg, rgba(255,253,248,.96), rgba(237,238,228,.88));
          box-shadow: 0 22px 70px rgba(24,48,39,.08);
          isolation: isolate;
        }
        .vendorLoaderGlow {
          position: absolute;
          z-index: -1;
          width: 360px;
          height: 360px;
          left: -80px;
          top: -110px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(178,150,97,.22), rgba(178,150,97,0) 70%);
          filter: blur(4px);
        }
        .vendorLoaderOrbit {
          position: relative;
          width: min(330px, 72vw);
          aspect-ratio: 1;
          justify-self: center;
          display: grid;
          place-items: center;
        }
        .vendorLoaderOrbit::before,
        .vendorLoaderOrbit::after {
          content: "";
          position: absolute;
          inset: 16%;
          border: 1px solid rgba(24,48,39,.14);
          border-radius: 50%;
        }
        .vendorLoaderOrbit::after {
          inset: 3%;
          border-style: dashed;
          border-color: rgba(178,150,97,.32);
        }
        .vendorLoaderOrbitTrack {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          animation: vendorOrbitSpin 12s linear infinite;
        }
        .vendorLoaderOrbitItem {
          --orbit-radius: 132px;
          position: absolute;
          left: 50%;
          top: 50%;
          width: 68px;
          height: 46px;
          margin: -23px 0 0 -34px;
          transform: rotate(var(--orbit-angle)) translateY(calc(-1 * var(--orbit-radius))) rotate(calc(-1 * var(--orbit-angle)));
        }
        .vendorLoaderLogoCard {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          padding: 8px;
          border: 1px solid rgba(24,48,39,.12);
          border-radius: 12px;
          background: rgba(255,255,255,.94);
          box-shadow: 0 8px 24px rgba(24,48,39,.10);
          animation: vendorOrbitCounterSpin 12s linear infinite;
        }
        .vendorLoaderLogoCard img {
          display: block;
          max-width: 100%;
          max-height: 24px;
          width: auto;
          height: auto;
          object-fit: contain;
        }
        .vendorLoaderCore {
          position: relative;
          z-index: 2;
          width: 130px;
          height: 130px;
          display: grid;
          place-items: center;
          padding: 18px;
          border: 1px solid rgba(24,48,39,.14);
          border-radius: 50%;
          background: rgba(255,253,248,.98);
          box-shadow: 0 18px 50px rgba(24,48,39,.13);
        }
        .vendorLoaderCore img {
          max-width: 100%;
          height: auto;
          object-fit: contain;
        }
        .vendorLoaderCopy { min-width: 0; }
        .vendorLoaderEyebrow {
          display: inline-flex;
          margin-bottom: 12px;
          color: var(--ink-soft);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .12em;
        }
        .vendorLoaderCopy h3 {
          margin: 0;
          font-family: Georgia, 'Times New Roman', serif;
          font-size: clamp(34px, 4.5vw, 54px);
          font-weight: 500;
          line-height: 1.04;
        }
        .vendorLoaderLead {
          max-width: 560px;
          margin: 16px 0 0;
          color: var(--ink-soft);
          font-size: 14px;
          line-height: 1.7;
        }
        .vendorLoaderFact {
          min-height: 118px;
          margin-top: 30px;
          padding: 18px 20px;
          border-left: 3px solid var(--brass);
          border-radius: 0 16px 16px 0;
          background: rgba(255,253,248,.64);
        }
        .vendorLoaderFact > span {
          display: block;
          margin-bottom: 7px;
          color: var(--ink-soft);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .vendorLoaderFact p {
          margin: 0;
          color: var(--ink);
          font-size: 13px;
          line-height: 1.65;
          animation: vendorFactFade 3.2s ease-in-out both;
        }
        @keyframes vendorOrbitSpin { to { transform: rotate(360deg); } }
        @keyframes vendorOrbitCounterSpin { to { transform: rotate(-360deg); } }
        @keyframes vendorFactFade {
          0% { opacity: 0; transform: translateY(6px); }
          12%, 78% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-4px); }
        }
        @media (max-width: 1180px) {
          .vendorCatalogGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 780px) {
          .vendorCatalogueLoader {
            min-height: 520px;
            grid-template-columns: 1fr;
            gap: 18px;
            padding: 28px 20px 34px;
            text-align: center;
          }
          .vendorLoaderOrbit { width: min(280px, 76vw); }
          .vendorLoaderOrbitItem { --orbit-radius: 108px; }
          .vendorLoaderCore { width: 112px; height: 112px; }
          .vendorLoaderLead { margin-left: auto; margin-right: auto; }
          .vendorLoaderFact {
            min-height: 126px;
            border-left: 0;
            border-top: 3px solid var(--brass);
            border-radius: 0 0 16px 16px;
          }
        }
        @media (max-width: 640px) {
          .vendorCatalogGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
          .vendorCatalogGrid :global(.product-art) { height: 160px; padding: 8px; }
          .vendorCatalogGrid :global(.product-body) { padding: 12px; }
          .vendorCatalogGrid :global(.product-body h3) { font-size: 18px; }
          .vendorCatalogGrid :global(.product-body .eyebrow) { font-size: 9px; }
          .vendorLoaderOrbitItem { width: 60px; height: 42px; margin: -21px 0 0 -30px; }
          .vendorLoaderLogoCard img { max-height: 20px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .vendorLoaderOrbitTrack,
          .vendorLoaderLogoCard,
          .vendorLoaderFact p { animation: none; }
        }
      `}</style>
    </div>
  );
}