import { normalizeSearchText } from "./engine.ts";

export type SearchIntent = Readonly<{
  raw: string;
  text: string;
  normalizedText: string;
  identifier?: string;
  availability?: "in_stock" | "pickup_today";
  minPriceMinor?: number;
  maxPriceMinor?: number;
  applied: readonly string[];
}>;

const COMMON_SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["kinito", "tilefono", "smartphone", "mobile"],
  ["akoustika", "headphones", "earphones", "earbuds"],
  ["fortistis", "charger", "charging"],
  ["kalodio", "cable"],
  ["thiki", "case", "cover"],
  ["papoutsia", "athlitika", "sneakers", "trainers", "shoes"],
  ["sakidio", "backpack", "rucksack"],
  ["tsanta", "bag"],
  ["drapano", "drill"],
  ["katsavidi", "screwdriver"],
  ["fotistiko", "lamp", "light"],
  ["tileorasi", "tv", "television"],
  ["ypologistis", "computer", "pc"],
  ["foritos", "laptop", "notebook"],
  ["ektipotis", "printer"],
  ["pontiki", "mouse"],
  ["pliktrologio", "keyboard"],
  ["psigeio", "fridge", "refrigerator"],
  ["plyntirio", "washing", "washer"],
  ["skoupa", "vacuum"],
  ["ergaleio", "tool"],
  ["mpataria", "battery"],
  ["fakos", "torch", "flashlight"]
];

const SYNONYMS = new Map<string, readonly string[]>();
for (const group of COMMON_SYNONYM_GROUPS) {
  const normalized = [...new Set(group.map(normalizeSearchText).filter(Boolean))];
  for (const token of normalized) SYNONYMS.set(token, normalized);
}

const MAX_PRICE_PATTERNS = [
  /(?:μεχρι|εως|έως|κατω\s+απο|under|up\s+to|max|mexri|eos|kato\s+apo)\s*€?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:€|ευρω|eur|euro)?/iu,
  /(?:<=)\s*€?\s*(\d+(?:[.,]\d{1,2})?)/iu
] as const;
const MIN_PRICE_PATTERNS = [
  /(?:πανω\s+απο|απο|over|at\s+least|min|pano\s+apo|apo)\s*€?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:€|ευρω|eur|euro)?/iu,
  /(?:>=)\s*€?\s*(\d+(?:[.,]\d{1,2})?)/iu
] as const;
const PICKUP_TODAY_PATTERNS = [
  /(?:παραλαβη\s+σημερα|παραλαβή\s+σήμερα|pickup\s+today|paralavi\s+simera)/iu
] as const;
const IN_STOCK_PATTERNS = [
  /(?:διαθεσιμο\s+τωρα|διαθέσιμο\s+τώρα|σε\s+αποθεμα|σε\s+απόθεμα|in\s+stock|available\s+now|diathesimo\s+tora)/iu
] as const;

export function interpretSearchQuery(input: string): SearchIntent {
  const raw = input.slice(0, 120).trim();
  let text = foldForIntent(raw);
  const applied: string[] = [];
  let minPriceMinor: number | undefined;
  let maxPriceMinor: number | undefined;
  let availability: SearchIntent["availability"];

  const maxMatch = firstMatch(text, MAX_PRICE_PATTERNS);
  if (maxMatch) {
    maxPriceMinor = eurosToMinor(maxMatch.capture);
    text = removeRange(text, maxMatch.index, maxMatch.length);
    applied.push("max_price");
  }
  const minMatch = firstMatch(text, MIN_PRICE_PATTERNS);
  if (minMatch) {
    minPriceMinor = eurosToMinor(minMatch.capture);
    text = removeRange(text, minMatch.index, minMatch.length);
    applied.push("min_price");
  }
  const pickup = firstPattern(text, PICKUP_TODAY_PATTERNS);
  if (pickup) {
    availability = "pickup_today";
    text = removeRange(text, pickup.index, pickup.length);
    applied.push("pickup_today");
  } else {
    const stock = firstPattern(text, IN_STOCK_PATTERNS);
    if (stock) {
      availability = "in_stock";
      text = removeRange(text, stock.index, stock.length);
      applied.push("in_stock");
    }
  }

  text = text.replace(/[€]/g, " ").replace(/\s+/g, " ").trim();
  const normalizedText = normalizeSearchText(text);
  const identifier = detectIdentifier(raw);
  if (identifier) applied.push("identifier");

  return {
    raw,
    text,
    normalizedText,
    identifier,
    availability,
    minPriceMinor,
    maxPriceMinor,
    applied: [...new Set(applied)]
  };
}

/**
 * Greeklish is not a reversible transliteration. Users commonly mix x/ch for χ,
 * 8/th for θ and phonetic spellings such as ai/e, y/i, mp/b or nt/d. Keep the
 * original normalized form so English/model searches remain exact, then add a
 * small phonetic equivalence key rather than destructively rewriting the query.
 */
export function searchTextVariants(input: string): readonly string[] {
  const normalized = normalizeSearchText(input);
  if (!normalized) return [];
  const variants = new Set<string>([normalized]);
  const phonetic = greeklishPhoneticKey(normalized);
  if (phonetic) variants.add(phonetic);

  // Explicit keyboard-style Greeklish forms. These are alternatives only: the
  // original remains first, so names such as Xiaomi/Xbox never lose their spelling.
  const expanded = normalized
    .replace(/8/g, "th")
    .replace(/x/g, "ch");
  if (expanded !== normalized) {
    variants.add(expanded);
    variants.add(greeklishPhoneticKey(expanded));
  }
  return [...variants].filter(Boolean).slice(0, 6);
}

export function buildSearchAliases(values: readonly (string | undefined)[]): readonly string[] {
  const aliases = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    for (const normalized of searchTextVariants(value)) {
      if (!normalized) continue;
      aliases.add(normalized);
      for (const token of normalized.split(" ")) {
        for (const synonym of SYNONYMS.get(token) ?? []) aliases.add(synonym);
      }
    }
  }
  return [...aliases].slice(0, 120);
}

export function searchTextRelevance(query: string, fields: readonly (string | undefined)[]): number {
  const intent = interpretSearchQuery(query);
  const normalizedQueries = searchTextVariants(intent.text);
  if (!normalizedQueries.length) return 1;
  const aliases = buildSearchAliases(fields);
  const joined = aliases.join(" ");
  if (!joined) return 0;

  if (intent.identifier) {
    const normalizedIdentifier = normalizeSearchText(intent.identifier);
    if (aliases.some((value) => value === normalizedIdentifier || value.split(" ").includes(normalizedIdentifier))) return 200;
  }
  if (normalizedQueries.some((queryVariant) => aliases.some((value) => value === queryVariant))) return 120;
  if (normalizedQueries.some((queryVariant) => aliases.some((value) => value.includes(queryVariant)))) return 90;

  const documentTokens = [...new Set(joined.split(" ").filter(Boolean))];
  let bestVariantScore = 0;
  for (const normalizedQuery of normalizedQueries) {
    const queryTokens = normalizedQuery.split(" ").filter(Boolean);
    let total = 0;
    let complete = true;
    for (const queryToken of queryTokens) {
      const alternatives = SYNONYMS.get(queryToken) ?? [queryToken];
      let best = 0;
      for (const alternative of alternatives) {
        for (const documentToken of documentTokens) best = Math.max(best, fuzzySimilarity(alternative, documentToken));
      }
      if (best < 0.72) {
        complete = false;
        break;
      }
      total += best;
    }
    if (complete) bestVariantScore = Math.max(bestVariantScore, total);
  }
  return bestVariantScore > 0 ? Math.round(bestVariantScore * 50) : 0;
}

export function expandedSearchTokens(input: string): readonly string[] {
  const intent = interpretSearchQuery(input);
  const result = new Set<string>();
  for (const normalized of searchTextVariants(intent.text)) {
    for (const token of normalized.split(" ").filter(Boolean)) {
      for (const alternative of SYNONYMS.get(token) ?? [token]) result.add(alternative);
    }
  }
  return [...result];
}

function greeklishPhoneticKey(normalized: string): string {
  return normalized
    .split(" ")
    .map((token) => token
      .replace(/ch/g, "x")
      .replace(/th/g, "8")
      .replace(/ai/g, "e")
      .replace(/ei|oi/g, "i")
      .replace(/ou/g, "u")
      .replace(/mp/g, "b")
      .replace(/nt/g, "d")
      .replace(/gk/g, "g")
      .replace(/ks/g, "x")
      .replace(/y/g, "i")
      .replace(/w/g, "o"))
    .join(" ");
}

function foldForIntent(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("el-GR");
}

function detectIdentifier(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  // GTIN/EAN users often paste grouped digits. Compact only when the input is
  // entirely numeric separators so natural-language queries can never collapse
  // into a fake identifier.
  if (/^[\d\s-]+$/.test(trimmed)) {
    const compactDigits = trimmed.replace(/[\s-]/g, "");
    if (/^\d{8,14}$/.test(compactDigits)) return compactDigits;
  }

  // Model/SKU identifiers must be a single explicit token. Never remove spaces
  // from mixed natural language such as "Bosch drill 18V" or
  // "55 inch 4K smart TV" and then reinterpret the whole query as a code.
  if (/\s/.test(trimmed)) return undefined;
  if (/^(?=.*[a-z])(?=.*\d)[a-z0-9._/-]{4,32}$/i.test(trimmed)) return trimmed;
  return undefined;
}

function firstMatch(value: string, patterns: readonly RegExp[]): { index: number; length: number; capture: string } | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (match?.[1] !== undefined && match.index !== undefined) return { index: match.index, length: match[0].length, capture: match[1] };
  }
  return undefined;
}

function firstPattern(value: string, patterns: readonly RegExp[]): { index: number; length: number } | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (match && match.index !== undefined) return { index: match.index, length: match[0].length };
  }
  return undefined;
}

function removeRange(value: string, index: number, length: number): string {
  return `${value.slice(0, index)} ${value.slice(index + length)}`;
}

function eurosToMinor(value: string): number | undefined {
  const amount = Number(value.replace(",", "."));
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return undefined;
  return Math.round(amount * 100);
}

function fuzzySimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (Math.min(left.length, right.length) < 3) return 0;
  if (right.startsWith(left) || left.startsWith(right)) return 0.9;
  const maxLength = Math.max(left.length, right.length);
  if (maxLength < 4) return 0;
  const distance = levenshtein(left, right);
  return 1 - distance / maxLength;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = old;
    }
  }
  return previous[b.length];
}