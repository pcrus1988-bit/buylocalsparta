export type CatalogSizeDomain = "footwear" | "belt" | "bottoms" | "apparel" | "generic";

export type CanonicalCatalogSize = Readonly<{
  key: string;
  label: string;
  raw: string;
}>;

export type CatalogSizeFacetRow = Readonly<{
  value: string;
  count: number;
}>;

export type CanonicalCatalogSizeFacet = Readonly<{
  value: string;
  label: string;
  count: number;
}>;

const SIZE_GROUP_PREFIX = "__km_size__:";
const ALPHA_SIZE = /^(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|XXXXL)$/i;
const CLEAR_EU_FOOTWEAR_MIN = 18;
const CLEAR_EU_FOOTWEAR_MAX = 55;

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function decimal(value: string): string {
  return value.replace(",", ".");
}

function normalizedCategory(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("el");
}

function domainForCategory(value: string): CatalogSizeDomain {
  const text = normalizedCategory(value);
  if (["belt", "ζων"].some((token) => text.includes(token))) return "belt";
  if (["sneaker", "trainer", "running", "shoe", "footwear", "boot", "loafer", "moccas", "sandal", "παπουτ", "μποτ", "σανδαλ"].some((token) => text.includes(token))) return "footwear";
  if (["jean", "trouser", "pants", "bottom", "denim", "παντελον"].some((token) => text.includes(token))) return "bottoms";
  if (["dress", "shirt", "t-shirt", "t shirt", "top", "jacket", "coat", "knit", "suit", "swim", "underwear", "clothing", "apparel", "φορεμ", "πουκαμισ", "μπλουζ", "μπουφαν", "παλτο", "πλεκ", "κοστουμ", "εσωρουχ", "μαγιο"].some((token) => text.includes(token))) return "apparel";
  return "generic";
}

export function inferCatalogSizeDomain(categoryValues: readonly string[]): CatalogSizeDomain | null {
  const domains = new Set(categoryValues.map(domainForCategory).filter((domain) => domain !== "generic"));
  if (domains.size !== 1) return null;
  return [...domains][0] ?? null;
}

function explicitSystem(raw: string): Readonly<{ system: "EU" | "US" | "UK"; value: string }> | null {
  const prefix = raw.match(/^\s*(EU|US|UK)(?:\s*[-:/]\s*|\s*)(\d{1,3}(?:[.,]\d+)?)\s*$/i);
  if (prefix) return { system: prefix[1].toUpperCase() as "EU" | "US" | "UK", value: decimal(prefix[2]) };
  const suffix = raw.match(/^\s*(\d{1,3}(?:[.,]\d+)?)\s*(EU|US|UK)\s*$/i);
  if (suffix) return { system: suffix[2].toUpperCase() as "EU" | "US" | "UK", value: decimal(suffix[1]) };
  return null;
}

export function canonicalizeCatalogSize(rawValue: string, domain: CatalogSizeDomain): CanonicalCatalogSize {
  const raw = clean(rawValue);
  if (!raw) return { key: "empty", label: raw, raw };

  const waistInseam = raw.match(/^\s*(?:W\s*)?(\d{2,3})\s*(?:L|\/|x)\s*(?:L\s*)?(\d{2,3})\s*$/i);
  if (waistInseam && (domain === "bottoms" || /\bW|\bL|\//i.test(raw))) {
    const waist = Number(waistInseam[1]);
    const inseam = Number(waistInseam[2]);
    return { key: `bottoms:w${waist}:l${inseam}`, label: `W${waist}/L${inseam}`, raw };
  }

  if (domain === "belt") {
    const centimetres = raw.match(/(\d{2,3}(?:[.,]\d+)?)\s*cm\b/i);
    if (centimetres) {
      const value = decimal(centimetres[1]);
      return { key: `belt:${value}cm`, label: `${value} cm`, raw };
    }
    const plain = raw.match(/^\s*(\d{2,3}(?:[.,]\d+)?)\s*$/);
    if (plain) {
      const value = decimal(plain[1]);
      return { key: `belt:${value}cm`, label: `${value} cm`, raw };
    }
  }

  const paired = raw.match(/^\s*(\d{2,3}(?:[.,]\d+)?)\s*\|\s*(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|XXXXL)\s*$/i)
    ?? raw.match(/^\s*(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|XXXXL)\s*\|\s*(\d{2,3}(?:[.,]\d+)?)\s*$/i);
  if (paired) {
    const firstIsAlpha = ALPHA_SIZE.test(paired[1]);
    const alpha = (firstIsAlpha ? paired[1] : paired[2]).toUpperCase();
    const numeric = decimal(firstIsAlpha ? paired[2] : paired[1]);
    return { key: `apparel:${alpha}:eu${numeric}`, label: `${alpha} · EU ${numeric}`, raw };
  }

  const explicit = explicitSystem(raw);
  if (explicit && (domain === "footwear" || domain === "apparel")) {
    const system = explicit.system.toLocaleLowerCase("en");
    return { key: `${domain}:${system}${explicit.value}`, label: `${explicit.system} ${explicit.value}`, raw };
  }

  // A bare footwear number is only treated as EU when it is in a clearly EU-like
  // range. Values such as 8, 9 or 10 stay raw because they could be US/UK sizes.
  if (domain === "footwear") {
    const bare = raw.match(/^\s*(\d{2}(?:[.,]\d+)?)\s*$/);
    if (bare) {
      const value = decimal(bare[1]);
      const numeric = Number(value);
      if (numeric >= CLEAR_EU_FOOTWEAR_MIN && numeric <= CLEAR_EU_FOOTWEAR_MAX) {
        return { key: `footwear:eu${value}`, label: `EU ${value}`, raw };
      }
    }
  }

  if (ALPHA_SIZE.test(raw) && domain === "apparel") {
    const alpha = raw.toUpperCase();
    return { key: `apparel:${alpha}`, label: alpha, raw };
  }

  return { key: `raw:${raw.toLocaleLowerCase("en")}`, label: raw, raw };
}

export function encodeCatalogSizeGroup(rawValues: readonly string[]): string {
  const values = [...new Set(rawValues.map(clean).filter(Boolean))];
  if (values.length <= 1) return values[0] ?? "";
  return `${SIZE_GROUP_PREFIX}${values.map((value) => encodeURIComponent(value)).join("|")}`;
}

export function decodeCatalogSizeGroup(value: string): readonly string[] {
  const cleaned = clean(value);
  if (!cleaned.startsWith(SIZE_GROUP_PREFIX)) return cleaned ? [cleaned] : [];
  return cleaned
    .slice(SIZE_GROUP_PREFIX.length)
    .split("|")
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return "";
      }
    })
    .map(clean)
    .filter(Boolean);
}

function sizeSortValue(label: string): number {
  const match = label.match(/(?:EU\s*|W|^)(\d{1,3}(?:\.\d+)?)/i);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

export function groupCatalogSizeFacets(rows: readonly CatalogSizeFacetRow[], domain: CatalogSizeDomain | null): readonly CanonicalCatalogSizeFacet[] {
  // A broad storefront can legitimately contain apparel, footwear and accessories
  // at the same time. In that case there is no single safe conversion domain, but
  // hiding the Size filter entirely is worse than preserving the supplier labels.
  // Use the generic domain so raw labels remain filterable until the customer narrows
  // the catalogue to one category family, where domain-specific normalization resumes.
  const effectiveDomain: CatalogSizeDomain = domain ?? "generic";
  const groups = new Map<string, { label: string; count: number; rawValues: string[] }>();
  for (const row of rows) {
    const count = Number(row.count);
    if (!row.value.trim() || !Number.isFinite(count) || count <= 0) continue;
    const canonical = canonicalizeCatalogSize(row.value, effectiveDomain);
    const current = groups.get(canonical.key) ?? { label: canonical.label, count: 0, rawValues: [] };
    current.count += count;
    if (!current.rawValues.includes(canonical.raw)) current.rawValues.push(canonical.raw);
    groups.set(canonical.key, current);
  }
  return [...groups.values()]
    .map((entry) => ({ value: encodeCatalogSizeGroup(entry.rawValues), label: entry.label, count: entry.count }))
    .sort((left, right) => {
      const numeric = sizeSortValue(left.label) - sizeSortValue(right.label);
      return Number.isFinite(numeric) && numeric !== 0 ? numeric : left.label.localeCompare(right.label, "el", { numeric: true });
    });
}
