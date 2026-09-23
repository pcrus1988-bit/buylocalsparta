"use client";

import { useMemo, useState } from "react";
import type { CatalogFacetOption } from "../lib/catalog-view";
import type { CatalogAttributeFacet } from "../lib/catalog-attribute-facets";

const CHIP_LIMIT = 12;
const BRAND_RESULT_LIMIT = 48;

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

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("el");
}

function optionLabel(options: readonly CatalogFacetOption[], value: string): string {
  return options.find((entry) => entry.value === value)?.label ?? value;
}

function colorSwatch(value: string): string | undefined {
  return COLOR_SWATCHES[value.trim().toLocaleLowerCase("en")];
}

function optionCount(option: CatalogFacetOption) {
  return typeof option.count === "number" && Number.isFinite(option.count) ? <em>{option.count}</em> : null;
}

function FacetChips({
  options,
  value,
  setValue,
  color = false
}: {
  options: readonly CatalogFacetOption[];
  value: string;
  setValue: (value: string) => void;
  color?: boolean;
}) {
  return <div className="vc-chip-grid">
    {options.slice(0, CHIP_LIMIT).map((entry) => {
      const swatch = color ? colorSwatch(entry.value) : undefined;
      return <button
        className={value === entry.value ? "active" : ""}
        type="button"
        onClick={() => setValue(value === entry.value ? "" : entry.value)}
        aria-pressed={value === entry.value}
        key={entry.value}
      >
        {color ? <span className="vc-color-dot" style={swatch ? { background: swatch } : undefined} aria-hidden="true" /> : null}
        <span>{entry.label}</span>
        {optionCount(entry)}
      </button>;
    })}
  </div>;
}

function StandardFacet({
  label,
  helper,
  options,
  value,
  setValue,
  color = false,
  open = false
}: {
  label: string;
  helper: string;
  options: readonly CatalogFacetOption[];
  value: string;
  setValue: (value: string) => void;
  color?: boolean;
  open?: boolean;
}) {
  if (!options.length) return null;
  return <details className="vc-facet-details" open={open || Boolean(value)}>
    <summary>
      <span>{label}{value ? <em>· {optionLabel(options, value)}</em> : null}</span>
      <em>{options.length}</em>
    </summary>
    <div className="vc-facet-body">
      <div className="vc-facet-title">
        <span>{helper}</span>
        {value ? <button type="button" onClick={() => setValue("")}>Καθαρισμός</button> : null}
      </div>
      <FacetChips options={options} value={value} setValue={setValue} color={color} />
      {options.length > CHIP_LIMIT ? <select className="vc-more-select" value={value} onChange={(event) => setValue(event.target.value)}>
        <option value="">Όλα</option>
        {options.map((entry) => <option value={entry.value} key={entry.value}>{entry.label}{typeof entry.count === "number" ? ` (${entry.count})` : ""}</option>)}
      </select> : null}
    </div>
  </details>;
}

export function ShopFilterFacets({
  brands,
  colors,
  sizes,
  fits,
  attributeFacets,
  selectedBrand,
  selectedColor,
  selectedSize,
  selectedFit,
  selectedAttributes
}: {
  brands: readonly CatalogFacetOption[];
  colors: readonly CatalogFacetOption[];
  sizes: readonly CatalogFacetOption[];
  fits: readonly CatalogFacetOption[];
  attributeFacets: readonly CatalogAttributeFacet[];
  selectedBrand: string;
  selectedColor: string;
  selectedSize: string;
  selectedFit: string;
  selectedAttributes: Readonly<Record<string, string>>;
}) {
  const [brand, setBrand] = useState(selectedBrand);
  const [brandSearch, setBrandSearch] = useState("");
  const [color, setColor] = useState(selectedColor);
  const [size, setSize] = useState(selectedSize);
  const [fit, setFit] = useState(selectedFit);
  const [attributes, setAttributes] = useState<Readonly<Record<string, string>>>(selectedAttributes);

  const visibleBrands = useMemo(() => {
    const needle = normalized(brandSearch);
    let matches = needle
      ? brands.filter((entry) => normalized(entry.label).includes(needle) || normalized(entry.value).includes(needle))
      : [...brands];
    matches = matches.slice(0, BRAND_RESULT_LIMIT);
    if (brand && !matches.some((entry) => entry.value === brand)) {
      const selected = brands.find((entry) => entry.value === brand);
      if (selected) matches = [selected, ...matches].slice(0, BRAND_RESULT_LIMIT);
    }
    return matches;
  }, [brand, brandSearch, brands]);

  const activeFilterCount = [
    brand,
    color,
    size,
    fit,
    ...Object.values(attributes)
  ].filter(Boolean).length;

  const hasRichFilters = brands.length > 0
    || colors.length > 0
    || sizes.length > 0
    || fits.length > 0
    || attributeFacets.length > 0;

  if (!hasRichFilters) return null;

  return <>
    {brand ? <input type="hidden" name="brand" value={brand} /> : null}
    {color ? <input type="hidden" name="color" value={color} /> : null}
    {size ? <input type="hidden" name="size" value={size} /> : null}
    {fit ? <input type="hidden" name="fit" value={fit} /> : null}
    {Object.entries(attributes).map(([key, value]) => value ? <input type="hidden" name={`attr_${key}`} value={value} key={key} /> : null)}

    <section className="vc-filter-card vc-rich-filters km-shop-rich-filters">
      <div className="vc-filter-card-head">
        <span>Περισσότερα φίλτρα</span>
        <small>{activeFilterCount}</small>
      </div>

      {brands.length > 0 ? <details className="vc-facet-details" open>
        <summary>
          <span>Μάρκα {brand ? <em>· {optionLabel(brands, brand)}</em> : null}</span>
          <em>{brands.length}</em>
        </summary>
        <div className="vc-facet-body">
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
          {visibleBrands.length ? <div className="vc-brand-results">
            {brand ? <button type="button" onClick={() => { setBrand(""); setBrandSearch(""); }}>
              <span>Όλες οι μάρκες</span><em>↺</em>
            </button> : null}
            {visibleBrands.map((entry) => <button
              className={brand === entry.value ? "active" : ""}
              type="button"
              onClick={() => { setBrand(brand === entry.value ? "" : entry.value); setBrandSearch(""); }}
              aria-pressed={brand === entry.value}
              key={entry.value}
            >
              <span>{entry.label}</span>
              {optionCount(entry)}
            </button>)}
          </div> : <div className="vc-brand-empty">Δεν βρέθηκε μάρκα με αυτή την αναζήτηση.</div>}
        </div>
      </details> : null}

      <StandardFacet label="Χρώμα" helper="Επιλογή χρώματος" options={colors} value={color} setValue={setColor} color />
      <StandardFacet label="Μέγεθος" helper="Διαθέσιμα μεγέθη" options={sizes} value={size} setValue={setSize} />
      <StandardFacet label="Γραμμή / Fit" helper="Γραμμή εφαρμογής" options={fits} value={fit} setValue={setFit} />

      {attributeFacets.map((facet) => {
        const current = attributes[facet.key] ?? "";
        const options: readonly CatalogFacetOption[] = facet.options;
        return <StandardFacet
          label={facet.label}
          helper={facet.label === "Υλικό" ? "Κύριο υλικό" : `Επιλογές: ${facet.label.toLocaleLowerCase("el")}`}
          options={options}
          value={current}
          setValue={(next) => setAttributes((previous) => ({ ...previous, [facet.key]: next }))}
          key={facet.key}
        />;
      })}
    </section>
  </>;
}
