"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogCard } from "../lib/catalog-view";
import { CatalogProductCard } from "./CatalogProductCard";
import { StorefrontColorFinderLauncher } from "./StorefrontColorFinderLauncher";

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
type GuideDomain = "fashion" | "beauty" | "catalog";
type GuideAudience = "women" | "men" | "accessories";
type GuideFamily = "shoes" | "clothing" | "underwear" | "bags" | "jewellery" | "eyewear" | "accessories" | "other";
type BeautyFamily = "skincare" | "makeup" | "fragrance" | "haircare" | "body" | "grooming" | "tools" | "other";
type GuideGroup = Readonly<{
  key: GuideFamily;
  label: string;
  helper: string;
  entries: readonly RemoteFacetOption[];
  count: number;
}>;
type BeautyGuideGroup = Readonly<{
  key: BeautyFamily;
  label: string;
  helper: string;
  entries: readonly RemoteFacetOption[];
  count: number;
}>;

const PAGE_SIZE = 20;
const FIRST_PAGE_TIMEOUT_MS = 20000;
const BEAUTY_CATEGORY_CODES = new Set([
  "facial-cleansers",
  "face-moisturisers",
  "serums-treatments",
  "sun-care",
  "face-makeup",
  "eye-makeup",
  "lip-makeup",
  "nail-care-colour",
  "fragrance",
  "shampoo-conditioner",
  "hair-treatments",
  "hair-styling-products",
  "bath-body-care",
  "grooming-care",
  "beauty-tools-accessories"
]);
const FASHION_CATEGORY_CODES = new Set([
  "handbags",
  "backpacks",
  "wallets-cardholders",
  "luggage-travel-bags",
  "belts",
  "scarves-hats-gloves",
  "rings",
  "necklaces",
  "bracelets",
  "earrings",
  "watches",
  "sunglasses",
  "optical-frames",
  "optical-accessories",
  "ties-formal-accessories",
  "womens-underwear",
  "mens-underwear",
  "socks-hosiery",
  "sports-clothing"
]);
const VENDOR_ID_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;
const RELATED_CATEGORY_LIMIT = 8;
const CHIP_LIMIT = 12;
const BRAND_RESULT_LIMIT = 48;

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
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("el");
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

function isBeautyCategory(entry: RemoteFacetOption): boolean {
  const value = normalized(entry.value);
  const label = normalized(entry.label);
  if (BEAUTY_CATEGORY_CODES.has(value)) return true;
  if (["beauty", "skincare", "makeup", "fragrance", "haircare", "cosmetic", "perfume", "bath-body", "grooming"].some((word) => value.includes(word))) return true;
  return ["περιποι", "μακιγιαζ", "αρωμ", "σαμπουαν", "conditioner", "μαλλι", "νυχι", "serum", "αντηλια", "καλλυν", "ομορφ"].some((word) => label.includes(word));
}

function isFashionCategory(entry: RemoteFacetOption): boolean {
  if (isBeautyCategory(entry)) return false;
  const value = normalized(entry.value);
  const label = normalized(entry.label);
  if (FASHION_CATEGORY_CODES.has(value)) return true;
  if (["fashion-", "womens-", "mens-", "kids-"].some((prefix) => value.startsWith(prefix))) return true;
  return ["γυναικ", "ανδρ", "παιδικ", "ρουχ", "παπουτ", "sneaker", "μποτ", "σανδαλ", "τσαντ", "σακιδ", "πορτοφολ", "αποσκευ", "ζων", "κασκολ", "καπελ", "γαντ", "δαχτυλ", "κολιε", "σκουλαρ", "βραχιολ", "κοσμη", "ρολογ", "γυαλ", "εσωρουχ", "μαγιο"].some((word) => label.includes(word));
}

function isHomeProjectCategory(entry: RemoteFacetOption): boolean {
  const value = normalized(entry.value);
  const label = normalized(entry.label);
  const haystack = `${value} ${label}`;
  return [
    "paint", "coating", "primer", "undercoat", "varnish", "enamel", "waterproof", "insulation",
    "plaster", "mortar", "putty", "sealant", "construction", "building", "renovation",
    "χρωμ", "βαφ", "ασταρ", "βερνικ", "ριπολιν", "στεγαν", "μονω", "σοβα", "κονια",
    "στοκ", "επισκευ", "τσιμεν", "τοιχ", "οικοδομ", "θερμομον"
  ].some((word) => haystack.includes(word));
}

function guideDomainFor(entry: RemoteFacetOption): GuideDomain {
  if (isBeautyCategory(entry)) return "beauty";
  if (isFashionCategory(entry)) return "fashion";
  return "catalog";
}

function isGuideFilterStateEmpty(filters: FilterState): boolean {
  return !filters.query.trim()
    && filters.category === "all"
    && filters.categoryGroup.length === 0
    && filters.brand === "all"
    && filters.color === "all"
    && filters.size === "all"
    && filters.fit === "all"
    && filters.material === "all"
    && filters.availability === "all";
}

function beautyFamilyFor(entry: RemoteFacetOption): BeautyFamily {
  const value = normalized(entry.value);
  const label = normalized(entry.label);
  if (["facial-cleansers", "face-moisturisers", "serums-treatments", "sun-care"].includes(value) || ["καθαρισ", "ενυδατ", "serum", "αντηλια", "skincare"].some((word) => label.includes(word))) return "skincare";
  if (["face-makeup", "eye-makeup", "lip-makeup", "nail-care-colour"].includes(value) || ["μακιγιαζ", "χειλι", "ματι", "νυχι"].some((word) => label.includes(word))) return "makeup";
  if (value === "fragrance" || ["αρωμ", "perfume", "fragrance"].some((word) => label.includes(word))) return "fragrance";
  if (["shampoo-conditioner", "hair-treatments", "hair-styling-products"].includes(value) || ["σαμπουαν", "conditioner", "μαλλι", "hair"].some((word) => label.includes(word))) return "haircare";
  if (value === "bath-body-care" || ["σωμα", "μπανι", "body"].some((word) => label.includes(word))) return "body";
  if (value === "grooming-care" || ["groom", "ξυρισ", "γενει"].some((word) => label.includes(word))) return "grooming";
  if (value === "beauty-tools-accessories" || ["εργαλ", "αξεσουαρ ομορφ", "beauty tool"].some((word) => label.includes(word))) return "tools";
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

const BEAUTY_META: Readonly<Record<BeautyFamily, Readonly<{ label: string; helper: string }>>> = {
  skincare: { label: "Περιποίηση προσώπου", helper: "Καθαρισμός, ενυδάτωση, serum & αντηλιακή προστασία" },
  makeup: { label: "Μακιγιάζ", helper: "Πρόσωπο, μάτια, χείλη & νύχια" },
  fragrance: { label: "Αρώματα", helper: "Αρώματα και αρωματικές επιλογές" },
  haircare: { label: "Περιποίηση μαλλιών", helper: "Σαμπουάν, θεραπείες & styling" },
  body: { label: "Σώμα & μπάνιο", helper: "Περιποίηση σώματος και μπάνιου" },
  grooming: { label: "Περιποίηση & grooming", helper: "Καθημερινή προσωπική περιποίηση" },
  tools: { label: "Εργαλεία ομορφιάς", helper: "Εργαλεία και αξεσουάρ ομορφιάς" },
  other: { label: "Άλλα προϊόντα ομορφιάς", helper: "Περισσότερες επιλογές ομορφιάς" }
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

function buildBeautyGroups(entries: readonly RemoteFacetOption[]): readonly BeautyGuideGroup[] {
  const order: readonly BeautyFamily[] = ["skincare", "makeup", "fragrance", "haircare", "body", "grooming", "tools", "other"];
  return order.flatMap((key) => {
    const children = entries.filter((entry) => beautyFamilyFor(entry) === key);
    return children.length ? [{
      key,
      label: BEAUTY_META[key].label,
      helper: BEAUTY_META[key].helper,
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

export function VendorCatalogBrowser({ products, vendor, demoVendorId, vendorId, initialTotal }: {
  products: readonly CatalogCard[];
  vendor: Readonly<{ name: string; adviser?: string }>;
  demoVendorId?: string;
  vendorId?: string;
  initialTotal?: number;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [categoryGroup, setCategoryGroup] = useState<readonly string[]>([]);
  const [categoryGroupLabel, setCategoryGroupLabel] = useState("");
  const [brand, setBrand] = useState("all");
  const [brandSearch, setBrandSearch] = useState("");
  const [color, setColor] = useState("all");
  const [size, setSize] = useState("all");
  const [fit, setFit] = useState("all");
  const [material, setMaterial] = useState("all");
  const [sort, setSort] = useState<CatalogSort>("recommended");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideDomain, setGuideDomain] = useState<GuideDomain | null>(null);
  const [guideAudience, setGuideAudience] = useState<GuideAudience | null>(null);
  const [guideFamily, setGuideFamily] = useState<GuideFamily | null>(null);
  const [beautyFamily, setBeautyFamily] = useState<BeautyFamily | null>(null);
  const [remoteProducts, setRemoteProducts] = useState<readonly CatalogCard[] | null>(demoVendorId ? products : null);
  const [remoteTotal, setRemoteTotal] = useState<number | undefined>(initialTotal ?? (demoVendorId ? products.length : undefined));
  const [remoteOffset, setRemoteOffset] = useState(0);
  const [remoteNextOffset, setRemoteNextOffset] = useState<number | null>(null);
  const [remoteFacets, setRemoteFacets] = useState<RemoteFacets>();
  const [guideFacets, setGuideFacets] = useState<RemoteFacets>();
  const [remoteLoading, setRemoteLoading] = useState(!demoVendorId);
  const [facetsLoading, setFacetsLoading] = useState(false);
  const [facetsError, setFacetsError] = useState(false);
  const [remoteError, setRemoteError] = useState(false);
  const [publicVendorId, setPublicVendorId] = useState<string | undefined>(() => vendorId && VENDOR_ID_PATTERN.test(vendorId) ? vendorId : undefined);
  const initialGuideHandled = useRef(false);
  const requestSerial = useRef(0);
  const facetRequestSerial = useRef(0);
  const catalogResultsRef = useRef<HTMLDivElement | null>(null);

  const demoMode = Boolean(demoVendorId);
  const requestVendorId = demoVendorId ?? publicVendorId;
  const isGuidedVendor = Boolean(publicVendorId ?? vendorId ?? demoVendorId);
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
    const endpoint = demoMode ? "/api/demo/catalog/vendor" : "/api/catalog/vendor";
    const response = await fetch(`${endpoint}/${encodeURIComponent(id)}?${pageParams(input, offset).toString()}`, { signal, cache: demoMode ? "no-store" : "default" });
    if (!response.ok) throw new Error(`Catalogue request failed with ${response.status}`);
    return response.json() as Promise<VendorCatalogApiResponse>;
  }, [demoMode]);

  useEffect(() => {
    if (!requestVendorId) return;
    const serial = ++requestSerial.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setRemoteLoading(true);
      setRemoteError(false);
      setRemoteTotal(undefined);
      // Never leave products from the previous filter visible while a new
      // server-filtered page is loading. If the request fails, stale items from
      // another category would otherwise look like valid results.
      setRemoteProducts([]);
      setRemoteOffset(0);
      setRemoteNextOffset(null);
      try {
        const payload = await fetchPage(requestVendorId, filters, 0, controller.signal);
        if (serial !== requestSerial.current) return;
        setRemoteProducts(payload.products);
        if (typeof payload.total === "number") setRemoteTotal(payload.total);
        setRemoteOffset(payload.offset);
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
  }, [fetchPage, filters, query, requestVendorId]);

  useEffect(() => {
    // Page results are the latency-critical request. Do not compete for a
    // production DB connection with the heavier contextual-facet request.
    // Once the page settles, this effect reruns and refreshes the facets.
    if (!requestVendorId || remoteLoading) return;
    const serial = ++facetRequestSerial.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setFacetsLoading(true);
      setFacetsError(false);
      try {
        const params = pageParams(filters, 0);
        params.delete("offset");
        params.delete("limit");
        params.delete("sort");
        params.set("facets", "1");
        params.set("facetsOnly", "1");
        const facetEndpoint = demoMode ? "/api/demo/catalog/vendor" : "/api/catalog/vendor";
        const requestUrl = `${facetEndpoint}/${encodeURIComponent(requestVendorId)}?${params.toString()}`;
        let payload: VendorCatalogApiResponse | undefined;
        let lastStatus = 0;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const response = await fetch(requestUrl, { signal: controller.signal, cache: demoMode ? "no-store" : "default" });
          lastStatus = response.status;
          if (response.ok) {
            const candidate = await response.json() as VendorCatalogApiResponse;
            if (candidate.facets) {
              payload = candidate;
              break;
            }
          }
          if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 650));
        }
        if (!payload?.facets) throw new Error(`Facet request unavailable (${lastStatus || "no response"})`);
        if (serial === facetRequestSerial.current) {
          setRemoteFacets(payload.facets);
          if (!demoMode) setRemoteTotal(payload.facets.total);
          if (isGuideFilterStateEmpty(filters)) setGuideFacets(payload.facets);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setFacetsError(true);
          console.error("Vendor catalogue facets failed", error);
        }
      } finally {
        if (serial === facetRequestSerial.current) setFacetsLoading(false);
      }
    }, query.trim() ? 220 : 60);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [demoMode, filters, query, remoteLoading, requestVendorId]);

  const facetFallbackProducts = remoteProducts ?? products;
  const categories = useMemo(
    () => remoteFacets?.categories.length ? remoteFacets.categories : fallbackCategoryOptions(facetFallbackProducts),
    [facetFallbackProducts, remoteFacets]
  );
  const brands = useMemo(
    () => remoteFacets?.brands.length ? remoteFacets.brands : fallbackFacetOptions(facetFallbackProducts.map((product) => product.brand)),
    [facetFallbackProducts, remoteFacets]
  );
  const colors = useMemo(
    () => demoMode ? [] : remoteFacets?.colors.length ? remoteFacets.colors : fallbackFacetOptions(facetFallbackProducts.map((product) => product.color)),
    [demoMode, facetFallbackProducts, remoteFacets]
  );
  const sizes = useMemo(
    () => demoMode ? [] : remoteFacets?.sizes.length ? remoteFacets.sizes : fallbackFacetOptions(facetFallbackProducts.flatMap((product) => product.sizes)),
    [demoMode, facetFallbackProducts, remoteFacets]
  );
  const fits = useMemo(
    () => demoMode ? [] : remoteFacets?.fits.length ? remoteFacets.fits : fallbackFacetOptions(facetFallbackProducts.map((product) => product.fit)),
    [demoMode, facetFallbackProducts, remoteFacets]
  );
  const materials = useMemo(
    () => demoMode ? [] : remoteFacets?.materials.length ? remoteFacets.materials : fallbackMaterialOptions(facetFallbackProducts),
    [demoMode, facetFallbackProducts, remoteFacets]
  );
  const guideCategories = isGuidedVendor
    ? (guideFacets?.categories?.length ? guideFacets.categories : remoteFacets?.categories?.length ? remoteFacets.categories : categories)
    : [];
  const fashionCategories = guideCategories.filter(isFashionCategory);
  const beautyCategories = guideCategories.filter(isBeautyCategory);
  const catalogCategories = guideCategories.filter((entry) => !isFashionCategory(entry) && !isBeautyCategory(entry));
  const availableGuideDomains = ([
    ...(fashionCategories.length ? ["fashion" as const] : []),
    ...(beautyCategories.length ? ["beauty" as const] : []),
    ...(catalogCategories.length ? ["catalog" as const] : [])
  ] satisfies readonly GuideDomain[]);
  const relatedCategories = useMemo(() => relatedCategoryOptions(categories, category, categoryGroup), [categories, category, categoryGroup]);
  const visibleBrands = useMemo(() => {
    const needle = normalized(brandSearch);
    let matches = needle
      ? brands.filter((entry) => normalized(entry.label).includes(needle) || normalized(entry.value).includes(needle))
      : brands;
    matches = matches.slice(0, BRAND_RESULT_LIMIT);
    if (brand !== "all" && !matches.some((entry) => entry.value === brand)) {
      const selected = brands.find((entry) => entry.value === brand);
      if (selected) matches = [selected, ...matches].slice(0, BRAND_RESULT_LIMIT);
    }
    return matches;
  }, [brand, brandSearch, brands]);

  useEffect(() => {
    if (!isGuidedVendor || initialGuideHandled.current || facetsLoading || !guideCategories.length) return;
    if (!guideFacets && !remoteFacets && !facetsError) return;
    if (!availableGuideDomains.length) return;
    initialGuideHandled.current = true;
    const url = new URL(window.location.href);
    const grouped = (url.searchParams.get("guideCategories") ?? url.searchParams.get("fashionCategories") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    const validGrouped = grouped.filter((value) => guideCategories.some((entry) => entry.value === value));
    if (validGrouped.length) {
      const first = guideCategories.find((entry) => entry.value === validGrouped[0]);
      setGuideDomain(first ? guideDomainFor(first) : null);
      setCategory("all");
      setCategoryGroup(validGrouped);
      setCategoryGroupLabel(url.searchParams.get("guideLabel")?.trim() || url.searchParams.get("fashionLabel")?.trim() || "Ομαδοποιημένη επιλογή");
      return;
    }
    const requested = url.searchParams.get("guideCategory") ?? url.searchParams.get("fashionCategory");
    if (requested) {
      const requestedEntry = guideCategories.find((entry) => entry.value === requested);
      if (requestedEntry) {
        setGuideDomain(guideDomainFor(requestedEntry));
        setCategory(requested);
        setCategoryGroup([]);
        return;
      }
    }
    setGuideDomain(availableGuideDomains.length === 1 ? availableGuideDomains[0] : null);
    setGuideOpen(true);
  }, [availableGuideDomains, demoMode, facetsError, facetsLoading, guideCategories, guideFacets, isGuidedVendor, remoteFacets]);

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
    setBrandSearch("");
    setColor("all");
    setSize("all");
    setFit("all");
    setMaterial("all");
    setAvailability("all");
  };

  const persistGuideSelection = (exactCategory?: string, grouped?: readonly string[], label?: string) => {
    if (!isGuidedVendor) return;
    const url = new URL(window.location.href);
    for (const key of ["guideCategory", "guideCategories", "guideLabel", "fashionCategory", "fashionCategories", "fashionLabel"]) {
      url.searchParams.delete(key);
    }
    if (exactCategory && exactCategory !== "all") url.searchParams.set("guideCategory", exactCategory);
    if (grouped?.length) {
      url.searchParams.set("guideCategories", grouped.join(","));
      if (label) url.searchParams.set("guideLabel", label);
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
    persistGuideSelection(nextCategory);
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
    persistGuideSelection(undefined, values, label);
    window.requestAnimationFrame(() => catalogResultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const resetAllFilters = () => {
    setQuery("");
    setCategory("all");
    setCategoryGroup([]);
    setCategoryGroupLabel("");
    setBrand("all");
    setBrandSearch("");
    setColor("all");
    setSize("all");
    setFit("all");
    setMaterial("all");
    setSort("recommended");
    setAvailability("all");
    persistGuideSelection("all");
  };

  const reopenGuide = () => {
    resetAllFilters();
    setGuideDomain(availableGuideDomains.length === 1 ? availableGuideDomains[0] : null);
    setGuideAudience(null);
    setGuideFamily(null);
    setBeautyFamily(null);
    setFiltersOpen(false);
    setGuideOpen(true);
  };

  const loadPage = async (offset: number) => {
    if (!requestVendorId || remoteLoading) return;
    setRemoteLoading(true);
    setRemoteError(false);
    try {
      const payload = await fetchPage(requestVendorId, filters, Math.max(0, offset));
      setRemoteProducts(payload.products);
      if (typeof payload.total === "number") setRemoteTotal(payload.total);
      setRemoteOffset(payload.offset);
      setRemoteNextOffset(payload.nextOffset);
      window.requestAnimationFrame(() => catalogResultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) {
      console.error("Vendor catalogue page request failed", error);
      setRemoteError(true);
    } finally {
      setRemoteLoading(false);
    }
  };

  const visibleProducts = remoteProducts ?? products;
  const totalKnown = remoteTotal !== undefined;
  const total = remoteTotal ?? visibleProducts.length;
  const currentPage = Math.floor(remoteOffset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPagination = remoteOffset > 0 || remoteNextOffset !== null || (totalKnown && total > PAGE_SIZE);
  const activeFilterCount = [category !== "all" || categoryGroup.length > 0, brand !== "all", color !== "all", size !== "all", fit !== "all", material !== "all"].filter(Boolean).length;
  const audienceEntries = guideAudience ? fashionCategories.filter((entry) => audienceFor(entry) === guideAudience) : [];
  const guideGroups = buildGroups(audienceEntries);
  const selectedGroup = guideFamily ? guideGroups.find((group) => group.key === guideFamily) : undefined;
  const beautyGroups = buildBeautyGroups(beautyCategories);
  const selectedBeautyGroup = beautyFamily ? beautyGroups.find((group) => group.key === beautyFamily) : undefined;
  const catalogAllCount = catalogCategories.reduce((sum, entry) => sum + entry.count, 0);
  const catalogHomeCount = catalogCategories.filter(isHomeProjectCategory).reduce((sum, entry) => sum + entry.count, 0);
  const catalogLooksLikeHome = catalogHomeCount > 0 && catalogHomeCount >= catalogAllCount * 0.6;
  const catalogDomainLabel = catalogLooksLikeHome ? "Σπίτι & Εργασίες" : "Κατηγορίες καταστήματος";
  const catalogDomainHelper = catalogLooksLikeHome
    ? "Χρώματα, αστάρια, στεγάνωση, μόνωση και υλικά για το έργο σου"
    : "Οι υπόλοιπες κατηγορίες που είναι πραγματικά διαθέσιμες εδώ";
  const guideTotal = guideFacets?.total ?? remoteFacets?.total ?? total;
  const audienceCounts = {
    women: fashionCategories.filter((entry) => audienceFor(entry) === "women").reduce((sum, entry) => sum + entry.count, 0),
    men: fashionCategories.filter((entry) => audienceFor(entry) === "men").reduce((sum, entry) => sum + entry.count, 0),
    accessories: fashionCategories.filter((entry) => audienceFor(entry) === "accessories").reduce((sum, entry) => sum + entry.count, 0)
  };
  const audienceAllCount = audienceEntries.reduce((sum, entry) => sum + entry.count, 0);
  const fashionAllCount = fashionCategories.reduce((sum, entry) => sum + entry.count, 0);
  const beautyAllCount = beautyCategories.reduce((sum, entry) => sum + entry.count, 0);
  const guideTriggerLabel = availableGuideDomains.length > 1
    ? (availableGuideDomains.length === 2 && availableGuideDomains.includes("fashion") && availableGuideDomains.includes("beauty")
      ? "Μόδα & Ομορφιά"
      : "Οδηγός προϊόντων")
    : availableGuideDomains[0] === "beauty"
      ? "Οδηγός ομορφιάς"
      : availableGuideDomains[0] === "fashion"
        ? "Οδηγός μόδας"
        : catalogDomainLabel;

  const goGuideBack = () => {
    if (guideDomain === "fashion") {
      if (guideFamily) setGuideFamily(null);
      else if (guideAudience) setGuideAudience(null);
      else if (availableGuideDomains.length > 1) setGuideDomain(null);
      else setGuideOpen(false);
      return;
    }
    if (guideDomain === "beauty") {
      if (beautyFamily) setBeautyFamily(null);
      else if (availableGuideDomains.length > 1) setGuideDomain(null);
      else setGuideOpen(false);
      return;
    }
    if (guideDomain === "catalog") {
      if (availableGuideDomains.length > 1) setGuideDomain(null);
      else setGuideOpen(false);
      return;
    }
    setGuideOpen(false);
  };

  const resetGuideToStart = () => {
    setGuideAudience(null);
    setGuideFamily(null);
    setBeautyFamily(null);
    setGuideDomain(availableGuideDomains.length === 1 ? availableGuideDomains[0] : null);
  };

  const guideTitle = guideDomain === "fashion"
    ? selectedGroup ? selectedGroup.label : guideAudience ? audienceLabel(guideAudience) : "Τι ψάχνετε στη μόδα;"
    : guideDomain === "beauty"
      ? selectedBeautyGroup ? selectedBeautyGroup.label : "Τι ψάχνετε στην ομορφιά;"
      : guideDomain === "catalog"
        ? catalogLooksLikeHome ? "Τι χρειάζεστε για το έργο σας;" : "Τι ψάχνετε στο κατάστημα;"
        : "Τι ψάχνετε σήμερα;";
  const guideSubtitle = guideDomain === null
    ? "Διάλεξε τον κόσμο που θέλεις να εξερευνήσεις. Ο οδηγός δημιουργείται από τον πραγματικό κατάλογο του συγκεκριμένου καταστήματος."
    : guideDomain === "fashion"
      ? selectedGroup
        ? "Διάλεξε μία ακριβή κατηγορία ή επίλεξε «Όλα» για ολόκληρο αυτό το επίπεδο."
        : guideAudience
          ? "Διάλεξε ομάδα ή επίλεξε «Όλα» για να δεις ολόκληρη αυτή την επιλογή."
          : "Πες μας πρώτα για ποιον ή τι ψάχνεις. Μπορείς να δεις όλη τη μόδα χωρίς άλλο βήμα."
      : guideDomain === "beauty"
        ? selectedBeautyGroup
          ? "Διάλεξε μία ακριβή κατηγορία ή επίλεξε «Όλα» για ολόκληρη αυτή την ομάδα."
          : "Διάλεξε τι σε ενδιαφέρει. Ο Οδηγός Ομορφιάς χρησιμοποιεί μόνο κατηγορίες που είναι διαθέσιμες στο κατάστημα."
        : catalogLooksLikeHome
          ? "Επίλεξε την κατηγορία που ταιριάζει στο έργο σου. Εμφανίζονται μόνο προϊόντα που διαθέτει πραγματικά αυτό το κατάστημα."
          : "Επίλεξε μία διαθέσιμη κατηγορία ή δες όλες τις υπόλοιπες επιλογές του καταστήματος.";

  const activeCategoryLabel = categoryGroup.length
    ? categoryGroupLabel || "Ομαδοποιημένη επιλογή"
    : category === "all"
      ? "Όλα τα προϊόντα"
      : categories.find((entry) => entry.value === category)?.label ?? "Επιλεγμένη κατηγορία";
  const activeChips = [
    ...(category !== "all" || categoryGroup.length ? [{ key: "category", label: activeCategoryLabel, clear: () => { setCategory("all"); setCategoryGroup([]); setCategoryGroupLabel(""); persistGuideSelection("all"); } }] : []),
    ...(brand !== "all" ? [{ key: "brand", label: optionLabel(brands, brand), clear: () => { setBrand("all"); setBrandSearch(""); } }] : []),
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
        <div className="vc-filter-head-copy">
          <strong>Φίλτρα προϊόντων</strong>
          <span>{facetsLoading ? "Προσαρμόζουμε τις επιλογές…" : totalKnown ? `${total} διαθέσιμα προϊόντα στο τρέχον πλαίσιο.` : remoteNextOffset !== null ? "Υπάρχουν περισσότερα διαθέσιμα προϊόντα." : `${visibleProducts.length} διαθέσιμα προϊόντα.`}</span>
        </div>
        {activeFilterCount ? <button type="button" onClick={resetAllFilters}>Καθαρισμός</button> : null}
      </div>

      {isGuidedVendor && facetsLoading && !remoteFacets ? <button className="vc-guide-trigger" type="button" disabled><span><small>ΠΡΟΣΩΠΙΚΟΣ ΟΔΗΓΟΣ</small><strong>Οργανώνουμε τον πλήρη κατάλογο…</strong></span><b>…</b></button> : null}
      {isGuidedVendor && availableGuideDomains.length ? <button className="vc-guide-trigger" type="button" onClick={reopenGuide}><span><small>ΠΡΟΣΩΠΙΚΟΣ ΟΔΗΓΟΣ</small><strong>{guideTriggerLabel}</strong></span><b>→</b></button> : null}

      {activeChips.length ? <div className="vc-active-filters" aria-label="Ενεργά φίλτρα">
        {activeChips.map((chip) => <button type="button" onClick={chip.clear} key={chip.key}><span>{chip.label}</span><b>×</b></button>)}
      </div> : null}

      {categoryGroup.length ? <div className="vc-group-note"><small>ΟΜΑΔΟΠΟΙΗΜΕΝΗ ΕΠΙΛΟΓΗ</small><strong>{activeCategoryLabel}</strong><span>{categoryGroup.length} κατηγορίες μαζί</span></div> : null}

      {relatedCategories.length ? <section className="vc-filter-card">
        <div className="vc-filter-card-head"><span>{category !== "all" || categoryGroup.length ? "Σχετικές κατηγορίες" : "Δημοφιλείς κατηγορίες"}</span><small>{relatedCategories.length}</small></div>
        <div className="vc-category-list">
          {category !== "all" || categoryGroup.length ? <button type="button" onClick={() => selectCategory("all")}><span>Όλα τα προϊόντα</span><em>↺</em></button> : null}
          {relatedCategories.map((entry) => <button className={category === entry.value && !categoryGroup.length ? "active" : ""} type="button" onClick={() => selectCategory(entry.value)} key={entry.value}><span>{entry.label}</span><em>{entry.count}</em></button>)}
        </div>
      </section> : null}

      {(brands.length > 0 || colors.length > 1 || sizes.length > 1 || fits.length > 0 || materials.length > 0) ? <section className="vc-filter-card vc-rich-filters">
        <div className="vc-filter-card-head"><span>Περισσότερα φίλτρα</span><small>{activeFilterCount}</small></div>

        {brands.length > 0 ? <details className="vc-facet-details" open>
          <summary><span>Μάρκα {brand !== "all" ? <em>· {optionLabel(brands, brand)}</em> : null}</span><em>{brands.length}</em></summary>
          <div className="vc-facet-body">
            <div className="vc-brand-search">
              <span className="vc-brand-search-icon" aria-hidden="true">⌕</span>
              <input type="search" value={brandSearch} onChange={(event) => setBrandSearch(event.target.value.slice(0, 80))} placeholder="Αναζήτηση μάρκας…" aria-label="Αναζήτηση μάρκας" />
              {brandSearch ? <button type="button" onClick={() => setBrandSearch("")} aria-label="Καθαρισμός αναζήτησης μάρκας">×</button> : null}
            </div>
            {visibleBrands.length ? <div className="vc-brand-results">
              {brand !== "all" ? <button type="button" onClick={() => { setBrand("all"); setBrandSearch(""); }}><span>Όλες οι μάρκες</span><em>↺</em></button> : null}
              {visibleBrands.map((entry) => <button className={brand === entry.value ? "active" : ""} type="button" onClick={() => { setBrand(brand === entry.value ? "all" : entry.value); setBrandSearch(""); }} key={entry.value}><span>{entry.label}</span><em>{entry.count}</em></button>)}
            </div> : <div className="vc-brand-empty">Δεν βρέθηκε μάρκα με αυτή την αναζήτηση.</div>}
          </div>
        </details> : null}

        {colors.length > 1 ? <details className="vc-facet-details" open={!mobile || color !== "all"}>
          <summary><span>Χρώμα {color !== "all" ? <em>· {optionLabel(colors, color)}</em> : null}</span><em>{colors.length}</em></summary>
          <div className="vc-facet-body"><div className="vc-facet-title"><span>Επιλογή χρώματος</span>{color !== "all" ? <button type="button" onClick={() => setColor("all")}>Καθαρισμός</button> : null}</div>{facetChips(colors, color, setColor, "color")}{colors.length > CHIP_LIMIT ? <select className="vc-more-select" value={color} onChange={(event) => setColor(event.target.value)}><option value="all">Όλα τα χρώματα</option>{colors.map((entry) => <option value={entry.value} key={entry.value}>{entry.label} ({entry.count})</option>)}</select> : null}</div>
        </details> : null}

        {sizes.length > 1 ? <details className="vc-facet-details" open={size !== "all"}>
          <summary><span>Μέγεθος {size !== "all" ? <em>· {optionLabel(sizes, size)}</em> : null}</span><em>{sizes.length}</em></summary>
          <div className="vc-facet-body"><div className="vc-facet-title"><span>Διαθέσιμα μεγέθη</span>{size !== "all" ? <button type="button" onClick={() => setSize("all")}>Καθαρισμός</button> : null}</div>{facetChips(sizes, size, setSize)}{sizes.length > CHIP_LIMIT ? <select className="vc-more-select" value={size} onChange={(event) => setSize(event.target.value)}><option value="all">Όλα τα μεγέθη</option>{sizes.map((entry) => <option value={entry.value} key={entry.value}>{entry.label} ({entry.count})</option>)}</select> : null}</div>
        </details> : null}

        {fits.length ? <details className="vc-facet-details" open={fit !== "all"}>
          <summary><span>Γραμμή / Fit {fit !== "all" ? <em>· {optionLabel(fits, fit)}</em> : null}</span><em>{fits.length}</em></summary>
          <div className="vc-facet-body"><div className="vc-facet-title"><span>Γραμμή εφαρμογής</span>{fit !== "all" ? <button type="button" onClick={() => setFit("all")}>Καθαρισμός</button> : null}</div>{facetChips(fits, fit, setFit)}</div>
        </details> : null}

        {materials.length ? <details className="vc-facet-details" open={material !== "all"}>
          <summary><span>Υλικό {material !== "all" ? <em>· {optionLabel(materials, material)}</em> : null}</span><em>{materials.length}</em></summary>
          <div className="vc-facet-body"><div className="vc-facet-title"><span>Κύριο υλικό</span>{material !== "all" ? <button type="button" onClick={() => setMaterial("all")}>Καθαρισμός</button> : null}</div>{facetChips(materials, material, setMaterial)}</div>
        </details> : null}
      </section> : null}

      {mobile ? <section className="vc-filter-card vc-mobile-sort"><SortSelect value={sort} onChange={setSort} compact /></section> : null}

      <div className="vc-availability-note"><div><span>ΔΙΑΘΕΣΙΜΟΤΗΤΑ</span><strong>Μόνο διαθέσιμα τώρα</strong></div></div>
      {mobile ? <div className="vc-mobile-hint">{remoteLoading ? "Ετοιμάζουμε τη βιτρίνα…" : totalKnown ? `${total} προϊόντα με τα επιλεγμένα φίλτρα` : remoteNextOffset !== null ? "Περισσότερα προϊόντα διαθέσιμα" : `${visibleProducts.length} προϊόντα`}</div> : null}
    </div>
  );

  return <div className="vc-browser">
    <div className="vc-layout">
      <aside className="vc-sidebar" aria-label="Κατηγορίες και φίλτρα προϊόντων">{filterPanel()}</aside>
      <div className="vc-results" ref={catalogResultsRef}>
        {isGuidedVendor ? <div className="vc-active-guide"><div><small>Η επιλογή σου</small><strong>{activeCategoryLabel}</strong></div><button type="button" onClick={reopenGuide}>Αλλαγή αναζήτησης</button></div> : null}
        <div className="vc-toolbar">
          <label className="vc-search"><span>Αναζήτηση στο κατάστημα</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value.slice(0, 120))} placeholder="Προϊόν, μάρκα, κωδικός…" /></label>
          <SortSelect value={sort} onChange={setSort} />
        </div>
        {activeChips.length ? <div className="vc-result-chips">{activeChips.map((chip) => <button type="button" onClick={chip.clear} key={chip.key}>{chip.label}<span>×</span></button>)}</div> : null}
        <div className="vc-meta">{remoteLoading && !visibleProducts.length ? <span><strong>Φόρτωση</strong> προϊόντων…</span> : <span><strong>{visibleProducts.length}</strong> προϊόντα στη σελίδα {currentPage}{totalKnown ? <> · {total} προϊόντα με το τρέχον πλαίσιο.</> : remoteNextOffset !== null ? <> · υπάρχουν περισσότερα διαθέσιμα.</> : "."}</span>}{remoteError ? <span>Υπήρξε προσωρινό πρόβλημα φόρτωσης. Μπορείς να αλλάξεις φίλτρα ή να δοκιμάσεις ξανά.</span> : null}</div>
        {remoteLoading && !visibleProducts.length ? <div className="vc-loading"><span className="vc-spinner" /><strong>Ετοιμάζουμε τη βιτρίνα…</strong><p>Φορτώνουμε μόνο ό,τι χρειάζεται για την επιλογή σου.</p></div> : visibleProducts.length ? <>
          <div className="vc-grid">{visibleProducts.map((product, index) => <CatalogProductCard product={product} index={index} vendorContext={vendor} demoVendorId={demoVendorId} key={product.id} />)}</div>
          {hasPagination ? <nav className="vc-pagination" aria-label="Σελιδοποίηση προϊόντων">
            <button type="button" onClick={() => void loadPage(remoteOffset - PAGE_SIZE)} disabled={remoteLoading || remoteOffset === 0}>← Προηγούμενη</button>
            <span><strong>Σελίδα {currentPage}</strong><small>{totalKnown ? `από ${totalPages}` : "περισσότερα διαθέσιμα"}</small></span>
            <button type="button" onClick={() => remoteNextOffset !== null && void loadPage(remoteNextOffset)} disabled={remoteLoading || remoteNextOffset === null}>{remoteLoading ? "Φόρτωση…" : "Επόμενη →"}</button>
          </nav> : null}
        </> : <div className="vc-empty"><h3>Δεν βρέθηκε προϊόν.</h3><p>Δοκίμασε διαφορετική επιλογή ή επέστρεψε στον οδηγό.</p><button className="button" type="button" onClick={isGuidedVendor ? reopenGuide : resetAllFilters}>{isGuidedVendor ? "Από την αρχή" : "Καθαρισμός φίλτρων"}</button></div>}
      </div>
    </div>

    <StorefrontColorFinderLauncher
      vendorId={vendorId}
      categories={categories}
      activeCategory={category}
      activeCategoryGroup={categoryGroup}
      colorFacetCount={colors.length}
    />

    <div className="vc-mobile-dock" role="search"><input type="search" value={query} onChange={(event) => setQuery(event.target.value.slice(0, 120))} placeholder="Αναζήτηση προϊόντος…" /><button type="button" onClick={() => setFiltersOpen(true)}>Φίλτρα{activeFilterCount ? ` · ${activeFilterCount}` : ""}</button>{isGuidedVendor ? <button className="guide" type="button" onClick={reopenGuide}>Οδηγός</button> : null}</div>

    {filtersOpen ? <div className="vc-sheet-layer"><button className="vc-backdrop" type="button" onClick={() => setFiltersOpen(false)} aria-label="Κλείσιμο φίλτρων" /><aside className="vc-sheet" role="dialog" aria-modal="true" aria-label="Φίλτρα προϊόντων"><header><div><span>Κατάλογος</span><strong>Κατηγορίες & φίλτρα</strong></div><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Κλείσιμο">×</button></header><div className="vc-sheet-body">{filterPanel(true)}</div><footer style={activeFilterCount ? undefined : { gridTemplateColumns: "1fr" }}>{activeFilterCount ? <button className="vc-footer-reset" type="button" onClick={resetAllFilters}>Καθαρισμός</button> : null}<button className="vc-footer-show" type="button" onClick={() => setFiltersOpen(false)}>{totalKnown ? `Προβολή ${total} προϊόντων` : "Προβολή προϊόντων"}</button></footer></aside></div> : null}

    {isGuidedVendor && availableGuideDomains.length && guideOpen ? <div className={`fashion-guide${guideDomain === "beauty" ? " beauty-guide" : guideDomain === "catalog" ? " catalog-guide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="fashion-guide-title">
      <div className="fashion-guide-shell">
        <header className="fashion-guide-header"><div className="fashion-guide-brand"><span>ΚΟΝΤΑ ΜΟΥ</span><small>{guideDomain === "fashion" ? "ΠΡΟΣΩΠΙΚΟΣ ΟΔΗΓΟΣ ΜΟΔΑΣ" : guideDomain === "beauty" ? "ΠΡΟΣΩΠΙΚΟΣ ΟΔΗΓΟΣ ΟΜΟΡΦΙΑΣ" : guideDomain === "catalog" ? `ΠΡΟΣΩΠΙΚΟΣ ΟΔΗΓΟΣ · ${catalogDomainLabel.toLocaleUpperCase("el")}` : "ΠΡΟΣΩΠΙΚΟΣ ΟΔΗΓΟΣ"} · {vendor.name}</small></div><button className="fashion-guide-close" type="button" onClick={() => setGuideOpen(false)} aria-label="Κλείσιμο">×</button></header>
        <main className="fashion-guide-main">
          <div className="fashion-guide-breadcrumb">{guideDomain === "fashion" ? `Μόδα${guideAudience ? ` / ${audienceLabel(guideAudience)}` : ""}${selectedGroup ? ` / ${selectedGroup.label}` : ""}` : guideDomain === "beauty" ? `Ομορφιά${selectedBeautyGroup ? ` / ${selectedBeautyGroup.label}` : ""}` : guideDomain === "catalog" ? catalogDomainLabel : "Προσωπικός οδηγός προϊόντων"}</div>
          <div className="fashion-guide-heading"><p>ΛΙΓΟ ΠΙΟ ΕΥΚΟΛΑ</p><h2 id="fashion-guide-title">{guideTitle}</h2><span>{guideSubtitle}</span></div>
          {facetsLoading && !categories.length ? <div className="fashion-guide-wait"><span className="vc-spinner" /><strong>Οργανώνουμε τον κατάλογο…</strong></div> : guideDomain === null ? <div className="fashion-guide-options audience-options gateway-options">
            {fashionCategories.length ? <button className="guide-domain-card guide-domain-fashion" type="button" onClick={() => { setGuideDomain("fashion"); setGuideAudience(null); setGuideFamily(null); }}><span className="guide-icon">Μ</span><span><strong>Μόδα</strong><small>Ρούχα, παπούτσια, τσάντες, κοσμήματα & αξεσουάρ</small></span><em>{fashionAllCount}</em><b>→</b></button> : null}
            {beautyCategories.length ? <button className="guide-domain-card guide-domain-beauty" type="button" onClick={() => { setGuideDomain("beauty"); setBeautyFamily(null); }}><span className="guide-icon">Ο</span><span><strong>Ομορφιά</strong><small>Περιποίηση, μακιγιάζ, αρώματα, μαλλιά & σώμα</small></span><em>{beautyAllCount}</em><b>→</b></button> : null}
            {catalogCategories.length ? <button className="guide-domain-card guide-domain-catalog" type="button" onClick={() => setGuideDomain("catalog")}><span className="guide-icon">{catalogLooksLikeHome ? "Ε" : "Κ"}</span><span><strong>{catalogDomainLabel}</strong><small>{catalogDomainHelper}</small></span><em>{catalogAllCount}</em><b>→</b></button> : null}
            <button className="all-products gateway-all-products" type="button" onClick={() => selectCategory("all")}><span className="guide-icon">∞</span><span><strong>Όλα τα προϊόντα</strong><small>Παράλειψη του οδηγού και προβολή ολόκληρου του καταλόγου</small></span><em>{guideTotal}</em><b>→</b></button>
          </div> : guideDomain === "fashion" ? selectedGroup && guideAudience ? <div className="fashion-guide-options leaf-options">
            <button className="all-current" type="button" onClick={() => selectCategoryGroup(selectedGroup.entries, `${audienceLabel(guideAudience)} · ${selectedGroup.label}`)}><span><strong>Όλα τα {selectedGroup.label.toLocaleLowerCase("el")}</strong><small>Όλα σε {audienceLabel(guideAudience).toLocaleLowerCase("el")} · {selectedGroup.label.toLocaleLowerCase("el")}</small></span><em>{selectedGroup.count}</em><b>→</b></button>
            {selectedGroup.entries.map((entry) => <button type="button" onClick={() => selectCategory(entry.value)} key={entry.value}><span><strong>{entry.label}</strong><small>Δες μόνο αυτή την κατηγορία</small></span><em>{entry.count}</em><b>→</b></button>)}
          </div> : guideAudience ? <div className="fashion-guide-options">
            <button className="all-current" type="button" onClick={() => selectCategoryGroup(audienceEntries, `Όλα τα ${audienceLabel(guideAudience).toLocaleLowerCase("el")}`)}><span><strong>Όλα τα {audienceLabel(guideAudience).toLocaleLowerCase("el")}</strong><small>Μην περιορίσεις άλλο αυτή την επιλογή</small></span><em>{audienceAllCount}</em><b>→</b></button>
            {guideGroups.map((group) => <button type="button" onClick={() => setGuideFamily(group.key)} key={group.key}><span><strong>{group.label}</strong><small>{group.helper}</small></span><em>{group.count}</em><b>→</b></button>)}
          </div> : <div className="fashion-guide-options audience-options">
            {audienceCounts.women > 0 ? <button type="button" onClick={() => setGuideAudience("women")}><span className="guide-icon">♀</span><span><strong>Γυναικεία</strong><small>Ρούχα, παπούτσια, τσάντες & άλλα</small></span><em>{audienceCounts.women}</em><b>→</b></button> : null}
            {audienceCounts.men > 0 ? <button type="button" onClick={() => setGuideAudience("men")}><span className="guide-icon">♂</span><span><strong>Ανδρικά</strong><small>Ρούχα, παπούτσια & άλλα</small></span><em>{audienceCounts.men}</em><b>→</b></button> : null}
            {audienceCounts.accessories > 0 ? <button type="button" onClick={() => setGuideAudience("accessories")}><span className="guide-icon">◇</span><span><strong>Αξεσουάρ & τσάντες</strong><small>Κοσμήματα, γυαλιά, αποσκευές & αξεσουάρ</small></span><em>{audienceCounts.accessories}</em><b>→</b></button> : null}
            <button className="all-products" type="button" onClick={() => selectCategoryGroup(fashionCategories, "Όλη η μόδα")}><span className="guide-icon">∞</span><span><strong>Όλη η μόδα</strong><small>Δες όλα τα προϊόντα μόδας χωρίς άλλο βήμα</small></span><em>{fashionAllCount}</em><b>→</b></button>
          </div> : guideDomain === "beauty" ? selectedBeautyGroup ? <div className="fashion-guide-options leaf-options">
            <button className="all-current" type="button" onClick={() => selectCategoryGroup(selectedBeautyGroup.entries, selectedBeautyGroup.label)}><span><strong>Όλα: {selectedBeautyGroup.label}</strong><small>Δες ολόκληρη αυτή την ομάδα ομορφιάς</small></span><em>{selectedBeautyGroup.count}</em><b>→</b></button>
            {selectedBeautyGroup.entries.map((entry) => <button type="button" onClick={() => selectCategory(entry.value)} key={entry.value}><span><strong>{entry.label}</strong><small>Δες μόνο αυτή την κατηγορία</small></span><em>{entry.count}</em><b>→</b></button>)}
          </div> : <div className="fashion-guide-options beauty-options">
            <button className="all-current" type="button" onClick={() => selectCategoryGroup(beautyCategories, "Όλη η ομορφιά")}><span><strong>Όλη η ομορφιά</strong><small>Δες όλα τα προϊόντα ομορφιάς χωρίς άλλο βήμα</small></span><em>{beautyAllCount}</em><b>→</b></button>
            {beautyGroups.map((group) => <button type="button" onClick={() => setBeautyFamily(group.key)} key={group.key}><span><strong>{group.label}</strong><small>{group.helper}</small></span><em>{group.count}</em><b>→</b></button>)}
          </div> : <div className="fashion-guide-options catalog-options leaf-options">
            <button className="all-current" type="button" onClick={() => selectCategoryGroup(catalogCategories, catalogDomainLabel)}><span><strong>Όλα: {catalogDomainLabel}</strong><small>Δες όλες τις διαθέσιμες κατηγορίες αυτού του τομέα</small></span><em>{catalogAllCount}</em><b>→</b></button>
            {catalogCategories.map((entry) => <button type="button" onClick={() => selectCategory(entry.value)} key={entry.value}><span><strong>{entry.label}</strong><small>Δες μόνο αυτή την κατηγορία</small></span><em>{entry.count}</em><b>→</b></button>)}
          </div>}
        </main>
        <footer className="fashion-guide-footer"><button type="button" onClick={goGuideBack}>{guideDomain ? "← Πίσω" : "Κλείσιμο"}</button>{(guideDomain || guideAudience || guideFamily || beautyFamily) ? <button type="button" onClick={resetGuideToStart}>Από την αρχή</button> : null}<span>Οι επιλογές προσαρμόζονται στον πραγματικό κατάλογο του καταστήματος.</span></footer>
      </div>
    </div> : null}
  </div>;
}
