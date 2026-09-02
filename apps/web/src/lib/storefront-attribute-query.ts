export type StorefrontAttributeIntent = Readonly<{
  key: string;
  value: string;
  source: string;
  boolean?: boolean;
}>;

export type StorefrontAttributeQuery = Readonly<{
  text: string;
  intents: readonly StorefrontAttributeIntent[];
}>;

export type StorefrontAttributeFacetLike = Readonly<{
  key: string;
  options: readonly Readonly<{ value: string; label: string }>[];
}>;

type CapturedIntent = StorefrontAttributeIntent & Readonly<{ start: number; end: number }>;

const MEMORY_UNIT = "(?:gb|gbyte|gbytes|gigabyte|gigabytes|tb|terabyte|terabytes)";
const INCH_UNIT = '(?:inches|inch|ιντσες|ιντσα|intses|intsa|in|["″])';

/**
 * Extract only high-confidence, leaf-specific structured product constraints.
 * The parser deliberately does nothing without a known product leaf: a bare number
 * such as "18" or "55" must never become a hard catalogue filter by itself.
 *
 * Extracted spans are removed from the residual text so the normal text-search layer
 * does not require metadata tokens (18V, E27, 256GB...) to appear in titles. The
 * extracted value still becomes a hard filter only after it uniquely resolves against
 * a currently available governed facet option.
 */
export function extractStorefrontAttributeQuery(query: string, leafKey?: string): StorefrontAttributeQuery {
  const raw = query.slice(0, 120).trim();
  if (!raw || !leafKey) return { text: raw, intents: [] };
  const folded = fold(raw);
  const captured: CapturedIntent[] = [];

  const add = (key: string, regex: RegExp, format: (match: RegExpExecArray) => string, boolean?: boolean) => {
    const match = regex.exec(folded);
    if (!match || match.index === undefined) return;
    const start = match.index;
    const end = start + match[0].length;
    if (captured.some((entry) => start < entry.end && end > entry.start)) return;
    const value = format(match).trim();
    if (!value) return;
    captured.push({ key, value, source: raw.slice(start, end), boolean, start, end });
  };

  if (leafKey === "lighting") {
    add("socket", /\b(?:e(?:14|27|40)|gu(?:5[.]3|10)|g(?:4|9)|gx53|mr16)\b/i, (m) => m[0].toUpperCase());
    add("color_temperature", /\b(\d{3,5})\s*(?:k|kelvin)\b/i, (m) => `${Number(m[1])} K`);
    add("wattage", /\b(\d{1,4}(?:[.,]\d+)?)\s*(?:w|watt|watts|βατ)\b/i, (m) => `${decimal(m[1])} W`);
    add("dimmable", /\b(?:non[- ]?dimmable|not\s+dimmable|μη\s+dimmable)\b/i, () => "false", false);
    add("dimmable", /\b(?:dimmable|dimming|ρυθμιζομεν(?:ο|η|ος))\b/i, () => "true", true);
    add("led", /\bled\b/i, () => "LED");
  }

  if (leafKey === "drills") {
    add("voltage", /\b(\d{1,3}(?:[.,]\d+)?)\s*(?:v|volt|volts)\b/i, (m) => `${decimal(m[1])} V`);
    add("wattage", /\b(\d{2,4}(?:[.,]\d+)?)\s*(?:w|watt|watts|βατ)\b/i, (m) => `${decimal(m[1])} W`);
    add("rpm", /\b(\d{2,6})\s*(?:rpm|στροφ(?:ες|ων)|strofes)\b/i, (m) => `${Number(m[1])} rpm`);
    add("impact", /\b(?:impact|hammer|percussion|κρουστικ(?:ο|ος|η)|kroustiko)\b/i, () => "true", true);
  }

  if (leafKey === "smartphones" || leafKey === "laptops") {
    add("ram", new RegExp(`\\bram\\s*(\\d{1,3}(?:[.,]\\d+)?)\\s*(${MEMORY_UNIT})\\b`, "i"), (m) => memory(m[1], m[2]));
    add("ram", new RegExp(`\\b(\\d{1,3}(?:[.,]\\d+)?)\\s*(${MEMORY_UNIT})\\s*ram\\b`, "i"), (m) => memory(m[1], m[2]));
    add("storage", new RegExp(`\\b(?:storage|ssd|disk|drive|αποθηκευση|apothikefsi)\\s*(\\d{1,4}(?:[.,]\\d+)?)\\s*(${MEMORY_UNIT})\\b`, "i"), (m) => memory(m[1], m[2]));
    add("storage", new RegExp(`\\b(\\d{1,4}(?:[.,]\\d+)?)\\s*(${MEMORY_UNIT})\\s*(?:storage|ssd|disk|drive|αποθηκευση|apothikefsi)\\b`, "i"), (m) => memory(m[1], m[2]));
    if (leafKey === "smartphones" && !captured.some((entry) => entry.key === "storage")) {
      const candidates = [...folded.matchAll(new RegExp(`\\b(\\d{1,4}(?:[.,]\\d+)?)\\s*(${MEMORY_UNIT})\\b`, "gi"))]
        .filter((match) => match.index !== undefined && !captured.some((entry) => match.index! < entry.end && match.index! + match[0].length > entry.start));
      if (candidates.length === 1) {
        const match = candidates[0];
        const start = match.index!;
        captured.push({ key: "storage", value: memory(match[1], match[2]), source: raw.slice(start, start + match[0].length), start, end: start + match[0].length });
      }
    }
    add("screen_size", new RegExp(`\\b(\\d{1,2}(?:[.,]\\d+)?)\\s*${INCH_UNIT}`, "i"), (m) => `${decimal(m[1])} in`);
    if (leafKey === "smartphones") {
      add("5g", /\b5g\b/i, () => "5G");
      add("dual_sim", /\bdual\s*sim\b/i, () => "Dual SIM", true);
    }
  }

  if (leafKey === "televisions") {
    add("screen_size", new RegExp(`\\b(\\d{2,3}(?:[.,]\\d+)?)\\s*${INCH_UNIT}`, "i"), (m) => `${decimal(m[1])} in`);
    add("resolution", /\b(?:8k|4k|uhd|ultra\s+hd|full\s+hd|fhd|hd\s+ready)\b/i, (m) => normalizeDisplayTerm(m[0]));
    add("panel_technology", /\b(?:oled|qled|mini\s*led|micro\s*led)\b/i, (m) => normalizeDisplayTerm(m[0]));
    add("smart_tv", /\bsmart(?=\s*(?:tv|television|τηλεορασ|tileoras))/i, () => "Smart TV", true);
  }

  if (leafKey === "headphones") {
    add("anc", /\b(?:anc|active\s+noise\s+cancell?ing|noise\s+cancell?ing)\b/i, () => "ANC", true);
    add("connection", /\b(?:bluetooth|usb[- ]?c|wired|wireless)\b/i, (m) => titleTerm(m[0]));
  }

  if (leafKey === "printers") {
    add("print_technology", /\b(?:laser|inkjet|ink\s+jet|thermal)\b/i, (m) => titleTerm(m[0]));
    add("duplex", /\b(?:duplex|two[- ]?sided|double[- ]?sided|διπλης\s+οψης|diplis\s+opsis)\b/i, () => "true", true);
  }

  if (leafKey === "tyres") {
    const tyre = /\b(\d{3})\s*\/\s*(\d{2})\s*r\s*(\d{2})(?:\s+(\d{2,3})([a-z]))?\b/i.exec(folded);
    if (tyre?.index !== undefined) {
      const start = tyre.index;
      const sizeEnd = start + tyre[0].length;
      captured.push({ key: "tyre_size", value: `${tyre[1]}/${tyre[2]} R${tyre[3]}`, source: raw.slice(start, sizeEnd), start, end: sizeEnd });
      if (tyre[4]) captured.push({ key: "load_index", value: tyre[4], source: tyre[4], start: sizeEnd, end: sizeEnd });
      if (tyre[5]) captured.push({ key: "speed_rating", value: tyre[5].toUpperCase(), source: tyre[5], start: sizeEnd, end: sizeEnd });
    }
    add("season", /\b(?:all[- ]?season|all[- ]?weather|winter|summer|χειμεριν(?:ο|α)|θεριν(?:ο|α)|xeimerino|therino)\b/i, (m) => normalizeSeason(m[0]));
  }

  if (leafKey === "fragrance" || leafKey === "skincare" || leafKey === "haircare") {
    add("volume", /\b(\d{1,4}(?:[.,]\d+)?)\s*(?:ml|milliliter|milliliters|millilitre|millilitres)\b/i, (m) => `${decimal(m[1])} ml`);
  }

  const spans = captured.filter((entry) => entry.end > entry.start).sort((a, b) => a.start - b.start);
  let cursor = 0;
  const residual: string[] = [];
  for (const span of spans) {
    if (span.start < cursor) continue;
    residual.push(raw.slice(cursor, span.start));
    cursor = span.end;
  }
  residual.push(raw.slice(cursor));

  const intents = dedupeIntents(captured.map(({ start: _start, end: _end, ...intent }) => intent));
  return { text: residual.join(" ").replace(/\s+/g, " ").trim(), intents };
}

/**
 * Resolve natural-language intents only against the live facet values. A unique best
 * match is required; otherwise the intent remains advisory and no hard filter is set.
 */
export function resolveStorefrontAttributeIntents(
  intents: readonly StorefrontAttributeIntent[],
  facets: readonly StorefrontAttributeFacetLike[],
  explicitFilters: Readonly<Record<string, string>> = {}
): Readonly<Record<string, string>> {
  const resolved: Record<string, string> = {};
  for (const intent of intents) {
    if (explicitFilters[intent.key]) continue;
    const facet = facets.find((item) => item.key === intent.key);
    if (!facet?.options.length) continue;
    let best: string | undefined;
    let bestScore = 0;
    let tied = false;
    for (const option of facet.options) {
      const score = attributeOptionScore(intent, option.value, option.label);
      if (score > bestScore) {
        best = option.value;
        bestScore = score;
        tied = false;
      } else if (score > 0 && score === bestScore && option.value !== best) {
        tied = true;
      }
    }
    if (best && bestScore >= 70 && !tied) resolved[intent.key] = best;
  }
  return resolved;
}

function attributeOptionScore(intent: StorefrontAttributeIntent, value: string, label: string): number {
  const target = comparable(intent.value);
  const candidates = [value, label].map(comparable).filter(Boolean);
  if (!target || candidates.length === 0) return 0;
  if (candidates.includes(target)) return 100;
  const targetMeasure = measurement(intent.value);
  if (targetMeasure && [value, label].some((candidate) => measurement(candidate) === targetMeasure)) return 95;
  if (intent.boolean !== undefined) {
    const expected = intent.boolean;
    if ([value, label].some((candidate) => booleanMeaning(candidate, intent.key) === expected)) return 90;
  }
  if (target.length >= 3 && candidates.some((candidate) => containsWhole(candidate, target) || containsWhole(target, candidate))) return 75;
  return 0;
}

function measurement(value: string): string | undefined {
  const folded = fold(value).replace(/,/g, ".");
  const match = /(\d+(?:[.]\d+)?)\s*(gb|tb|w|watt|watts|v|volt|volts|k|kelvin|rpm|ml|inch|inches|in|ιντσα|ιντσες|intsa|intses|["″])/i.exec(folded);
  if (!match) return undefined;
  const unit = canonicalUnit(match[2]);
  return `${decimal(match[1])}${unit}`;
}

function canonicalUnit(value: string): string {
  const unit = fold(value);
  if (["w", "watt", "watts"].includes(unit)) return "w";
  if (["v", "volt", "volts"].includes(unit)) return "v";
  if (["k", "kelvin"].includes(unit)) return "k";
  if (["inch", "inches", "in", "ιντσα", "ιντσες", "intsa", "intses", '"', "″"].includes(unit)) return "in";
  return unit;
}

function booleanMeaning(value: string, key: string): boolean | undefined {
  const normalized = comparable(value);
  const truthy = new Set(["true", "yes", "nai", "ναι", "enabled", "supported", "διαθεσιμο", "available"]);
  const falsy = new Set(["false", "no", "oxi", "οχι", "disabled", "unsupported"]);
  if (truthy.has(normalized)) return true;
  if (falsy.has(normalized)) return false;
  if (normalized.startsWith("non") || normalized.startsWith("not")) return false;
  const keyTerms: Readonly<Record<string, readonly string[]>> = {
    dimmable: ["dimmable", "dimming"],
    impact: ["impact", "hammer", "percussion"],
    "5g": ["5g"],
    dual_sim: ["dualsim", "dualsimsupport"],
    smart_tv: ["smarttv", "smart"],
    anc: ["anc", "activenoisecancelling", "noisecancelling"],
    duplex: ["duplex", "twosided", "doublesided"]
  };
  if ((keyTerms[key] ?? []).some((term) => normalized.includes(term))) return true;
  return undefined;
}

function comparable(value: string): string {
  return fold(value)
    .replace(/,/g, ".")
    .replace(/\b(?:gigabytes?|gbytes?)\b/g, "gb")
    .replace(/\b(?:terabytes?)\b/g, "tb")
    .replace(/\b(?:watts?)\b/g, "w")
    .replace(/\b(?:volts?)\b/g, "v")
    .replace(/\bkelvin\b/g, "k")
    .replace(/(?:inch(?:es)?|ιντσ(?:α|ες)|ints(?:a|es)|["″])/g, "in")
    .replace(/[^\p{L}\p{N}.]+/gu, "")
    .trim();
}

function containsWhole(value: string, target: string): boolean {
  return value === target || value.startsWith(target) || value.endsWith(target);
}

function dedupeIntents(intents: readonly StorefrontAttributeIntent[]): readonly StorefrontAttributeIntent[] {
  const byKey = new Map<string, StorefrontAttributeIntent>();
  for (const intent of intents) if (!byKey.has(intent.key)) byKey.set(intent.key, intent);
  return [...byKey.values()];
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("el-GR");
}

function decimal(value: string): string {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? String(parsed) : value.replace(",", ".");
}

function memory(amount: string, unit: string): string {
  return `${decimal(amount)} ${fold(unit).startsWith("t") ? "TB" : "GB"}`;
}

function normalizeDisplayTerm(value: string): string {
  const normalized = fold(value).replace(/\s+/g, " ").trim();
  if (normalized === "uhd" || normalized === "ultra hd") return "4K UHD";
  if (normalized === "full hd" || normalized === "fhd") return "Full HD";
  if (normalized === "hd ready") return "HD Ready";
  if (normalized === "mini led") return "Mini LED";
  if (normalized === "micro led") return "Micro LED";
  return normalized.toUpperCase();
}

function titleTerm(value: string): string {
  return fold(value).replace(/\b\p{L}/gu, (char) => char.toUpperCase()).replace(/\s+/g, " ").trim();
}

function normalizeSeason(value: string): string {
  const normalized = comparable(value);
  if (normalized.includes("allseason") || normalized.includes("allweather")) return "All Season";
  if (normalized.includes("winter") || normalized.includes("χειμεριν") || normalized.includes("xeimerino")) return "Winter";
  if (normalized.includes("summer") || normalized.includes("θεριν") || normalized.includes("therino")) return "Summer";
  return value;
}