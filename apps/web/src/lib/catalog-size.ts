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

type CatalogSizeSystem = "EU" | "US" | "UK" | "IT" | "FR" | "DE" | "ES";
type NumericSizeToken = Readonly<{
  key: string;
  label: string;
  numeric: number;
  integerPart: number;
}>;

const SIZE_GROUP_PREFIX = "__km_size__:";
const CLEAR_EU_FOOTWEAR_MIN = 18;
const CLEAR_EU_FOOTWEAR_MAX = 55;
const SIZE_SYSTEMS = ["EU", "US", "UK", "IT", "FR", "DE", "ES"] as const;
const ALPHA_ORDER = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL"] as const;
const ONE_SIZE_ALIASES = new Set([
  "ONESIZE",
  "ONESIZEFITSALL",
  "OS",
  "OSFA",
  "OSFM",
  "UNI",
  "UNISIZE",
  "UNIVERSAL",
  "TU"
]);

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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

function compactToken(value: string): string {
  return clean(value).toUpperCase().replace(/^SIZE\s*[:=-]?\s*/, "").replace(/[^A-Z0-9]/g, "");
}

function canonicalOneSize(value: string): boolean {
  return ONE_SIZE_ALIASES.has(compactToken(value));
}

function canonicalAlphaSize(value: string): string | null {
  const compact = compactToken(value);
  const aliases: Readonly<Record<string, string>> = {
    XXXS: "XXXS",
    XXXSMALL: "XXXS",
    XXS: "XXS",
    XXSMALL: "XXS",
    XS: "XS",
    XSMALL: "XS",
    EXTRASMALL: "XS",
    S: "S",
    SMALL: "S",
    M: "M",
    MEDIUM: "M",
    L: "L",
    LARGE: "L",
    XL: "XL",
    XLARGE: "XL",
    EXTRALARGE: "XL",
    XXL: "XXL",
    "2XL": "XXL",
    XXLARGE: "XXL",
    XXXL: "XXXL",
    "3XL": "XXXL",
    XXXLARGE: "XXXL",
    XXXXL: "XXXXL",
    "4XL": "XXXXL",
    XXXXLARGE: "XXXXL"
  };
  return aliases[compact] ?? null;
}

function mixedAlphaSize(raw: string): string | null {
  const values = raw
    .split(/[|,;/·()]+/)
    .map((part) => canonicalAlphaSize(part))
    .filter((value): value is string => Boolean(value));
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0] : null;
}

function fractionDetails(value: string): Readonly<{ numerator: number; denominator: number; glyph: string }> | null {
  const normalized = value.trim();
  if (normalized === "½" || normalized === "1/2") return { numerator: 1, denominator: 2, glyph: "½" };
  if (normalized === "⅓" || normalized === "1/3") return { numerator: 1, denominator: 3, glyph: "⅓" };
  if (normalized === "⅔" || normalized === "2/3") return { numerator: 2, denominator: 3, glyph: "⅔" };
  if (normalized === "¼" || normalized === "1/4") return { numerator: 1, denominator: 4, glyph: "¼" };
  if (normalized === "¾" || normalized === "3/4") return { numerator: 3, denominator: 4, glyph: "¾" };
  return null;
}

function numericSizeToken(value: string): NumericSizeToken | null {
  const normalized = clean(value).replace(",", ".");
  const fractional = normalized.match(/^(\d{1,3})(?:\s*[-+]?\s*)(½|⅓|⅔|¼|¾|1\/2|1\/3|2\/3|1\/4|3\/4)$/);
  if (fractional) {
    const integerPart = Number(fractional[1]);
    const fraction = fractionDetails(fractional[2]);
    if (!fraction) return null;
    return {
      key: `${integerPart}+${fraction.numerator}/${fraction.denominator}`,
      label: `${integerPart}${fraction.glyph}`,
      numeric: integerPart + fraction.numerator / fraction.denominator,
      integerPart
    };
  }

  if (!/^\d{1,3}(?:\.\d+)?$/.test(normalized)) return null;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return null;
  const label = String(numeric);
  return { key: label, label, numeric, integerPart: Math.trunc(numeric) };
}

function systemSize(system: CatalogSizeSystem, token: NumericSizeToken, domain: "footwear" | "apparel" | "bottoms"): CanonicalCatalogSize {
  return {
    key: `${domain}:${system.toLocaleLowerCase("en")}${token.key}`,
    label: `${system} ${token.label}`,
    raw: ""
  };
}

function explicitSystem(raw: string): Readonly<{ system: CatalogSizeSystem; token: NumericSizeToken }> | null {
  const systems = SIZE_SYSTEMS.join("|");
  const prefix = raw.match(new RegExp(`^\\s*(${systems})(?:\\s*[-:/]\\s*|\\s+)(.+?)\\s*$`, "i"));
  if (prefix) {
    const token = numericSizeToken(prefix[2]);
    if (token) return { system: prefix[1].toUpperCase() as CatalogSizeSystem, token };
  }
  const suffix = raw.match(new RegExp(`^\\s*(.+?)\\s*(${systems})\\s*$`, "i"));
  if (suffix) {
    const token = numericSizeToken(suffix[1]);
    if (token) return { system: suffix[2].toUpperCase() as CatalogSizeSystem, token };
  }
  return null;
}

function explicitSystemValues(raw: string): readonly Readonly<{ system: CatalogSizeSystem; token: NumericSizeToken }>[] {
  const systems = SIZE_SYSTEMS.join("|");
  const candidates: Array<Readonly<{ system: CatalogSizeSystem; token: NumericSizeToken }>> = [];
  const prefix = new RegExp(`(?:^|[|,;/·])\\s*(${systems})\\s*[-:]?\\s*(\\d{1,3}(?:[.,]\\d+)?(?:\\s*[-+]?\\s*(?:½|⅓|⅔|¼|¾|1\\/2|1\\/3|2\\/3|1\\/4|3\\/4))?)`, "gi");
  for (const match of raw.matchAll(prefix)) {
    const token = numericSizeToken(match[2]);
    if (token) candidates.push({ system: match[1].toUpperCase() as CatalogSizeSystem, token });
  }

  const suffix = new RegExp(`(?:^|[|,;/·])\\s*(\\d{1,3}(?:[.,]\\d+)?(?:\\s*[-+]?\\s*(?:½|⅓|⅔|¼|¾|1\\/2|1\\/3|2\\/3|1\\/4|3\\/4))?)\\s*(${systems})(?=$|[|,;/·])`, "gi");
  for (const match of raw.matchAll(suffix)) {
    const token = numericSizeToken(match[1]);
    if (token) candidates.push({ system: match[2].toUpperCase() as CatalogSizeSystem, token });
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.system}:${candidate.token.key}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function waistInseamSize(raw: string): Readonly<{ waist: number; inseam: number }> | null {
  const match = raw.match(/^\s*(?:W\s*)?(\d{2,3})\s*(?:\/|x|×|L\s*)\s*(?:L\s*)?(\d{2,3})\s*$/i)
    ?? raw.match(/^\s*W\s*(\d{2,3})\s+L\s*(\d{2,3})\s*$/i);
  if (!match) return null;
  return { waist: Number(match[1]), inseam: Number(match[2]) };
}

export function canonicalizeCatalogSize(rawValue: string, domain: CatalogSizeDomain): CanonicalCatalogSize {
  const raw = clean(rawValue);
  if (!raw) return { key: "empty", label: raw, raw };

  if (canonicalOneSize(raw)) return { key: "one-size", label: "One Size", raw };

  const waistInseam = waistInseamSize(raw);
  if (waistInseam && (domain === "bottoms" || /\bW|\bL|\/|x|×/i.test(raw))) {
    return {
      key: `bottoms:w${waistInseam.waist}:l${waistInseam.inseam}`,
      label: `W${waistInseam.waist}/L${waistInseam.inseam}`,
      raw
    };
  }

  if (domain === "belt") {
    const centimetres = raw.match(/^(\d{2,3}(?:[.,]\d+)?)\s*cm$/i);
    const token = numericSizeToken(centimetres?.[1] ?? raw);
    if (token && token.integerPart >= 40 && token.integerPart <= 200) {
      return { key: `belt:${token.key}cm`, label: `${token.label} cm`, raw };
    }
  }

  if (domain === "apparel" || domain === "bottoms") {
    const alpha = mixedAlphaSize(raw) ?? canonicalAlphaSize(raw);
    if (alpha) return { key: `apparel:${alpha}`, label: alpha, raw };
  }

  if (domain === "generic") {
    const alpha = canonicalAlphaSize(raw);
    if (alpha) return { key: `alpha:${alpha}`, label: alpha, raw };
  }

  if (domain === "footwear") {
    const explicitValues = explicitSystemValues(raw);
    const explicitEu = explicitValues.find((entry) => entry.system === "EU");
    if (explicitEu) {
      return {
        key: `footwear:eu${explicitEu.token.key}`,
        label: `EU ${explicitEu.token.label}`,
        raw
      };
    }

    const explicit = explicitValues.length === 1 ? explicitValues[0] : explicitSystem(raw);
    if (explicit) {
      return {
        key: `footwear:${explicit.system.toLocaleLowerCase("en")}${explicit.token.key}`,
        label: `${explicit.system} ${explicit.token.label}`,
        raw
      };
    }

    const bare = numericSizeToken(raw);
    if (bare && bare.numeric >= CLEAR_EU_FOOTWEAR_MIN && bare.numeric <= CLEAR_EU_FOOTWEAR_MAX) {
      return { key: `footwear:eu${bare.key}`, label: `EU ${bare.label}`, raw };
    }
  }

  if (domain === "apparel" || domain === "bottoms") {
    const explicit = explicitSystem(raw);
    if (explicit) {
      const scopedDomain = domain === "bottoms" ? "bottoms" : "apparel";
      const canonical = systemSize(explicit.system, explicit.token, scopedDomain);
      return { ...canonical, raw };
    }
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

function numericSortValue(label: string): number | null {
  const withoutPrefix = label
    .replace(/^(?:EU|US|UK|IT|FR|DE|ES)\s+/i, "")
    .replace(/\s*cm$/i, "");
  return numericSizeToken(withoutPrefix)?.numeric ?? null;
}

function alphaSortValue(label: string): number | null {
  const alpha = canonicalAlphaSize(label);
  if (!alpha) return null;
  const index = ALPHA_ORDER.indexOf(alpha as typeof ALPHA_ORDER[number]);
  return index >= 0 ? index : null;
}

function sizeSortTuple(key: string, label: string): readonly [number, number, number, string] {
  if (key === "one-size") return [9, 0, 0, label];

  const waistInseam = key.match(/^bottoms:w(\d+):l(\d+)$/);
  if (waistInseam) return [1, Number(waistInseam[1]), Number(waistInseam[2]), label];

  const numeric = numericSortValue(label);
  if (numeric !== null) return [2, numeric, 0, label];

  const alpha = alphaSortValue(label);
  if (alpha !== null) return [3, alpha, 0, label];

  const leadingNumber = label.match(/^(\d+(?:[.,]\d+)?)/);
  if (leadingNumber) return [4, Number(leadingNumber[1].replace(",", ".")), 0, label];

  return [5, 0, 0, label];
}

export function groupCatalogSizeFacets(rows: readonly CatalogSizeFacetRow[], domain: CatalogSizeDomain | null): readonly CanonicalCatalogSizeFacet[] {
  // A broad storefront can legitimately contain apparel, footwear and accessories
  // at the same time. In that case there is no single safe conversion domain, but
  // hiding the Size filter entirely is worse than preserving supplier meaning.
  const effectiveDomain: CatalogSizeDomain = domain ?? "generic";
  const groups = new Map<string, { key: string; label: string; count: number; rawValues: string[] }>();

  for (const row of rows) {
    const count = Number(row.count);
    if (!row.value.trim() || !Number.isFinite(count) || count <= 0) continue;
    const canonical = canonicalizeCatalogSize(row.value, effectiveDomain);
    const current = groups.get(canonical.key) ?? {
      key: canonical.key,
      label: canonical.label,
      count: 0,
      rawValues: []
    };
    current.count += count;
    if (!current.rawValues.includes(canonical.raw)) current.rawValues.push(canonical.raw);
    groups.set(canonical.key, current);
  }

  return [...groups.values()]
    .sort((left, right) => {
      const a = sizeSortTuple(left.key, left.label);
      const b = sizeSortTuple(right.key, right.label);
      return a[0] - b[0]
        || a[1] - b[1]
        || a[2] - b[2]
        || a[3].localeCompare(b[3], "el", { numeric: true });
    })
    .map((entry) => ({
      value: encodeCatalogSizeGroup(entry.rawValues),
      label: entry.label,
      count: entry.count
    }));
}
