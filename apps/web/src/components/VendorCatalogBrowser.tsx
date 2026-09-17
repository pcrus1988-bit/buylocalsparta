"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogCard } from "../lib/catalog-view";
import { CatalogProductCard } from "./CatalogProductCard";

type AvailabilityFilter = "all" | "available";
type CatalogSort = "recommended" | "price_asc" | "price_desc" | "name_asc";
type RemoteFacetOption = Readonly<{ value: string; label: string; count: number }>;
type RemoteFacets = Readonly<{
  total: number;
  categories: readonly RemoteFacetOption[];
  brands: readonly RemoteFacetOption[];
  colors: readonly RemoteFacetOption[];
  sizes: readonly RemoteFacetOption[];
  fits: readonly RemoteFacetOption[];
  materials: readonly RemoteFacetOption[];
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
  categoryGroup: readonly string[];
  brand: string;
  color: string;
  size: string;
  fit: string;
  material: string;
  sort: CatalogSort;
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
const RELATED_CATEGORY_LIMIT = 8;
const CHIP_LIMIT = 12;

const MATERIAL_TERMS = [
  { value: "cotton", label: "Βαμβάκι", needles: ["cotton", "βαμβ"] },
  { value: "wool", label: "Μαλλί", needles: ["wool", "μαλλ"] },
  { value: "cashmere", label: "Κασμίρ", needles: ["cashmere", "κασμιρ"] },
  { value: "silk", label: "Μετάξι", needles: ["silk", "μεταξ"] },
  { value: "linen", label: "Λινό", needles: ["linen", "λινο"] },
  { value: "polyester", label: "Πολυεστέρας", needles: ["polyester", "πολυεστερ"] },
  { value: "viscose", label: "Βισκόζη", needles: ["viscose", "βισκοζ"] },
  { value: "acrylic", label: "Ακρυλικό", needles: ["acrylic", "ακρυλ"] },
  { value: "polyamide", label: "Πολυαμίδιο", needles: ["polyamide", "πολυαμιδ"] },
  { value: "nylon", label: "Nylon", needles: ["nylon"] },
  { value: "elastane", label: "Ελαστάνη", needles: ["elastane", "spandex", "ελασταν"] },
  { value: "leather", label: "Δέρμα", needles: ["leather", "δερμα"] },
  { value: "suede", label: "Καστόρι", needles: ["suede", "καστορ"] },
  { value: "denim", label: "Denim", needles: ["denim"] }
] as const;

const COLOR_SWATCHES: Readonly<Record<string, string>> = {
  black: "#111111",
  white: "#ffffff",
  "off white": "#f4f0e6",
  ivory: "#f4eddf",
  beige: "#d8c5a5",
  cream: "#eadfca",
  blue: "#2f5da8",
  "light blue": "#83b7df",
  "dark blue": "#203b67",
  navy: "#1d2d4d",
  red: "#b83935",
  green: "#4f7757",
  khaki: "#777554",
  brown: "#6f4a33",
  camel: "#b98b5d",
  grey: "#8a8a87",
  gray: "#8a8a87",
  silver: "#b8b8b8",
  gold: "#c9a34d",
  pink: "#d996a9",
  purple: "#76548d",
  violet: "#72568f",
  yellow: "#d9b83e",
  orange: "#d77a35",
  burgundy: "#6f2738",
  bordeaux: "#6f2738"
};

function normalized(value: string | undefined): string {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("el");
}

function fallbackFacetOptions(values: readonly (string | undefined)[]): readonly RemoteFacetOption[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const cleaned = value?.trim();
    if (!cleaned) continue;
    counts.set(cleaned, (counts.get(cleaned) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "el"));
}

function fallbackMaterialOptions(products: readonly CatalogCard[]): readonly RemoteFacetOption[] {
  const counts = new Map<string, number>();
  for (const product of products) {
    const composition = normalized(product.composition);
    if (!composition) continue;
    for (const term of MATERIAL_TERMS) {
      if (term.needles.some((needle) => composition.includes(normalized(needle)))) {
        counts.set(term.value, (counts.get(term.value) ?? 0) + 1);
      }
    }
  }
  return MATERIAL_TERMS.flatMap((term) => {
    const count = counts.get(term.value) ?? 0;
    return count ? [{ value: term.value, label: term.label, count }] : [];
  }).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "el"));
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
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "el"));
}

function pageParams(filters: FilterState, offset: number): URLSearchParams {
  const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) });
  if (filters.query.trim()) params.set("q", filters.query.trim());
  const categoryValues = filters.categoryGroup.length
    ? filters.categoryGroup
    : filters.category !== "all"
      ? [filters.category]
      : [];
  for (const value of categoryValues) params.append("category", value);
  if (filters.brand !== "all") params.set("brand", filters.brand);
  if (filters.color !== "all") params.set("color", filters.color);
  if (filters.size !== "all") params.set("size", filters.size);
  if (filters.fit !== "all") params.set("fit", filters.fit);
  if (filters.material !== "all") params.set("material", filters.material);
  if (filters.sort !== "recommended") params.set("sort", filters.sort);
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
  if (["sneaker", "trainer", "running", "shoe", "παπουτ", "μποτ", "boot", "loafer", "moccas", "sandal", "σανδαλ"].some((word) => label.includes(word))) return "shoes";
  if (["t-shirt", "t shirt", "αθλητικ", "κοστουμ", "μπουφαν", "παλτο", "παντελον", "jeans", "πλεκ", "πουκαμισ", "φουστ", "φορεμ", "top", "τοπ"].some((word) => label.includes(word))) return "clothing";
  if (["εσωρουχ", "μαγιο"].some((word) => label.includes(word))) return "underwear";
  if (["τσαντ", "σακιδ", "πορτοφολ", "αποσκευ", "θηκ"].some((word) => label.includes(word))) return "bags";
  if (["δαχτυλ", "κολιε", "σκουλαρ", "βραχιολ", "κοσμη"].some((word) => label.includes(word))) return "jewellery";
  if (["γυαλ", "σκελετ ορασ"].some((word) => label.includes(word))) return "eyewear";
  if (["ζων", "belt", "κασκολ", "καπελ", "γαντ"].some((word) => label.includes(word))) return "accessories";
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
    return children.length ? [{
      key,
      label: FAMILY_META[key].label,
      helper: FAMILY_META[key].helper,
      entries: children,
      count: children.reduce((sum, entry) => sum + entry.count, 0)
    }] : [];
  });
}

function audienceLabel(audience: GuideAudience): string {
  if (audience === "women") return "Γυναικεία";
  if (audience === "men") return "Ανδρικά";
  return "Αξεσουάρ & τσάντες";
}

function relatedCategoryOptions(
  categories: readonly RemoteFacetOption[],
  category: string,
  categoryGroup: readonly string[]
): readonly RemoteFacetOption[] {
  const selected = categoryGroup.length
    ? categories.filter((entry) => categoryGroup.includes(entry.value))
    : category !== "all"
      ? categories.filter((entry) => entry.value === category)
      : [];

  if (!selected.length) return categories.slice(0, RELATED_CATEGORY_LIMIT);

  const audiences = new Set(selected.map(audienceFor));
  const families = new Set(selected.map(familyFor));
  const selectedValues = new Set(selected.map((entry) => entry.value));
  const candidates = categories.filter((entry) => {
    if (audiences.size === 1 && !audiences.has(audienceFor(entry))) return false;
    if (families.size === 1 && !families.has(familyFor(entry))) return false;
    return true;
  });

  return [...candidates]
    .sort((left, right) => {
      const leftSelected = selectedValues.has(left.value) ? 1 : 0;
      const rightSelected = selectedValues.has(right.value) ? 1 : 0;
      return rightSelected - leftSelected || right.count - left.count || left.label.localeCompare(right.label, "el");
    })
    .slice(0, RELATED_CATEGORY_LIMIT);
}

function optionLabel(options: readonly RemoteFacetOption[], value: string): string {
  return options.find((entry) => entry.value === value)?.label ?? value;
}

function colorSwatch(value: string): string | undefined {
  return COLOR_SWATCHES[value.trim().toLocaleLowerCase("en")];
}

function SortSelect({ value, onChange, compact = false }: { value: CatalogSort; onChange: (value: CatalogSort) => void; compact?: boolean }) {
  return <label className={compact ? "vc-sort compact" : "vc-sort"}>
    <span>Ταξινόμηση</span>
    <select value={value} onChange={(event) => onChange(event.target.value as CatalogSort)}>
      <option value="recommended">Προτεινόμενα</option>
      <option value="price_asc">Τιμή: χαμηλή → υψηλή</option>
      <option value="price_desc">Τιμή: υψηλή → χαμηλή</option>
      <option value="name_asc">Όνομα: Α → Ω</option>
    </select>
  </label>;
}

export function VendorCatalogBrowser({ products, vendor, demoVendorId, vendorId }: {
  products: readonly CatalogCard[];
  vendor: Readonly<{ name: string; adviser?: string }>;
  demoVendorId?: string;
  vendorId?: string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [categoryGroup, setCategoryGroup] = useState<readonly string[]>([]);
  const [categoryGroupLabel, setCategoryGroupLabel] = useState("");
  const [brand, setBrand] = useState("all");
  const [color, setColor] = useState("all");
  const [size, setSize] = useState("all");
  const [fit, setFit] = useState("all");
  const [material, setMaterial] = useState("all");
  const [sort, setSort] = useState<CatalogSort>("recommended");
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
  const facetRequestSerial = useRef(0);
  const catalogResultsRef = useRef<HTMLDivElement | null>(null);

  const demoMode = Boolean(demoVendorId);
  const isGuidedFashionVendor = (publicVendorId ?? vendorId) === SPECIAL_FASHION_VENDOR_ID;
  const filters = useMemo<FilterState>(() => ({ query, category, categoryGroup, brand, color, size, fit, material, sort, availability }), [availability, brand, category, categoryGroup, color, fit, material, query, size, sort]);

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
    if (!publicVendorId || demoMode) return;
    const serial = ++facetRequestSerial.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setFacetsLoading(true);
      try {
        const params = pageParams(filters, 0);
        params.delete("offset");
        params.delete("limit");
        params.delete("sort");
        params.set("facets", "1");
        params.set("facetsOnly", "1");
        const response = await fetch(`/api/catalog/vendor/${encodeURIComponent(publicVendorId)}?${params.toString()}`, { signal: controller.signal, cache: "default" });
        if (!response.ok) throw new Error(`Facet request failed with ${response.status}`);
        const payload = await response.json() as VendorCatalogApiResponse;
        if (serial === facetRequestSerial.current && payload.facets) {
          setRemoteFacets(payload.facets);
          setRemoteTotal(payload.facets.total);
        }
      } catch (error) {
        if (!controller.signal.aborted) console.error("Vendor catalogue facets failed", error);
      } finally {
        if (serial === facetRequestSerial.current) setFacetsLoading(false);
      }
    }, query.trim() ? 220 : 60);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [demoMode, filters, publicVendorId, query]);

  const categories = useMemo(() => remoteFacets?.categories ?? fallbackCategoryOptions(products), [products, remoteFacets]);
  const brands = useMemo(() => remoteFacets?.brands ?? fallbackFacetOptions(products.map((product) => product.brand)), [products, remoteFacets]);
  const colors = useMemo(() => remoteFacets?.colors ?? fallbackFacetOptions(products.map((product) => product.color)), [products, remoteFacets]);
  const sizes = useMemo(() => remoteFacets?.sizes ?? fallbackFacetOptions(products.flatMap((product) => product.sizes)), [products, remoteFacets]);
  const fits = useMemo(() => remoteFacets?.fits ?? fallbackFacetOptions(products.map((product) => product.fit)), [products, remoteFacets]);
  const materials = useMemo(() => remoteFacets?.materials ?? fallbackMaterialOptions(products), [products, remoteFacets]);
  const relatedCategories = useMemo(() => relatedCategoryOptions(categories, category, categoryGroup), [categories, category, categoryGroup]);

  useEffect(() => {
    if (!isGuidedFashionVendor || initialGuideHandled.current || (!categories.length && facetsLoading)) return;
    initialGuideHandled.current = true;
    const url = new URL(window.location.href);
    const grouped = (url.searchParams.get("fashionCategories") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    const validGrouped = grouped.filter((value) => categories.some((entry) => entry.value === value));
    if (validGrouped.length) {
      setCategory("all");
      setCategoryGroup(validGrouped);
      setCategoryGroupLabel(url.searchParams.get("fashionLabel")?.trim() || "Ομαδοποιημένη επιλογή");
      return;
    }
    const requested = url.searchParams.get("fashionCategory");
    if (requested && categories.some((entry) => entry.value === requested)) {
      setCategory(requested);
      setCategoryGroup([]);
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
    setFit("all");
    setMaterial("all");
    setAvailability("all");
  };

  const persistFashionSelection = (exactCategory?: string, grouped?: readonly string[], label?: string) => {
    if (!isGuidedFashionVendor) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("fashionCategory");
    url.searchParams.delete("fashionCategories");
    url.searchParams.delete("fashionLabel");
    if (exactCategory && exactCategory !== "all") url.searchParams.set("fashionCategory", exactCategory);
    if (grouped?.length) {
      url.searchParams.set("fashionCategories", grouped.join(","));
      if (label) url.searchParams.set("fashionLabel", label);
    }
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const selectCategory = (nextCategory: string) => {
    setCategory(nextCategory);
    setCategoryGroup([]);
    setCategoryGroupLabel("");
    resetSecondaryFilters();
    setFiltersOpen(false);
    setGuideOpen(false);
    persistFashionSelection(nextCategory);
    window.requestAnimationFrame(() => catalogResultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const selectCategoryGroup = (entries: readonly RemoteFacetOption[], label: string) => {
    const values = [...new Set(entries.map((entry) => entry.value).filter(Boolean))];
    if (!values.length) return;
    setCategory("all");
    setCategoryGroup(values);
    setCategoryGroupLabel(label);
    resetSecondaryFilters();
    setFiltersOpen(false);
    setGuideOpen(false);
    persistFashionSelection(undefined, values, label);
    window.requestAnimationFrame(() => catalogResultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const resetAllFilters = () => {
    setQuery("");
    setCategory("all");
    setCategoryGroup([]);
    setCategoryGroupLabel("");
    setBrand("all");
    setColor("all");
    setSize("all");
    setFit("all");
    setMaterial("all");
    setSort("recommended");
    setAvailability("all");
    persistFashionSelection("all");
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
  const total = remoteTotal ?? remoteFacets?.total ?? visibleProducts.length;
  const activeFilterCount = [category !== "all" || categoryGroup.length > 0, brand !== "all", color !== "all", size !== "all", fit !== "all", material !== "all"].filter(Boolean).length;
  const audienceEntries = guideAudience ? categories.filter((entry) => audienceFor(entry) === guideAudience) : [];
  const guideGroups = buildGroups(audienceEntries);
  const selectedGroup = guideFamily ? guideGroups.find((group) => group.key === guideFamily) : undefined;
  const audienceCounts = useMemo(() => ({
    women: categories.filter((entry) => audienceFor(entry) === "women").reduce((sum, entry) => sum + entry.count, 0),
    men: categories.filter((entry) => audienceFor(entry) === "men").reduce((sum, entry) => sum + entry.count, 0),
    accessories: categories.filter((entry) => audienceFor(entry) === "accessories").reduce((sum, entry) => sum + entry.count, 0)
  }), [categories]);
  const audienceAllCount = audienceEntries.reduce((sum, entry) => sum + entry.count, 0);

  const goGuideBack = () => {
    if (guideFamily) setGuideFamily(null);
    else if (guideAudience) setGuideAudience(null);
    else setGuideOpen(false);
  };

  const guideTitle = selectedGroup ? selectedGroup.label : guideAudience ? audienceLabel(guideAudience) : "Τι ψάχνετε σήμερα;";
  const guideSubtitle = selectedGroup
    ? "Διάλεξε μία ακριβή κατηγορία ή επίλεξε «Όλα» για ολόκληρο αυτό το επίπεδο."
    : guideAudience
      ? "Διάλεξε ομάδα ή επίλεξε «Όλα» για να δεις ολόκληρη αυτή την επιλογή."
      : "Πες μας πρώτα για ποιον ή τι ψάχνεις. Σε κάθε βήμα μπορείς να σταματήσεις την καθοδήγηση και να δεις όλα τα προϊόντα αυτού του επιπέδου.";

  const activeCategoryLabel = categoryGroup.length
    ? categoryGroupLabel || "Ομαδοποιημένη επιλογή"
    : category === "all"
      ? "Όλη η μόδα"
      : categories.find((entry) => entry.value === category)?.label ?? "Μόδα";

  const activeChips = [
    ...(category !== "all" || categoryGroup.length ? [{ key: "category", label: activeCategoryLabel, clear: () => { setCategory("all"); setCategoryGroup([]); setCategoryGroupLabel(""); persistFashionSelection("all"); } }] : []),
    ...(brand !== "all" ? [{ key: "brand", label: optionLabel(brands, brand), clear: () => setBrand("all") }] : []),
    ...(color !== "all" ? [{ key: "color", label: optionLabel(colors, color), clear: () => setColor("all") }] : []),
    ...(size !== "all" ? [{ key: "size", label: optionLabel(sizes, size), clear: () => setSize("all") }] : []),
    ...(fit !== "all" ? [{ key: "fit", label: optionLabel(fits, fit), clear: () => setFit("all") }] : []),
    ...(material !== "all" ? [{ key: "material", label: optionLabel(materials, material), clear: () => setMaterial("all") }] : [])
  ];

  const facetChips = (
    options: readonly RemoteFacetOption[],
    selectedValue: string,
    onChange: (value: string) => void,
    kind: "plain" | "color" = "plain"
  ) => <div className="vc-chip-grid">
    {options.slice(0, CHIP_LIMIT).map((entry) => {
      const swatch = kind === "color" ? colorSwatch(entry.value) : undefined;
      return <button className={selectedValue === entry.value ? "active" : ""} type="button" onClick={() => onChange(selectedValue === entry.value ? "all" : entry.value)} key={entry.value}>
        {kind === "color" ? <span className="vc-color-dot" style={swatch ? { background: swatch } : undefined}>{swatch ? "" : "◌"}</span> : null}
        <span>{entry.label}</span><em>{entry.count}</em>
      </button>;
    })}
  </div>;

  const filterPanel = (mobile = false) => (
    <div className="vc-filter-panel">
      <div className="vc-filter-head">
        <div><strong>Φίλτρα προϊόντων</strong><span>{facetsLoading ? "Προσαρμόζουμε τις επιλογές…" : "Επιλογές από προϊόντα που είναι διαθέσιμα τώρα."}</span></div>
        {activeFilterCount ? <button type="button" onClick={resetAllFilters}>Καθαρισμός</button> : null}
      </div>

      {isGuidedFashionVendor ? <button className="vc-guide-trigger" type="button" onClick={reopenGuide}><span><small>ΟΔΗΓΟΣ ΜΟΔΑΣ</small><strong>Βρες αυτό που ψάχνεις</strong></span><b>→</b></button> : null}

      {activeChips.length ? <div className="vc-active-filters" aria-label="Ενεργά φίλτρα">
        {activeChips.map((chip) => <button type="button" onClick={chip.clear} key={chip.key}><span>{chip.label}</span><b>×</b></button>)}
      </div> : null}

      {categoryGroup.length ? <div className="vc-group-note"><small>ΟΜΑΔΟΠΟΙΗΜΕΝΗ ΕΠΙΛΟΓΗ</small><strong>{activeCategoryLabel}</strong><span>{categoryGroup.length} κατηγορίες μαζί</span></div> : null}

      {relatedCategories.length ? <section className="vc-filter-card">
        <div className="vc-filter-card-head"><span>{category !== "all" || categoryGroup.length ? "Σχετικές κατηγορίες" : "Δημοφιλείς κατηγορίες"}</span><small>{relatedCategories.length}</small></div>
        <div className="vc-category-list">
          {category !== "all" || categoryGroup.length ? <button type="button" onClick={() => selectCategory("all")}><span>Όλη η μόδα</span><em>↺</em></button> : null}
          {relatedCategories.map((entry) => <button className={category === entry.value && !categoryGroup.length ? "active" : ""} type="button" onClick={() => selectCategory(entry.value)} key={entry.value}><span>{entry.label}</span><em>{entry.count}</em></button>)}
        </div>
      </section> : null}

      {(brands.length > 1 || colors.length > 1 || sizes.length > 1 || fits.length > 0 || materials.length > 0) ? <section className="vc-filter-card vc-rich-filters">
        <div className="vc-filter-card-head"><span>Περισσότερα φίλτρα</span><small>{activeFilterCount}</small></div>

        {brands.length > 1 ? <label className="vc-select-field"><span>Μάρκα</span><select value={brand} onChange={(event) => setBrand(event.target.value)}><option value="all">Όλες οι μάρκες</option>{brands.map((entry) => <option value={entry.value} key={entry.value}>{entry.label} ({entry.count})</option>)}</select></label> : null}

        {colors.length > 1 ? <div className="vc-facet-block"><div className="vc-facet-title"><span>Χρώμα</span>{color !== "all" ? <button type="button" onClick={() => setColor("all")}>Καθαρισμός</button> : null}</div>{facetChips(colors, color, setColor, "color")}{colors.length > CHIP_LIMIT ? <select className="vc-more-select" value={color} onChange={(event) => setColor(event.target.value)}><option value="all">Όλα τα χρώματα</option>{colors.map((entry) => <option value={entry.value} key={entry.value}>{entry.label} ({entry.count})</option>)}</select> : null}</div> : null}

        {sizes.length > 1 ? <div className="vc-facet-block"><div className="vc-facet-title"><span>Μέγεθος</span>{size !== "all" ? <button type="button" onClick={() => setSize("all")}>Καθαρισμός</button> : null}</div>{facetChips(sizes, size, setSize)}{sizes.length > CHIP_LIMIT ? <select className="vc-more-select" value={size} onChange={(event) => setSize(event.target.value)}><option value="all">Όλα τα μεγέθη</option>{sizes.map((entry) => <option value={entry.value} key={entry.value}>{entry.label} ({entry.count})</option>)}</select> : null}</div> : null}

        {fits.length ? <div className="vc-facet-block"><div className="vc-facet-title"><span>Γραμμή / Fit</span>{fit !== "all" ? <button type="button" onClick={() => setFit("all")}>Καθαρισμός</button> : null}</div>{facetChips(fits, fit, setFit)}{fits.length > CHIP_LIMIT ? <select className="vc-more-select" value={fit} onChange={(event) => setFit(event.target.value)}><option value="all">Όλες οι γραμμές</option>{fits.map((entry) => <option value={entry.value} key={entry.value}>{entry.label} ({entry.count})</option>)}</select> : null}</div> : null}

        {materials.length ? <div className="vc-facet-block"><div className="vc-facet-title"><span>Υλικό</span>{material !== "all" ? <button type="button" onClick={() => setMaterial("all")}>Καθαρισμός</button> : null}</div>{facetChips(materials, material, setMaterial)}{materials.length > CHIP_LIMIT ? <select className="vc-more-select" value={material} onChange={(event) => setMaterial(event.target.value)}><option value="all">Όλα τα υλικά</option>{materials.map((entry) => <option value={entry.value} key={entry.value}>{entry.label} ({entry.count})</option>)}</select> : null}</div> : null}
      </section> : null}

      {mobile ? <section className="vc-filter-card vc-mobile-sort"><SortSelect value={sort} onChange={setSort} compact /></section> : null}

      <div className="vc-availability-note"><span>ΔΙΑΘΕΣΙΜΟΤΗΤΑ</span><strong>✓ Μόνο διαθέσιμα τώρα</strong></div>
      {mobile ? <div className="vc-mobile-hint">{remoteLoading ? "Ετοιμάζουμε τη βιτρίνα…" : `${total} προϊόντα με τα επιλεγμένα φίλτρα`}</div> : null}
    </div>
  );

  return <div className="vc-browser">
    <div className="vc-layout">
      <aside className="vc-sidebar" aria-label="Κατηγορίες και φίλτρα προϊόντων">{filterPanel()}</aside>
      <div className="vc-results" ref={catalogResultsRef}>
        {isGuidedFashionVendor ? <div className="vc-active-guide"><div><small>Η επιλογή σου</small><strong>{activeCategoryLabel}</strong></div><button type="button" onClick={reopenGuide}>Αλλαγή αναζήτησης</button></div> : null}
        <div className="vc-toolbar">
          <label className="vc-search"><span>Αναζήτηση στο κατάστημα</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value.slice(0, 120))} placeholder="Προϊόν, μάρκα, κωδικός…" /></label>
          <SortSelect value={sort} onChange={setSort} />
        </div>
        {activeChips.length ? <div className="vc-result-chips">{activeChips.map((chip) => <button type="button" onClick={chip.clear} key={chip.key}>{chip.label}<span>×</span></button>)}</div> : null}
        <div className="vc-meta"><span><strong>{visibleProducts.length}</strong> επιλογές τώρα · {total} προϊόντα με το τρέχον πλαίσιο.</span>{remoteError ? <span>Υπήρξε προσωρινό πρόβλημα φόρτωσης. Μπορείς να αλλάξεις φίλτρα ή να δοκιμάσεις ξανά.</span> : null}</div>
        {remoteLoading && !visibleProducts.length ? <div className="vc-loading"><span className="vc-spinner" /><strong>Ετοιμάζουμε τη βιτρίνα…</strong><p>Φορτώνουμε μόνο ό,τι χρειάζεται για την επιλογή σου.</p></div> : visibleProducts.length ? <>
          <div className="vc-grid">{visibleProducts.map((product, index) => <CatalogProductCard product={product} index={index} vendorContext={vendor} demoVendorId={demoVendorId} key={product.id} />)}</div>
          {remoteNextOffset !== null && !demoMode ? <button className="vc-more" type="button" onClick={() => void loadMore()} disabled={remoteLoading}>{remoteLoading ? "Φόρτωση…" : "Περισσότερα προϊόντα"}</button> : null}
        </> : <div className="vc-empty"><h3>Δεν βρέθηκε προϊόν.</h3><p>Δοκίμασε διαφορετική επιλογή ή επέστρεψε στον οδηγό.</p><button className="button" type="button" onClick={isGuidedFashionVendor ? reopenGuide : resetAllFilters}>{isGuidedFashionVendor ? "Από την αρχή" : "Καθαρισμός φίλτρων"}</button></div>}
      </div>
    </div>

    <div className="vc-mobile-dock" role="search"><input type="search" value={query} onChange={(event) => setQuery(event.target.value.slice(0, 120))} placeholder="Αναζήτηση προϊόντος…" /><button type="button" onClick={() => setFiltersOpen(true)}>Φίλτρα{activeFilterCount ? ` · ${activeFilterCount}` : ""}</button>{isGuidedFashionVendor ? <button className="guide" type="button" onClick={reopenGuide}>Οδηγός</button> : null}</div>

    {filtersOpen ? <div className="vc-sheet-layer"><button className="vc-backdrop" type="button" onClick={() => setFiltersOpen(false)} aria-label="Κλείσιμο φίλτρων" /><aside className="vc-sheet" role="dialog" aria-modal="true" aria-label="Φίλτρα προϊόντων"><header><div><span>Κατάλογος</span><strong>Κατηγορίες & φίλτρα</strong></div><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Κλείσιμο">×</button></header><div className="vc-sheet-body">{filterPanel(true)}</div><footer>{activeFilterCount ? <button className="vc-footer-reset" type="button" onClick={resetAllFilters}>Καθαρισμός</button> : null}<button className="vc-footer-show" type="button" onClick={() => setFiltersOpen(false)}>Προβολή {total} προϊόντων</button></footer></aside></div> : null}

    {isGuidedFashionVendor && guideOpen ? <div className="fashion-guide" role="dialog" aria-modal="true" aria-labelledby="fashion-guide-title">
      <div className="fashion-guide-shell">
        <header className="fashion-guide-header"><div className="fashion-guide-brand"><span>ΚΟΝΤΑ ΜΟΥ</span><small>ΠΡΟΣΩΠΙΚΟΣ ΟΔΗΓΟΣ ΜΟΔΑΣ</small></div><button className="fashion-guide-close" type="button" onClick={() => setGuideOpen(false)} aria-label="Κλείσιμο">×</button></header>
        <main className="fashion-guide-main">
          <div className="fashion-guide-breadcrumb">Μόδα{guideAudience ? ` / ${audienceLabel(guideAudience)}` : ""}{selectedGroup ? ` / ${selectedGroup.label}` : ""}</div>
          <div className="fashion-guide-heading"><p>ΛΙΓΟ ΠΙΟ ΕΥΚΟΛΑ</p><h2 id="fashion-guide-title">{guideTitle}</h2><span>{guideSubtitle}</span></div>
          {!categories.length ? <div className="fashion-guide-wait"><span className="vc-spinner" /><strong>Οργανώνουμε τον κατάλογο…</strong></div> : selectedGroup && guideAudience ? <div className="fashion-guide-options leaf-options">
            <button className="all-current" type="button" onClick={() => selectCategoryGroup(selectedGroup.entries, `${audienceLabel(guideAudience)} · ${selectedGroup.label}`)}><span><strong>Όλα τα {selectedGroup.label.toLocaleLowerCase("el")}</strong><small>Όλα σε {audienceLabel(guideAudience).toLocaleLowerCase("el")} · {selectedGroup.label.toLocaleLowerCase("el")}</small></span><em>{selectedGroup.count}</em><b>→</b></button>
            {selectedGroup.entries.map((entry) => <button type="button" onClick={() => selectCategory(entry.value)} key={entry.value}><span><strong>{entry.label}</strong><small>Δες μόνο αυτή την κατηγορία</small></span><em>{entry.count}</em><b>→</b></button>)}
          </div> : guideAudience ? <div className="fashion-guide-options">
            <button className="all-current" type="button" onClick={() => selectCategoryGroup(audienceEntries, `Όλα τα ${audienceLabel(guideAudience).toLocaleLowerCase("el")}`)}><span><strong>Όλα τα {audienceLabel(guideAudience).toLocaleLowerCase("el")}</strong><small>Μην περιορίσεις άλλο αυτή την επιλογή</small></span><em>{audienceAllCount}</em><b>→</b></button>
            {guideGroups.map((group) => <button type="button" onClick={() => setGuideFamily(group.key)} key={group.key}><span><strong>{group.label}</strong><small>{group.helper}</small></span><em>{group.count}</em><b>→</b></button>)}
          </div> : <div className="fashion-guide-options audience-options">
            <button type="button" onClick={() => setGuideAudience("women")}><span className="guide-icon">♀</span><span><strong>Γυναικεία</strong><small>Ρούχα, παπούτσια, τσάντες & άλλα</small></span><em>{audienceCounts.women}</em><b>→</b></button>
            <button type="button" onClick={() => setGuideAudience("men")}><span className="guide-icon">♂</span><span><strong>Ανδρικά</strong><small>Ρούχα, παπούτσια & άλλα</small></span><em>{audienceCounts.men}</em><b>→</b></button>
            <button type="button" onClick={() => setGuideAudience("accessories")}><span className="guide-icon">◇</span><span><strong>Αξεσουάρ & τσάντες</strong><small>Κοσμήματα, γυαλιά, αποσκευές & αξεσουάρ</small></span><em>{audienceCounts.accessories}</em><b>→</b></button>
            <button className="all-products" type="button" onClick={() => selectCategory("all")}><span className="guide-icon">∞</span><span><strong>Όλα τα προϊόντα</strong><small>Θέλω να εξερευνήσω ολόκληρο τον κατάλογο</small></span><em>{remoteFacets?.total ?? total}</em><b>→</b></button>
          </div>}
        </main>
        <footer className="fashion-guide-footer"><button type="button" onClick={goGuideBack}>{guideAudience ? "← Πίσω" : "Κλείσιμο"}</button>{(guideAudience || guideFamily) ? <button type="button" onClick={() => { setGuideAudience(null); setGuideFamily(null); }}>Από την αρχή</button> : null}<span>Σε κάθε επίπεδο υπάρχει επιλογή «Όλα».</span></footer>
      </div>
    </div> : null}

    <style jsx>{`
      .vc-browser{position:relative;color:#183027}.vc-layout{display:grid;grid-template-columns:minmax(260px,310px) minmax(0,1fr);gap:30px}.vc-sidebar{min-width:0}.vc-results{min-width:0;scroll-margin-top:88px}.vc-filter-panel{display:flex;flex-direction:column;gap:14px;font-size:14px;line-height:1.35}.vc-filter-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:2px 2px 6px}.vc-filter-head div{display:flex;flex-direction:column;gap:4px}.vc-filter-head strong{font-size:19px;line-height:1.1;letter-spacing:-.02em}.vc-filter-head span{max-width:230px;font-size:12px;color:#6e7772;line-height:1.45}.vc-filter-head button,.vc-active-guide button,.vc-facet-title button{border:0;background:transparent;color:#14372c;font:inherit;font-size:11px;font-weight:850;cursor:pointer;padding:3px 0}.vc-guide-trigger{width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left;border:0;border-radius:18px;padding:16px 17px;background:#14372c;color:#fff;box-shadow:0 9px 24px rgba(20,55,44,.14);cursor:pointer}.vc-guide-trigger span{display:flex;flex-direction:column;gap:4px}.vc-guide-trigger small{font-size:9px;letter-spacing:.14em;opacity:.7}.vc-guide-trigger strong{font-size:15px;line-height:1.25}.vc-guide-trigger b{font-size:20px}.vc-active-filters,.vc-result-chips{display:flex;flex-wrap:wrap;gap:7px}.vc-active-filters button,.vc-result-chips button{display:flex;align-items:center;gap:7px;max-width:100%;border:1px solid rgba(20,55,44,.16);border-radius:999px;background:#e9eee9;color:#14372c;padding:7px 10px;font:inherit;font-size:11px;font-weight:750;line-height:1.15;cursor:pointer}.vc-active-filters button span,.vc-result-chips button{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.vc-active-filters button b,.vc-result-chips button span{font-size:14px;line-height:1}.vc-group-note{display:flex;flex-direction:column;gap:3px;padding:13px 15px;border-radius:15px;background:#eee8dc}.vc-group-note small{font-size:9px;font-weight:900;letter-spacing:.12em;color:#7b735f}.vc-group-note strong{font-size:14px}.vc-group-note span{font-size:11px;color:#6e7772}.vc-filter-card{display:flex;flex-direction:column;gap:13px;border:1px solid #e1ddd3;border-radius:18px;background:#fffaf3;padding:14px;box-shadow:0 7px 22px rgba(20,55,44,.035)}.vc-filter-card-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.vc-filter-card-head>span{font-size:11px;font-weight:900;letter-spacing:.09em;color:#56635e;text-transform:uppercase}.vc-filter-card-head>small{min-width:24px;height:24px;display:grid;place-items:center;border-radius:999px;background:#eee9df;color:#6b746f;font-size:10px;font-weight:850}.vc-category-list{display:flex;flex-direction:column;gap:5px;max-height:390px;overflow:auto}.vc-category-list button{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;text-align:left;border:0;border-radius:11px;padding:10px 11px;background:transparent;color:#344b43;font:inherit;font-size:13px;line-height:1.25;cursor:pointer;transition:background .15s ease,color .15s ease}.vc-category-list button:hover{background:#f1ede5}.vc-category-list button.active{background:#14372c;color:#fff}.vc-category-list em{min-width:28px;height:23px;display:grid;place-items:center;border-radius:999px;background:rgba(20,55,44,.06);font-style:normal;font-size:10px;opacity:.78}.vc-category-list button.active em{background:rgba(255,255,255,.14)}.vc-rich-filters{gap:16px}.vc-select-field,.vc-search,.vc-sort{display:flex;flex-direction:column;gap:6px}.vc-select-field>span,.vc-search>span,.vc-sort>span{font-size:10px;font-weight:900;letter-spacing:.07em;color:#69736f;text-transform:uppercase}.vc-select-field select,.vc-more-select,.vc-search input,.vc-sort select{width:100%;min-height:46px;box-sizing:border-box;border:1px solid #d9d5cb;border-radius:12px;background:#fff;color:#17342c;padding:0 12px;font:inherit;font-size:14px;line-height:1.2;outline:none}.vc-select-field select:focus,.vc-more-select:focus,.vc-search input:focus,.vc-sort select:focus{border-color:#14372c;box-shadow:0 0 0 3px rgba(20,55,44,.08)}.vc-facet-block{display:flex;flex-direction:column;gap:9px;padding-top:2px}.vc-facet-title{display:flex;align-items:center;justify-content:space-between;gap:10px}.vc-facet-title>span{font-size:12px;font-weight:850;color:#344b43}.vc-chip-grid{display:flex;flex-wrap:wrap;gap:6px}.vc-chip-grid button{display:inline-flex;align-items:center;gap:6px;min-height:34px;border:1px solid #ddd8ce;border-radius:999px;background:#fff;color:#40514b;padding:6px 9px;font:inherit;font-size:11px;font-weight:720;line-height:1.15;cursor:pointer}.vc-chip-grid button:hover{border-color:#8c9a95}.vc-chip-grid button.active{border-color:#14372c;background:#14372c;color:#fff}.vc-chip-grid em{font-style:normal;font-size:9px;opacity:.62}.vc-color-dot{width:13px;height:13px;display:grid;place-items:center;flex:0 0 auto;border:1px solid rgba(23,52,44,.2);border-radius:50%;font-size:9px;background:linear-gradient(135deg,#f4b0bb,#f0d46e,#7db5db,#72a97c)}.vc-more-select{min-height:40px;font-size:12px}.vc-availability-note{display:flex;flex-direction:column;gap:3px;padding:12px 14px;border:1px solid #dcd8cf;border-radius:14px;background:#f6f4ee}.vc-availability-note span{font-size:9px;font-weight:900;letter-spacing:.1em;color:#6e7772}.vc-availability-note strong{font-size:12px;color:#14372c}.vc-toolbar{display:grid;grid-template-columns:minmax(0,1fr) minmax(210px,260px);gap:12px;align-items:end;margin-bottom:12px}.vc-search{margin:0}.vc-sort.compact{width:100%}.vc-result-chips{margin:0 0 12px}.vc-meta{display:flex;flex-wrap:wrap;gap:10px 18px;margin-bottom:18px;color:#6e7772;font-size:13px;line-height:1.4}.vc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.vc-more{display:block;margin:26px auto 0;min-height:46px;padding:0 24px;border:1px solid #14372c;border-radius:999px;background:#fff;color:#14372c;font:inherit;font-weight:800;cursor:pointer}.vc-loading,.vc-empty{min-height:360px;display:grid;place-items:center;align-content:center;gap:10px;text-align:center;border:1px solid #e0ddd5;border-radius:22px;background:#f8f6f0;padding:30px}.vc-spinner{width:32px;height:32px;border:3px solid rgba(20,55,44,.15);border-top-color:#14372c;border-radius:50%;animation:spin .8s linear infinite}.vc-active-guide{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px;padding:12px 14px;border-radius:14px;background:#f4f0e8}.vc-active-guide div{display:flex;flex-direction:column;gap:2px}.vc-active-guide small{font-size:10px;letter-spacing:.1em;color:#6e7772}.vc-active-guide strong{font-size:14px}.vc-mobile-dock,.vc-sheet-layer{display:none}.fashion-guide{position:fixed;inset:0;z-index:10000;background:#f4f0e8;color:#183027;overflow:auto}.fashion-guide-shell{min-height:100dvh;display:grid;grid-template-rows:auto 1fr auto}.fashion-guide-header{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;min-height:82px;padding:16px clamp(20px,5vw,70px);background:rgba(244,240,232,.96);border-bottom:1px solid rgba(20,55,44,.12);backdrop-filter:blur(12px)}.fashion-guide-brand{display:flex;flex-direction:column;gap:2px}.fashion-guide-brand span{font-size:19px;font-weight:950;letter-spacing:-.03em}.fashion-guide-brand small{font-size:9px;letter-spacing:.16em;color:#6d756f}.fashion-guide-close{width:48px;height:48px;border:1px solid rgba(20,55,44,.2);border-radius:50%;background:#fffaf1;color:#14372c;font-size:28px;line-height:1;cursor:pointer}.fashion-guide-main{width:min(980px,100%);margin:0 auto;padding:clamp(24px,6vh,64px) 20px 36px}.fashion-guide-breadcrumb{min-height:22px;margin-bottom:18px;font-size:12px;font-weight:800;letter-spacing:.06em;color:#727a75}.fashion-guide-heading{max-width:760px;margin-bottom:28px}.fashion-guide-heading p{margin:0 0 8px;font-size:10px;font-weight:900;letter-spacing:.16em;color:#8a7650}.fashion-guide-heading h2{margin:0 0 10px;font-size:clamp(34px,7vw,64px);line-height:.98;letter-spacing:-.045em;font-weight:500}.fashion-guide-heading span{display:block;max-width:680px;font-size:15px;line-height:1.55;color:#627069}.fashion-guide-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.fashion-guide-options button{min-height:112px;display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:14px;align-items:center;text-align:left;border:1px solid rgba(20,55,44,.15);border-radius:20px;background:#fffaf1;color:#183027;padding:20px;cursor:pointer;transition:transform .15s ease,border-color .15s ease,background .15s ease}.fashion-guide-options button:hover{transform:translateY(-2px);border-color:#14372c}.fashion-guide-options button>span:not(.guide-icon){display:flex;flex-direction:column;gap:5px;min-width:0}.fashion-guide-options strong{font-size:19px}.fashion-guide-options small{font-size:12px;color:#6d756f;line-height:1.35}.fashion-guide-options em{font-style:normal;font-size:13px;color:#6d756f}.fashion-guide-options b{font-size:20px}.audience-options button{min-height:132px;grid-template-columns:auto minmax(0,1fr) auto auto}.guide-icon{width:48px;height:48px;display:grid;place-items:center;border-radius:50%;background:#e9e5d9;font-size:23px}.audience-options .all-products,.fashion-guide-options .all-current{background:#14372c;color:#fff}.audience-options .all-products small,.audience-options .all-products em,.fashion-guide-options .all-current small,.fashion-guide-options .all-current em{color:rgba(255,255,255,.72)}.leaf-options button{min-height:94px}.fashion-guide-wait{min-height:260px;display:grid;place-items:center;align-content:center;gap:12px}.fashion-guide-footer{position:sticky;bottom:0;display:flex;align-items:center;gap:10px;min-height:76px;padding:14px clamp(20px,5vw,70px);border-top:1px solid rgba(20,55,44,.12);background:rgba(244,240,232,.97);backdrop-filter:blur(12px)}.fashion-guide-footer button{min-height:42px;padding:0 15px;border:1px solid rgba(20,55,44,.18);border-radius:999px;background:#fffaf1;color:#14372c;font:inherit;font-weight:800;cursor:pointer}.fashion-guide-footer span{margin-left:auto;font-size:11px;color:#737b76}@keyframes spin{to{transform:rotate(360deg)}}
      @media(max-width:980px){.vc-layout{grid-template-columns:1fr}.vc-sidebar{display:none}.vc-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.vc-toolbar{grid-template-columns:1fr}.vc-toolbar>.vc-sort{display:none}.vc-mobile-dock{position:sticky;bottom:10px;z-index:30;display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;margin-top:20px;padding:8px;border:1px solid rgba(20,55,44,.15);border-radius:16px;background:rgba(255,253,248,.95);box-shadow:0 12px 34px rgba(20,55,44,.14);backdrop-filter:blur(10px)}.vc-mobile-dock input{min-width:0;min-height:44px;border:0;background:transparent;padding:0 8px;font:inherit;font-size:16px}.vc-mobile-dock button{min-height:44px;border:0;border-radius:11px;background:#14372c;color:white;padding:0 13px;font:inherit;font-weight:800}.vc-mobile-dock button.guide{background:#e9e5d9;color:#14372c}.vc-sheet-layer{display:block;position:fixed;inset:0;z-index:9000}.vc-backdrop{position:absolute;inset:0;border:0;background:rgba(9,21,17,.5)}.vc-sheet{position:absolute;inset:4vh 0 0;display:grid;grid-template-rows:auto 1fr auto;border-radius:26px 26px 0 0;background:#f6f2ea;overflow:hidden}.vc-sheet header{display:flex;justify-content:space-between;align-items:center;padding:17px 20px;border-bottom:1px solid #d8d5cd;background:#f6f2ea}.vc-sheet header div{display:flex;flex-direction:column;gap:2px}.vc-sheet header span{font-size:10px;line-height:1.2;letter-spacing:.1em;color:#68736e;text-transform:uppercase}.vc-sheet header strong{font-size:23px;line-height:1.08;font-weight:520;letter-spacing:-.025em}.vc-sheet header button{width:46px;height:46px;border:1px solid #d5d1c8;border-radius:50%;background:#fffaf1;color:#14372c;font-size:26px;line-height:1;cursor:pointer}.vc-sheet-body{overflow:auto;padding:16px 18px 118px}.vc-sheet-body .vc-filter-panel{gap:13px;font-size:14px;line-height:1.35}.vc-sheet-body .vc-filter-head strong{font-size:17px}.vc-sheet-body .vc-filter-card{padding:13px;border-radius:16px}.vc-sheet-body .vc-category-list button{min-height:43px;font-size:13px;line-height:1.25;padding:9px 10px}.vc-sheet-body select{font-size:16px}.vc-sheet footer{position:absolute;left:0;right:0;bottom:0;display:grid;grid-template-columns:auto minmax(0,1fr);gap:9px;padding:12px 18px max(16px,env(safe-area-inset-bottom));border-top:1px solid #d8d5cd;background:rgba(255,253,248,.98);backdrop-filter:blur(10px)}.vc-sheet footer button{min-height:56px;border-radius:15px;font:inherit;font-size:14px;font-weight:850;cursor:pointer}.vc-footer-reset{border:1px solid #d5d1c8;background:#fffaf1;color:#14372c;padding:0 15px}.vc-footer-show{border:0;background:#14372c;color:#fff;padding:0 18px}.vc-mobile-hint{padding:11px 13px;border-radius:12px;background:#eae6dd;color:#596660;font-size:11px;font-weight:700}.vc-category-list{max-height:none}.vc-result-chips{margin-top:2px}}
      @media(max-width:640px){.vc-grid{gap:10px}.vc-toolbar{margin-bottom:8px}.vc-result-chips{display:none}.fashion-guide-header{min-height:72px;padding:12px 16px}.fashion-guide-close{width:44px;height:44px}.fashion-guide-main{padding:24px 16px 26px}.fashion-guide-heading h2{font-size:42px}.fashion-guide-heading span{font-size:14px}.fashion-guide-options{grid-template-columns:1fr}.fashion-guide-options button,.audience-options button{min-height:96px;padding:16px;border-radius:17px}.audience-options button{grid-template-columns:auto minmax(0,1fr) auto auto}.guide-icon{width:42px;height:42px;font-size:20px}.fashion-guide-options strong{font-size:17px}.fashion-guide-footer{min-height:72px;padding:12px 16px max(12px,env(safe-area-inset-bottom));flex-wrap:wrap}.fashion-guide-footer span{display:none}.vc-active-guide{align-items:flex-start}.vc-active-guide button{font-size:12px}.vc-mobile-dock{grid-template-columns:minmax(0,1fr) auto}.vc-mobile-dock button.guide{grid-column:1/-1}.vc-search{display:none}.vc-sheet{inset:2vh 0 0}.vc-sheet header{padding:15px 16px}.vc-sheet header strong{font-size:21px}.vc-sheet-body{padding:14px 14px 116px}.vc-chip-grid{gap:5px}.vc-chip-grid button{min-height:33px;padding:6px 8px}.vc-sheet footer{padding-left:14px;padding-right:14px}}
    `}</style>
  </div>;
}
