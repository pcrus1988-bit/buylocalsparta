"use client";

import { useEffect, useMemo, useState } from "react";

type FilterOption = Readonly<{
  value: string;
  label: string;
  count?: number;
}>;

type FilterFacetPayload = Readonly<{
  brands?: readonly FilterOption[];
  colors?: readonly FilterOption[];
  sizes?: readonly FilterOption[];
}>;

type ShopFilterFacetsProps = Readonly<{
  category: string;
  query: string;
  subcategory: string;
  initialBrands: readonly FilterOption[];
  initialColors: readonly FilterOption[];
  initialSizes: readonly FilterOption[];
  initialFits: readonly FilterOption[];
  initialMaterials: readonly FilterOption[];
  initialBrand: string;
  initialColor: string;
  initialSize: string;
  initialFit: string;
  initialMaterial: string;
}>;

const BRAND_RESULT_LIMIT = 48;
const CHIP_LIMIT = 12;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("el");
}

function selectedLabel(options: readonly FilterOption[], value: string): string {
  return options.find((entry) => entry.value === value)?.label ?? value;
}

function countLabel(entry: FilterOption): string {
  return typeof entry.count === "number" && entry.count > 0 ? String(entry.count) : "";
}

export function ShopFilterFacets({
  category,
  query,
  subcategory,
  initialBrands,
  initialColors,
  initialSizes,
  initialFits,
  initialMaterials,
  initialBrand,
  initialColor,
  initialSize,
  initialFit,
  initialMaterial
}: ShopFilterFacetsProps) {
  const [brands, setBrands] = useState<readonly FilterOption[]>(initialBrands);
  const [colors, setColors] = useState<readonly FilterOption[]>(initialColors);
  const [sizes, setSizes] = useState<readonly FilterOption[]>(initialSizes);
  const [brand, setBrand] = useState(initialBrand);
  const [color, setColor] = useState(initialColor);
  const [size, setSize] = useState(initialSize);
  const [fit, setFit] = useState(initialFit);
  const [material, setMaterial] = useState(initialMaterial);
  const [brandSearch, setBrandSearch] = useState("");
  const [loading, setLoading] = useState(initialBrands.length === 0 && initialColors.length === 0 && initialSizes.length === 0);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let requested = false;

    const load = async () => {
      if (requested) return;
      requested = true;
      setLoading(true);
      setLoadFailed(false);
      try {
        const params = new URLSearchParams();
        if (category) params.set("category", category);
        if (query) params.set("q", query);
        if (subcategory) params.set("subcategory", subcategory);
        if (brand) params.set("brand", brand);
        if (color) params.set("color", color);
        if (size) params.set("size", size);
        const response = await fetch(`/api/shop/filter-facets?${params.toString()}`, { cache: "default" });
        if (!response.ok) throw new Error(`Filter facets failed with ${response.status}`);
        const payload = await response.json() as { facets?: FilterFacetPayload };
        if (cancelled || !payload.facets) return;
        setBrands(payload.facets.brands ?? []);
        setColors(payload.facets.colors ?? []);
        setSizes(payload.facets.sizes ?? []);
      } catch (error) {
        if (!cancelled) {
          setLoadFailed(true);
          console.error("Shop filter facets failed", error);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const root = document.documentElement;
    const shouldLoad = () => {
      if (window.matchMedia("(min-width: 961px)").matches || root.classList.contains("km-catalog-filters-open")) {
        void load();
      }
    };

    shouldLoad();
    const observer = new MutationObserver(shouldLoad);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    const media = window.matchMedia("(min-width: 961px)");
    media.addEventListener("change", shouldLoad);

    return () => {
      cancelled = true;
      observer.disconnect();
      media.removeEventListener("change", shouldLoad);
    };
  }, [brand, category, color, query, size, subcategory]);

  const visibleBrands = useMemo(() => {
    const needle = normalize(brandSearch);
    let matches = needle
      ? brands.filter((entry) => normalize(entry.label).includes(needle) || normalize(entry.value).includes(needle))
      : brands;
    matches = matches.slice(0, BRAND_RESULT_LIMIT);
    if (brand && !matches.some((entry) => entry.value === brand)) {
      const selected = brands.find((entry) => entry.value === brand);
      if (selected) matches = [selected, ...matches].slice(0, BRAND_RESULT_LIMIT);
    }
    return matches;
  }, [brand, brandSearch, brands]);

  const fits = initialFits;
  const materials = initialMaterials;
  const activeCount = [brand, color, size, fit, material].filter(Boolean).length;
  const hasFacets = loading || brands.length > 0 || colors.length > 1 || sizes.length > 1 || fits.length > 0 || materials.length > 0;

  const facetChips = (
    options: readonly FilterOption[],
    selected: string,
    setSelected: (value: string) => void
  ) => (
    <div className="vc-chip-grid">
      {options.slice(0, CHIP_LIMIT).map((entry) => (
        <button
          className={selected === entry.value ? "active" : ""}
          type="button"
          onClick={() => setSelected(selected === entry.value ? "" : entry.value)}
          key={entry.value}
        >
          <span>{entry.label}</span>
          {countLabel(entry) ? <em>{countLabel(entry)}</em> : null}
        </button>
      ))}
    </div>
  );

  if (!hasFacets && !loadFailed) return null;

  return (
    <section className="vc-filter-card vc-rich-filters shop-rich-filters" aria-label="Περισσότερα φίλτρα">
      <div className="vc-filter-card-head">
        <span>Περισσότερα φίλτρα</span>
        <small>{activeCount}</small>
      </div>

      {loading && brands.length === 0 ? (
        <div className="shop-filter-loading"><span className="vc-spinner" aria-hidden="true" /><span>Φορτώνουμε διαθέσιμα φίλτρα…</span></div>
      ) : null}

      {loadFailed && brands.length === 0 && colors.length === 0 && sizes.length === 0 ? (
        <div className="vc-brand-empty">Τα επιπλέον φίλτρα δεν φορτώθηκαν προσωρινά. Τα βασικά φίλτρα παραμένουν διαθέσιμα.</div>
      ) : null}

      {brands.length > 0 ? (
        <details className="vc-facet-details" open>
          <summary>
            <span>Μάρκα {brand ? <em>· {selectedLabel(brands, brand)}</em> : null}</span>
            <em>{brands.length}</em>
          </summary>
          <div className="vc-facet-body">
            <input type="hidden" name="brand" value={brand} />
            <div className="vc-brand-search">
              <span className="vc-brand-search-icon" aria-hidden="true">⌕</span>
              <input
                type="search"
                value={brandSearch}
                onChange={(event) => setBrandSearch(event.target.value.slice(0, 80))}
                placeholder="Αναζήτηση μάρκας…"
                aria-label="Αναζήτηση μάρκας"
              />
              {brandSearch ? <button type="button" onClick={() => setBrandSearch("")} aria-label="Καθαρισμός αναζήτησης μάρκας">×</button> : null}
            </div>
            {visibleBrands.length ? (
              <div className="vc-brand-results">
                {brand ? <button type="button" onClick={() => { setBrand(""); setBrandSearch(""); }}><span>Όλες οι μάρκες</span><em>↺</em></button> : null}
                {visibleBrands.map((entry) => (
                  <button
                    className={brand === entry.value ? "active" : ""}
                    type="button"
                    onClick={() => { setBrand(brand === entry.value ? "" : entry.value); setBrandSearch(""); }}
                    key={entry.value}
                  >
                    <span>{entry.label}</span>
                    <em>{countLabel(entry)}</em>
                  </button>
                ))}
              </div>
            ) : <div className="vc-brand-empty">Δεν βρέθηκε μάρκα με αυτή την αναζήτηση.</div>}
          </div>
        </details>
      ) : null}

      {colors.length > 1 ? (
        <details className="vc-facet-details" open={Boolean(color)}>
          <summary><span>Χρώμα {color ? <em>· {selectedLabel(colors, color)}</em> : null}</span><em>{colors.length}</em></summary>
          <div className="vc-facet-body">
            <input type="hidden" name="color" value={color} />
            <div className="vc-facet-title"><span>Επιλογή χρώματος</span>{color ? <button type="button" onClick={() => setColor("")}>Καθαρισμός</button> : null}</div>
            {facetChips(colors, color, setColor)}
            {colors.length > CHIP_LIMIT ? <select className="vc-more-select" value={color} onChange={(event) => setColor(event.target.value)}><option value="">Όλα τα χρώματα</option>{colors.map((entry) => <option value={entry.value} key={entry.value}>{entry.label}{countLabel(entry) ? ` (${countLabel(entry)})` : ""}</option>)}</select> : null}
          </div>
        </details>
      ) : null}

      {sizes.length > 1 ? (
        <details className="vc-facet-details" open={Boolean(size)}>
          <summary><span>Μέγεθος {size ? <em>· {selectedLabel(sizes, size)}</em> : null}</span><em>{sizes.length}</em></summary>
          <div className="vc-facet-body">
            <input type="hidden" name="size" value={size} />
            <div className="vc-facet-title"><span>Διαθέσιμα μεγέθη</span>{size ? <button type="button" onClick={() => setSize("")}>Καθαρισμός</button> : null}</div>
            {facetChips(sizes, size, setSize)}
            {sizes.length > CHIP_LIMIT ? <select className="vc-more-select" value={size} onChange={(event) => setSize(event.target.value)}><option value="">Όλα τα μεγέθη</option>{sizes.map((entry) => <option value={entry.value} key={entry.value}>{entry.label}{countLabel(entry) ? ` (${countLabel(entry)})` : ""}</option>)}</select> : null}
          </div>
        </details>
      ) : null}

      {fits.length > 0 ? (
        <details className="vc-facet-details" open={Boolean(fit)}>
          <summary><span>Γραμμή / Fit {fit ? <em>· {selectedLabel(fits, fit)}</em> : null}</span><em>{fits.length}</em></summary>
          <div className="vc-facet-body">
            <input type="hidden" name="fit" value={fit} />
            <div className="vc-facet-title"><span>Γραμμή εφαρμογής</span>{fit ? <button type="button" onClick={() => setFit("")}>Καθαρισμός</button> : null}</div>
            {facetChips(fits, fit, setFit)}
          </div>
        </details>
      ) : null}

      {materials.length > 0 ? (
        <details className="vc-facet-details" open={Boolean(material)}>
          <summary><span>Υλικό {material ? <em>· {selectedLabel(materials, material)}</em> : null}</span><em>{materials.length}</em></summary>
          <div className="vc-facet-body">
            <input type="hidden" name="attr_material" value={material} />
            <div className="vc-facet-title"><span>Κύριο υλικό</span>{material ? <button type="button" onClick={() => setMaterial("")}>Καθαρισμός</button> : null}</div>
            {facetChips(materials, material, setMaterial)}
          </div>
        </details>
      ) : null}
    </section>
  );
}
