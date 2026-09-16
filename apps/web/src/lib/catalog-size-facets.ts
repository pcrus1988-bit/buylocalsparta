export type ExplicitSizeSystem = "EU" | "US" | "UK";

export type SizeFacetValue = Readonly<{
  value: string;
  count?: number;
}>;

export type ParsedSizeFacet = Readonly<{
  value: string;
  label: string;
  system: ExplicitSizeSystem | null;
  count?: number;
}>;

export type SizeFacetGroup = Readonly<{
  key: ExplicitSizeSystem | "OTHER";
  label: string;
  options: readonly ParsedSizeFacet[];
}>;

const EXPLICIT_SYSTEM_PATTERN = /^(EU|US|UK)(?:\s*[-:/]\s*|\s+)(.+)$/i;
const SIZE_SYSTEM_ORDER: readonly (ExplicitSizeSystem | "OTHER")[] = ["EU", "US", "UK", "OTHER"];

/**
 * Parses only size systems that are explicitly present in supplier/catalogue data.
 * Bare values such as "42" or "9" remain unclassified: we deliberately do not
 * guess whether they are EU, US, UK, footwear, clothing, etc.
 */
export function parseExplicitSizeSystem(facet: SizeFacetValue): ParsedSizeFacet {
  const trimmed = facet.value.trim();
  const match = trimmed.match(EXPLICIT_SYSTEM_PATTERN);
  const explicitLabel = match?.[2]?.trim();

  if (!match || !explicitLabel) {
    return { value: facet.value, label: trimmed, system: null, count: facet.count };
  }

  return {
    value: facet.value,
    label: explicitLabel,
    system: match[1].toUpperCase() as ExplicitSizeSystem,
    count: facet.count
  };
}

/**
 * Returns grouped options only when the catalogue actually declares at least one
 * EU/US/UK system. This keeps legacy/unqualified catalogues unchanged while
 * preventing implicit cross-system conversion or merging.
 */
export function groupExplicitSizeFacets(facets: readonly SizeFacetValue[]): readonly SizeFacetGroup[] | null {
  const parsed = facets.map(parseExplicitSizeSystem);
  if (!parsed.some((facet) => facet.system !== null)) return null;

  const buckets = new Map<ExplicitSizeSystem | "OTHER", ParsedSizeFacet[]>();
  for (const facet of parsed) {
    const key = facet.system ?? "OTHER";
    const bucket = buckets.get(key) ?? [];
    bucket.push(facet);
    buckets.set(key, bucket);
  }

  return SIZE_SYSTEM_ORDER.flatMap((key) => {
    const options = buckets.get(key);
    if (!options?.length) return [];
    return [{ key, label: key === "OTHER" ? "Άλλα μεγέθη" : key, options }];
  });
}
