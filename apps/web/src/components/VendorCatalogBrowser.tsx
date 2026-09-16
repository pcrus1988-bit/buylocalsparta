"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogCard } from "../lib/catalog-view";
import { CatalogProductCard } from "./CatalogProductCard";

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
  total?: number;
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
type GuideAudience = "women" | "men" | "accessories";
type GuideFamily = "shoes" | "clothing" | "underwear" | "bags" | "jewellery" | "eyewear" | "accessories" | "other";

type GuideGroup = Readonly<{
  key: GuideFamily;
  label: string;
  helper: string;
  entries: readonly RemoteFacetOption[];
  count: number;
}>;

const PAGE_SIZE = 20;
const FIRST_PAGE_TIMEOUT_MS = 8000;
const SPECIAL_FASHION_VENDOR_ID = "vendor_e8cb57b3c67b469d9a9d";
const VENDOR_ID_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;

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

function audienceFor(entry: RemoteFacetOption): GuideAudience {
  const label = normalized(entry.label);
  if (label.includes("γυναικ")) return "women";
  if (label.includes("ανδρ")) return "men";
  return "accessories";
}

function familyFor(entry: RemoteFacetOption): GuideFamily {
  const label = normalized(entry.label);
  if (["sneaker", "παπουτ", "μποτ", "σανδαλ"].some((word) => label.includes(word))) return "shoes";
  if (["t-shirt", "t shirt", "αθλητικ", "κοστουμ", "μπουφαν", "παλτο", "παντελον", "jeans", "πλεκ", "πουκαμισ", "φουστ", "φορεμ", "top", "τοπ"].some((word) => label.includes(word))) return "clothing";
  if (["εσωρουχ", "μαγιο"].some((word) => label.includes(word))) return "underwear";
  if (["τσαντ", "σακιδ", "πορτοφολ", "αποσκευ", "θηκ"].some((word) => label.includes(word))) return "bags";
  if (["δαχτυλ", "κολιε", "σκουλαρ", "βραχιολ", "κοσμη"].some((word) => label.includes(word))) return "jewellery";
  if (["γυαλ", "σκελετ ορασ"].some((word) => label.includes(word))) return "eyewear";
  if (["ζων", "κασκολ", "καπελ", "γαντ"].some((word) => label.includes(word))) return "accessories";
  return "other";
}

const FAMILY_META: Readonly<Record<GuideFamily, Readonly<{ label: string; helper: string }>>> = {
  shoes: { label: "Παπούτσια", helper: "Sneakers, μπότες, επίσημα & σανδάλια" },
  clothing: { label: "Ρούχα", helper: "Καθημερινά, formal, παντελόνια, πλεκτά & άλλα" },
  underwear: { label: "Εσώρουχα & μαγιό", helper: "Εσώρουχα και swimwear" },
  bags: { label: "Τσάντες & αποσκευές", helper: "Τσάντες, σακίδια, πορτοφόλια & travel" },
  jewellery: { label: "Κοσμήματα", helper: "Δαχτυλίδια, κολιέ, σκουλαρίκια & βραχιόλια" },
  eyewear: { label: "Γυαλιά", helper: "Γυαλιά ηλίου & σκελετοί οράσεως" },
  accessories: { label: "Αξεσουάρ", helper: "Ζώνες, κασκόλ, καπέλα & γάντια" },
  other: { label: "Άλλα", helper: "Περισσότερες επιλογές μόδας" }
};

function buildGroups(entries: readonly RemoteFacetOption[]): readonly GuideGroup[] {
  const order: readonly GuideFamily[] = ["shoes", "clothing", "underwear", "bags", "jewellery", "eyewear", "accessories", "other"];
  return order.flatMap((key) => {
    const children = entries.filter((entry) => familyFor(entry) === key);
    if (!children.length) return [];
    return [{
      key,
      label: FAMILY_META[key].label,
      helper: FAMILY_META[key].helper,
      entries: children,
      count: children.reduce((sum, entry) => sum + entry.count, 0)
    }];
  });
}

function audienceLabel(audience: GuideAudience): string {
  if (audience === "women") return "Γυναικεία";
  if (audience === "men") return "Ανδρικά";
  return "Αξεσουάρ & τσάντες";
}

export function VendorCatalogBrowser({ products, vendor, demoVendorId, vendorId }: {
  products: readonly CatalogCard[];
  vendor: Readonly<{ name: string; adviser?: string }>;
  demoVendorId?: string;
  vendorId?: string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [brand, setBrand] = useState("all");
  const [color, setColor] = useState("all");
  const [size, setSize] = useState("all");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideAudience, setGuideAudience] = useState<GuideAudience | null>(null);
  const [guideFamily, setGuideFamily] = useState<GuideFamily | null>(null);
  const [remoteProducts, setRemoteProducts] = useState<readonly CatalogCard[] | null>(demoVendorId ? products : null);
  const [remoteTotal, setRemoteTotal] = useState<number | undefined>(demoVendorId ? products.length : undefined);
  const [remoteNextOffset, setRemoteNextOffset] = useState<number | null>(null);
  const [remoteFacets, setRemoteFacets] = useState<RemoteFacets>();
  const [remoteLoading, setRemoteLoading] = useState(!demoVendorId);
  const [facetsLoading, setFacetsLoading] = useState(false);
  const [remoteError, setRemoteError] = useState(false);
  const [publicVendorId, setPublicVendorId] = useState<string | undefined>(() => vendorId && VENDOR_ID_PATTERN.test(vendorId) ? vendorId : undefined);
  const initialGuideHandled = useRef(false);
  const requestSerial = useRef(0);
  const catalogResultsRef = useRef<HTMLDivElement | null>(null);

  const demoMode = Boolean(demoVendorId);
  const isGuidedFashionVendor = (publicVendorId ?? vendorId) === SPECIAL_FASHION_VENDOR_ID;
  const filters = useMemo<FilterState>(() => ({ query, category, brand, color, size, availability }), [availability, brand, category, color, query, size]);

  useEffect(() => {
    if (demoMode || publicVendorId) return;
    const match = window.location.pathname.match(/^\/vendor\/([^/?#]+)/);
    if (!match?.[1]) return;
    try {
      const decoded = decodeURIComponent(match[1]);
      if (VENDOR_ID_PATTERN.test(decoded)) setPublicVendorId(decoded);
    } catch {
      setRemoteError(true);
      setRemoteLoading(false);
    }
  }, [demoMode, publicVendorId]);

  const fetchPage = useCallback(async (id: string, input: FilterState, offset: number, signal?: AbortSignal) => {
    const response = await fetch(`/api/catalog/vendor/${encodeURIComponent(id)}?${pageParams(input, offset).toString()}`, { signal, cache: "default" });
    if (!response.ok) throw new Error(`Catalogue request failed with ${response.status}`);
    return response.json() as Promise<VendorCatalogApiResponse>;
  }, []);

  useEffect(() => {
    if (!publicVendorId || demoMode) return;
    const serial = ++requestSerial.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setRemoteLoading(true);
      setRemoteError(false);
      try {
        const payload = await fetchPage(publicVendorId, filters, 0, controller.signal);
        if (serial !== requestSerial.current) return;
        setRemoteProducts(payload.products);
        setRemoteTotal(typeof payload.total === "number" ? payload.total : payload.products.length);
        setRemoteNextOffset(payload.nextOffset);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Vendor catalogue request failed", error);
          setRemoteError(true);
        }
      } finally {
        if (serial === requestSerial.current) setRemoteLoading(false);
      }
    }, query.trim() ? 220 : 0);
    const watchdog = window.setTimeout(() => controller.abort(), FIRST_PAGE_TIMEOUT_MS + (query.trim() ? 220 : 0));
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(watchdog);
      controller.abort();
    };
  }, [demoMode, fetchPage, filters, publicVendorId, query]);

  useEffect(() => {
    if (!publicVendorId || demoMode || remoteFacets) return;
    let cancelled = false;
    const load = async () => {
      setFacetsLoading(true);
      try {
        const response = await fetch(`/api/catalog/vendor/${encodeURIComponent(publicVendorId)}?facets=1&facetsOnly=1`, { cache: "default" });
        if (!response.ok) throw new Error(`Facet request failed with ${response.status}`);
        const payload = await response.json() as VendorCatalogApiResponse;
        if (!cancelled && payload.facets) {
          setRemoteFacets(payload.facets);
          setRemoteTotal(payload.facets.total);
        }
      } catch (error) {
        if (!cancelled) console.error("Vendor catalogue facets failed", error);
      } finally {
        if (!cancelled) setFacetsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [demoMode, publicVendorId, remoteFacets]);

  const categories = useMemo(() => remoteFacets?.categories ?? fallbackCategoryOptions(products), [products, remoteFacets]);
  const brands = useMemo(() => remoteFacets?.brands.map((entry) => entry.value) ?? unique(products.map((product) => product.brand)), [products, remoteFacets]);
  const colors = useMemo(() => remoteFacets?.colors.map((entry) => entry.value) ?? unique(products.map((product) => product.color)), [products, remoteFacets]);
  const sizes = useMemo(() => remoteFacets?.sizes.map((entry) => entry.value) ?? unique(products.flatMap((product) => product.sizes)), [products, remoteFacets]);

  useEffect(() => {
    if (!isGuidedFashionVendor || initialGuideHandled.current || (!categories.length && facetsLoading)) return;
    initialGuideHandled.current = true;
    const url = new URL(window.location.href);
    const requested = url.searchParams.get("fashionCategory");
    if (requested && categories.some((entry) => entry.value === requested)) {
      setCategory(requested);
      return;
    }
    setGuideOpen(true);
  }, [categories, facetsLoading, isGuidedFashionVendor]);

  useEffect(() => {
    if (!guideOpen && !filtersOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (guideOpen) setGuideOpen(false);
      else setFiltersOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [filtersOpen, guideOpen]);

  const resetSecondaryFilters = () => {
    setBrand("all");
    setColor("all");
    setSize("all");
    setAvailability("all");
  };

  const selectCategory = (nextCategory: string) => {
    setCategory(nextCategory);
    resetSecondaryFilters();
    setFiltersOpen(false);
    setGuideOpen(false);
    if (isGuidedFashionVendor) {
      const url = new URL(window.location.href);
      if (nextCategory === "all") url.searchParams.delete("fashionCategory");
      else url.searchParams.set("fashionCategory", nextCategory);
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
    window.requestAnimationFrame(() => catalogResultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const resetAllFilters = () => {
    setQuery("");
    setCategory("all");
    setBrand("all");
    setColor("all");
    setSize("all");
    setAvailability("all");
  };

  const reopenGuide = () => {
    resetAllFilters();
    setGuideAudience(null);
    setGuideFamily(null);
    setFiltersOpen(false);
    setGuideOpen(true);
  };

  const loadMore = async () => {
    if (!publicVendorId || remoteNextOffset === null || remoteLoading || demoMode) return;
    setRemoteLoading(true);
    try {
      const payload = await fetchPage(publicVendorId, filters, remoteNextOffset);
      setRemoteProducts((current) => dedupeProducts([...(current ?? []), ...payload.products]));
      if (typeof payload.total === "number") setRemoteTotal(payload.total);
      setRemoteNextOffset(payload.nextOffset);
    } catch (error) {
      console.error("Vendor catalogue next page failed", error);
      setRemoteError(true);
    } finally {
      setRemoteLoading(false);
    }
  };

  const visibleProducts = remoteProducts ?? products;
  const total = remoteFacets?.total ?? remoteTotal ?? visibleProducts.length;
  const activeFilterCount = [category !== "all", brand !== "all", color !== "all", size !== "all", availability !== "all"].filter(Boolean).length;
  const audienceEntries = guideAudience ? categories.filter((entry) => audienceFor(entry) === guideAudience) : [];
  const guideGroups = buildGroups(audienceEntries);
  const selectedGroup = guideFamily ? guideGroups.find((group) => group.key === guideFamily) : undefined;
  const audienceCounts = useMemo(() => ({
    women: categories.filter((entry) => audienceFor(entry) === "women").reduce((sum, entry) => sum + entry.count, 0),
    men: categories.filter((entry) => audienceFor(entry) === "men").reduce((sum, entry) => sum + entry.count, 0),
    accessories: categories.filter((entry) => audienceFor(entry) === "accessories").reduce((sum, entry) => sum + entry.count, 0)
  }), [categories]);

  const goGuideBack = () => {
    if (guideFamily) setGuideFamily(null);
    else if (guideAudience) setGuideAudience(null);
    else setGuideOpen(false);
  };

  const guideTitle = selectedGroup
    ? selectedGroup.label
    : guideAudience
      ? audienceLabel(guideAudience)
      : "Τι ψάχνετε σήμερα;";
  const guideSubtitle = selectedGroup
    ? "Διάλεξε την κατηγορία που σε ενδιαφέρει."
    : guideAudience
      ? "Ομαδοποιήσαμε τον κατάλογο για να φτάσεις γρήγορα στο σωστό προϊόν."
      : "Πες μας πρώτα για ποιον ή τι ψάχνεις. Θα σε οδηγήσουμε βήμα-βήμα αντί να σε αφήσουμε μέσα σε χιλιάδες προϊόντα.";

  const filterPanel = (mobile = false) => (
    <div className="vc-filter-panel">
      <div className="vc-filter-head">
        <div><strong>Φίλτρα προϊόντων</strong><span>{facetsLoading ? "Οργανώνουμε τις επιλογές…" : "Τα φίλτρα καλύπτουν ολόκληρο τον κατάλογο."}</span></div>
        {activeFilterCount ? <button type="button" onClick={resetAllFilters}>Καθαρισμός</button> : null}
      </div>
      {isGuidedFashionVendor ? (
        <button className="vc-guide-trigger" type="button" onClick={reopenGuide}>
          <span><small>ΟΔΗΓΟΣ ΜΟΔΑΣ</small><strong>Βρες αυτό που ψάχνεις</strong></span><b>→</b>
        </button>
      ) : null}
      {categories.length ? <div className="vc-filter-section">
        <span className="vc-label">Κατηγορίες</span>
        <div className="vc-category-list">
          <button className={category === "all" ? "active" : ""} type="button" onClick={() => selectCategory("all")}><span>Όλα τα προϊόντα</span><em>{remoteFacets?.total ?? total}</em></button>
          {categories.map((entry) => <button className={category === entry.value ? "active" : ""} type="button" onClick={() => selectCategory(entry.value)} key={entry.value}><span>{entry.label}</span><em>{entry.count}</em></button>)}
        </div>
      </div> : null}
      <div className="vc-filter-section">
        <span className="vc-label">Περισσότερα φίλτρα</span>
        <div className="vc-fields">
          {brands.length > 1 ? <label><span>Μάρκα</span><select value={brand} onChange={(event) => setBrand(event.target.value)}><option value="all">Όλες</option>{brands.map((value) => <option value={value} key={value}>{value}</option>)}</select></label> : null}
          {colors.length > 1 ? <label><span>Χρώμα</span><select value={color} onChange={(event) => setColor(event.target.value)}><option value="all">Όλα</option>{colors.map((value) => <option value={value} key={value}>{value}</option>)}</select></label> : null}
          {sizes.length > 1 ? <label><span>Μέγεθος</span><select value={size} onChange={(event) => setSize(event.target.value)}><option value="all">Όλα</option>{sizes.map((value) => <option value={value} key={value}>{value}</option>)}</select></label> : null}
          <label><span>Διαθεσιμότητα</span><select value={availability} onChange={(event) => setAvailability(event.target.value as AvailabilityFilter)}><option value="all">Όλα</option><option value="available">Διαθέσιμα τώρα</option></select></label>
        </div>
      </div>
      {mobile ? <div className="vc-mobile-hint">{remoteLoading ? "Ετοιμάζουμε τη βιτρίνα…" : `${total} προϊόντα με τα επιλεγμένα φίλτρα`}</div> : null}
    </div>
  );

  return <div className="vc-browser">
    <div className="vc-layout">
      <aside className="vc-sidebar" aria-label="Κατηγορίες και φίλτρα προϊόντων">{filterPanel()}</aside>
      <div className="vc-results" ref={catalogResultsRef}>
        {isGuidedFashionVendor ? <div className="vc-active-guide">
          <div><small>Η επιλογή σου</small><strong>{category === "all" ? "Όλη η μόδα" : categories.find((entry) => entry.value === category)?.label ?? "Μόδα"}</strong></div>
          <button type="button" onClick={reopenGuide}>Αλλαγή αναζήτησης</button>
        </div> : null}
        <label className="vc-search"><span>Αναζήτηση στο κατάστημα</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value.slice(0, 120))} placeholder="Προϊόν, μάρκα, κωδικός…" /></label>
        <div className="vc-meta"><span><strong>{visibleProducts.length}</strong> επιλογές τώρα · {total} προϊόντα στον κατάλογο.</span>{remoteError ? <span>Υπήρξε προσωρινό πρόβλημα φόρτωσης. Μπορείς να αλλάξεις φίλτρα ή να δοκιμάσεις ξανά.</span> : null}</div>
        {remoteLoading && !visibleProducts.length ? <div className="vc-loading"><span className="vc-spinner" /><strong>Ετοιμάζουμε τη βιτρίνα…</strong><p>Φορτώνουμε μόνο ό,τι χρειάζεται για την επιλογή σου.</p></div> : visibleProducts.length ? <>
          <div className="vc-grid">{visibleProducts.map((product, index) => <CatalogProductCard product={product} index={index} vendorContext={vendor} demoVendorId={demoVendorId} key={product.id} />)}</div>
          {remoteNextOffset !== null && !demoMode ? <button className="vc-more" type="button" onClick={() => void loadMore()} disabled={remoteLoading}>{remoteLoading ? "Φόρτωση…" : "Περισσότερα προϊόντα"}</button> : null}
        </> : <div className="vc-empty"><h3>Δεν βρέθηκε προϊόν.</h3><p>Δοκίμασε διαφορετική επιλογή ή επέστρεψε στον οδηγό.</p><button className="button" type="button" onClick={isGuidedFashionVendor ? reopenGuide : resetAllFilters}>{isGuidedFashionVendor ? "Από την αρχή" : "Καθαρισμός φίλτρων"}</button></div>}
      </div>
    </div>

    <div className="vc-mobile-dock" role="search"><input type="search" value={query} onChange={(event) => setQuery(event.target.value.slice(0, 120))} placeholder="Αναζήτηση προϊόντος…" /><button type="button" onClick={() => setFiltersOpen(true)}>Φίλτρα{activeFilterCount ? ` · ${activeFilterCount}` : ""}</button>{isGuidedFashionVendor ? <button className="guide" type="button" onClick={reopenGuide}>Οδηγός</button> : null}</div>

    {filtersOpen ? <div className="vc-sheet-layer"><button className="vc-backdrop" type="button" onClick={() => setFiltersOpen(false)} aria-label="Κλείσιμο φίλτρων" /><aside className="vc-sheet" role="dialog" aria-modal="true" aria-label="Φίλτρα προϊόντων"><header><div><span>Κατάλογος</span><strong>Κατηγορίες & φίλτρα</strong></div><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Κλείσιμο">×</button></header><div className="vc-sheet-body">{filterPanel(true)}</div><footer><button className="button" type="button" onClick={() => setFiltersOpen(false)}>Προβολή {total} προϊόντων</button></footer></aside></div> : null}

    {isGuidedFashionVendor && guideOpen ? <div className="fashion-guide" role="dialog" aria-modal="true" aria-labelledby="fashion-guide-title">
      <div className="fashion-guide-shell">
        <header className="fashion-guide-header">
          <div className="fashion-guide-brand"><span>ΚΟΝΤΑ ΜΟΥ</span><small>ΠΡΟΣΩΠΙΚΟΣ ΟΔΗΓΟΣ ΜΟΔΑΣ</small></div>
          <button className="fashion-guide-close" type="button" onClick={() => setGuideOpen(false)} aria-label="Κλείσιμο">×</button>
        </header>
        <main className="fashion-guide-main">
          <div className="fashion-guide-breadcrumb">Μόδα{guideAudience ? ` / ${audienceLabel(guideAudience)}` : ""}{selectedGroup ? ` / ${selectedGroup.label}` : ""}</div>
          <div className="fashion-guide-heading"><p>ΛΙΓΟ ΠΙΟ ΕΥΚΟΛΑ</p><h2 id="fashion-guide-title">{guideTitle}</h2><span>{guideSubtitle}</span></div>
          {!categories.length ? <div className="fashion-guide-wait"><span className="vc-spinner" /><strong>Οργανώνουμε τον κατάλογο…</strong></div> : selectedGroup ? <div className="fashion-guide-options leaf-options">
            {selectedGroup.entries.map((entry) => <button type="button" onClick={() => selectCategory(entry.value)} key={entry.value}><span><strong>{entry.label}</strong><small>Δες μόνο αυτή την κατηγορία</small></span><em>{entry.count}</em><b>→</b></button>)}
          </div> : guideAudience ? <div className="fashion-guide-options">
            {guideGroups.map((group) => <button type="button" onClick={() => setGuideFamily(group.key)} key={group.key}><span><strong>{group.label}</strong><small>{group.helper}</small></span><em>{group.count}</em><b>→</b></button>)}
          </div> : <div className="fashion-guide-options audience-options">
            <button type="button" onClick={() => setGuideAudience("women")}><span className="guide-icon">♀</span><span><strong>Γυναικεία</strong><small>Ρούχα, παπούτσια, τσάντες & άλλα</small></span><em>{audienceCounts.women}</em><b>→</b></button>
            <button type="button" onClick={() => setGuideAudience("men")}><span className="guide-icon">♂</span><span><strong>Ανδρικά</strong><small>Ρούχα, παπούτσια & άλλα</small></span><em>{audienceCounts.men}</em><b>→</b></button>
            <button type="button" onClick={() => setGuideAudience("accessories")}><span className="guide-icon">◇</span><span><strong>Αξεσουάρ & τσάντες</strong><small>Κοσμήματα, γυαλιά, αποσκευές & αξεσουάρ</small></span><em>{audienceCounts.accessories}</em><b>→</b></button>
            <button className="all-products" type="button" onClick={() => selectCategory("all")}><span className="guide-icon">∞</span><span><strong>Όλα τα προϊόντα</strong><small>Θέλω να εξερευνήσω ολόκληρο τον κατάλογο</small></span><em>{remoteFacets?.total ?? total}</em><b>→</b></button>
          </div>}
        </main>
        <footer className="fashion-guide-footer">
          <button type="button" onClick={goGuideBack}>{guideAudience ? "← Πίσω" : "Κλείσιμο"}</button>
          {(guideAudience || guideFamily) ? <button type="button" onClick={() => { setGuideAudience(null); setGuideFamily(null); }}>Από την αρχή</button> : null}
          <span>Μπορείς να αλλάξεις αυτή την επιλογή οποιαδήποτε στιγμή.</span>
        </footer>
      </div>
    </div> : null}

    <style jsx>{`
      .vc-browser{position:relative}.vc-layout{display:grid;grid-template-columns:minmax(250px,300px) minmax(0,1fr);gap:28px}.vc-sidebar{min-width:0}.vc-results{min-width:0;scroll-margin-top:88px}.vc-filter-panel{display:flex;flex-direction:column;gap:22px}.vc-filter-head{display:flex;justify-content:space-between;gap:12px}.vc-filter-head div{display:flex;flex-direction:column;gap:5px}.vc-filter-head strong{font-size:18px}.vc-filter-head span{font-size:12px;color:#6e7772;line-height:1.4}.vc-filter-head button,.vc-active-guide button{border:0;background:transparent;color:#14372c;font:inherit;font-weight:800;cursor:pointer}.vc-guide-trigger{width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left;border:1px solid rgba(20,55,44,.18);border-radius:18px;padding:16px;background:#14372c;color:#fff;cursor:pointer}.vc-guide-trigger span{display:flex;flex-direction:column;gap:4px}.vc-guide-trigger small{font-size:10px;letter-spacing:.12em;opacity:.72}.vc-guide-trigger strong{font-size:15px}.vc-guide-trigger b{font-size:20px}.vc-filter-section{display:flex;flex-direction:column;gap:9px}.vc-label{font-size:11px;font-weight:800;letter-spacing:.09em;color:#6e7772;text-transform:uppercase}.vc-category-list{display:flex;flex-direction:column;gap:6px;max-height:520px;overflow:auto}.vc-category-list button{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;text-align:left;border:1px solid transparent;border-radius:12px;padding:11px 12px;background:transparent;color:#40514b;font:inherit;cursor:pointer}.vc-category-list button:hover{background:#f4f0e8}.vc-category-list button.active{background:#14372c;color:#fff}.vc-category-list em{font-style:normal;font-size:12px;opacity:.72}.vc-fields{display:grid;gap:10px}.vc-fields label,.vc-search{display:flex;flex-direction:column;gap:6px}.vc-fields label span,.vc-search span{font-size:11px;font-weight:800;letter-spacing:.05em;color:#6e7772}.vc-fields select,.vc-search input{width:100%;min-height:46px;border:1px solid #d8d5cd;border-radius:12px;background:#fff;color:#17342c;padding:0 12px;font:inherit}.vc-search{margin-bottom:14px}.vc-meta{display:flex;flex-wrap:wrap;gap:10px 18px;margin-bottom:18px;color:#6e7772;font-size:13px}.vc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.vc-more{display:block;margin:26px auto 0;min-height:46px;padding:0 24px;border:1px solid #14372c;border-radius:999px;background:#fff;color:#14372c;font:inherit;font-weight:800;cursor:pointer}.vc-loading,.vc-empty{min-height:360px;display:grid;place-items:center;align-content:center;gap:10px;text-align:center;border:1px solid #e0ddd5;border-radius:22px;background:#f8f6f0;padding:30px}.vc-spinner{width:32px;height:32px;border:3px solid rgba(20,55,44,.15);border-top-color:#14372c;border-radius:50%;animation:spin .8s linear infinite}.vc-active-guide{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px;padding:12px 14px;border-radius:14px;background:#f4f0e8}.vc-active-guide div{display:flex;flex-direction:column;gap:2px}.vc-active-guide small{font-size:10px;letter-spacing:.1em;color:#6e7772}.vc-active-guide strong{font-size:14px}.vc-mobile-dock,.vc-sheet-layer{display:none}.fashion-guide{position:fixed;inset:0;z-index:10000;background:#f4f0e8;color:#183027;overflow:auto}.fashion-guide-shell{min-height:100dvh;display:grid;grid-template-rows:auto 1fr auto}.fashion-guide-header{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;min-height:82px;padding:16px clamp(20px,5vw,70px);background:rgba(244,240,232,.96);border-bottom:1px solid rgba(20,55,44,.12);backdrop-filter:blur(12px)}.fashion-guide-brand{display:flex;flex-direction:column;gap:2px}.fashion-guide-brand span{font-size:19px;font-weight:950;letter-spacing:-.03em}.fashion-guide-brand small{font-size:9px;letter-spacing:.16em;color:#6d756f}.fashion-guide-close{width:48px;height:48px;border:1px solid rgba(20,55,44,.2);border-radius:50%;background:#fffaf1;color:#14372c;font-size:28px;line-height:1;cursor:pointer}.fashion-guide-main{width:min(980px,100%);margin:0 auto;padding:clamp(24px,6vh,64px) 20px 36px}.fashion-guide-breadcrumb{min-height:22px;margin-bottom:18px;font-size:12px;font-weight:800;letter-spacing:.06em;color:#727a75}.fashion-guide-heading{max-width:760px;margin-bottom:28px}.fashion-guide-heading p{margin:0 0 8px;font-size:10px;font-weight:900;letter-spacing:.16em;color:#8a7650}.fashion-guide-heading h2{margin:0 0 10px;font-size:clamp(34px,7vw,64px);line-height:.98;letter-spacing:-.045em;font-weight:500}.fashion-guide-heading span{display:block;max-width:680px;font-size:15px;line-height:1.55;color:#627069}.fashion-guide-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.fashion-guide-options button{min-height:112px;display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:14px;align-items:center;text-align:left;border:1px solid rgba(20,55,44,.15);border-radius:20px;background:#fffaf1;color:#183027;padding:20px;cursor:pointer;transition:transform .15s ease,border-color .15s ease,background .15s ease}.fashion-guide-options button:hover{transform:translateY(-2px);border-color:#14372c}.fashion-guide-options button>span:not(.guide-icon){display:flex;flex-direction:column;gap:5px;min-width:0}.fashion-guide-options strong{font-size:19px}.fashion-guide-options small{font-size:12px;color:#6d756f;line-height:1.35}.fashion-guide-options em{font-style:normal;font-size:13px;color:#6d756f}.fashion-guide-options b{font-size:20px}.audience-options button{min-height:132px}.audience-options button{grid-template-columns:auto minmax(0,1fr) auto auto}.guide-icon{width:48px;height:48px;display:grid;place-items:center;border-radius:50%;background:#e9e5d9;font-size:23px}.audience-options .all-products{background:#14372c;color:#fff}.audience-options .all-products small,.audience-options .all-products em{color:rgba(255,255,255,.72)}.leaf-options button{min-height:94px}.fashion-guide-wait{min-height:260px;display:grid;place-items:center;align-content:center;gap:12px}.fashion-guide-footer{position:sticky;bottom:0;display:flex;align-items:center;gap:10px;min-height:76px;padding:14px clamp(20px,5vw,70px);border-top:1px solid rgba(20,55,44,.12);background:rgba(244,240,232,.97);backdrop-filter:blur(12px)}.fashion-guide-footer button{min-height:42px;padding:0 15px;border:1px solid rgba(20,55,44,.18);border-radius:999px;background:#fffaf1;color:#14372c;font:inherit;font-weight:800;cursor:pointer}.fashion-guide-footer span{margin-left:auto;font-size:11px;color:#737b76}@keyframes spin{to{transform:rotate(360deg)}}
      @media(max-width:980px){.vc-layout{grid-template-columns:1fr}.vc-sidebar{display:none}.vc-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.vc-mobile-dock{position:sticky;bottom:10px;z-index:30;display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;margin-top:20px;padding:8px;border:1px solid rgba(20,55,44,.15);border-radius:16px;background:rgba(255,253,248,.95);box-shadow:0 12px 34px rgba(20,55,44,.14);backdrop-filter:blur(10px)}.vc-mobile-dock input{min-width:0;min-height:44px;border:0;background:transparent;padding:0 8px;font:inherit}.vc-mobile-dock button{min-height:44px;border:0;border-radius:11px;background:#14372c;color:white;padding:0 13px;font:inherit;font-weight:800}.vc-mobile-dock button.guide{background:#e9e5d9;color:#14372c}.vc-sheet-layer{display:block;position:fixed;inset:0;z-index:9000}.vc-backdrop{position:absolute;inset:0;border:0;background:rgba(9,21,17,.48)}.vc-sheet{position:absolute;inset:5vh 0 0;display:grid;grid-template-rows:auto 1fr auto;border-radius:28px 28px 0 0;background:#f4f0e8;overflow:hidden}.vc-sheet header{display:flex;justify-content:space-between;align-items:center;padding:18px 24px;border-bottom:1px solid #d8d5cd}.vc-sheet header div{display:flex;flex-direction:column}.vc-sheet header span{font-size:11px;letter-spacing:.08em}.vc-sheet header strong{font-size:24px;font-weight:500}.vc-sheet header button{width:46px;height:46px;border:1px solid #d5d1c8;border-radius:50%;background:#fffaf1;font-size:25px}.vc-sheet-body{overflow:auto;padding:18px 28px 110px}.vc-sheet footer{position:absolute;left:0;right:0;bottom:0;padding:14px 28px max(18px,env(safe-area-inset-bottom));border-top:1px solid #d8d5cd;background:#fffdf8}.vc-sheet footer :global(.button){width:100%;min-height:58px;border-radius:16px}.vc-mobile-hint{padding:12px;border-radius:12px;background:#ebe7dd;font-size:12px}.vc-category-list{max-height:none}}
      @media(max-width:640px){.vc-grid{gap:10px}.fashion-guide-header{min-height:72px;padding:12px 16px}.fashion-guide-close{width:44px;height:44px}.fashion-guide-main{padding:24px 16px 26px}.fashion-guide-heading h2{font-size:42px}.fashion-guide-heading span{font-size:14px}.fashion-guide-options{grid-template-columns:1fr}.fashion-guide-options button,.audience-options button{min-height:96px;padding:16px;border-radius:17px}.audience-options button{grid-template-columns:auto minmax(0,1fr) auto auto}.guide-icon{width:42px;height:42px;font-size:20px}.fashion-guide-options strong{font-size:17px}.fashion-guide-footer{min-height:72px;padding:12px 16px max(12px,env(safe-area-inset-bottom));flex-wrap:wrap}.fashion-guide-footer span{display:none}.vc-active-guide{align-items:flex-start}.vc-active-guide button{font-size:12px}.vc-mobile-dock{grid-template-columns:minmax(0,1fr) auto}.vc-mobile-dock button.guide{grid-column:1/-1}.vc-search{display:none}}
    `}</style>
  </div>;
}
