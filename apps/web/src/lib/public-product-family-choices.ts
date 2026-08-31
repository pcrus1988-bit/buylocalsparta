import { resolveCatalogColor, type ResolvedCatalogColor, type SqlRow } from "@buy-local-sparta/core";
import { cache } from "react";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import {
  productVariantPresentation,
  type PublicProductVariantAttribute,
  type PublicProductVariantColor,
  type PublicProductVariantKind,
  type PublicProductVariantOption,
  type PublicProductVariantPresentation
} from "./public-product-variants";

export type PublicProductAlternativeAttribute = Readonly<{
  key: string;
  label: string;
  value: string;
}>;

export type PublicProductAlternativeOption = Readonly<{
  canonicalVariantId: string;
  slug: string;
  attributes: readonly PublicProductAlternativeAttribute[];
  available: boolean;
  imageSrc?: string;
  imageAlt?: string;
}>;

export type PublicProductAlternativePresentation = Readonly<{
  options: readonly PublicProductAlternativeOption[];
  title: string;
}>;

export type PublicCrossFamilyChoices = Readonly<{
  currentVariantAttributes: readonly PublicProductVariantAttribute[];
  variantExtensions: readonly PublicProductVariantOption[];
  alternatives: PublicProductAlternativePresentation;
}>;

type ChoiceScope = Readonly<
  | { mode: "live" }
  | { mode: "demo"; vendorId: string }
>;

type ProductContextRow = SqlRow & {
  canonical_uuid: string;
  canonical_public_id: string;
  slug: string;
  family_id: string | null;
  market_id: string;
  category_id: string;
  brand_id: string | null;
  brand_name: string | null;
  product_type_id: string | null;
  source_id: string | null;
  source_product_id: string | null;
  source_title: string | null;
  source_model: string | null;
  source_family_key: string | null;
  normalized_payload: unknown;
  raw_payload: unknown;
  variant_attributes: unknown;
};

type SemanticAttributeRow = SqlRow & {
  attribute_id: string;
  attribute_code: string;
  data_type: string;
  unit: string | null;
  group_code: string | null;
  label_el: string;
  value_level: "family" | "variant";
  variant_defining: boolean;
  comparable: boolean;
  variant_axis_order: number | null;
  sort_order: number;
};

type CandidateRow = SqlRow & {
  canonical_uuid: string;
  canonical_public_id: string;
  family_id: string | null;
  slug: string;
  variant_attributes: unknown;
  source_product_id: string;
  source_title: string;
  source_model: string | null;
  source_family_key: string | null;
  normalized_payload: unknown;
  raw_payload: unknown;
  available: boolean;
  from_price_minor: string | number | null;
  media_public_id: string | null;
  media_alt_text: string | null;
  source_image_candidate: string | null;
  source_website: string | null;
};

type CanonicalVariantEvidenceRow = SqlRow & {
  canonical_variant_id: string;
  attribute_id: string;
  value_label: string | null;
  value_code: string | null;
  text_value: string | null;
  number_value: string | number | null;
  boolean_value: boolean | null;
  dimension_value: unknown;
};

type CanonicalFamilyEvidenceRow = SqlRow & {
  family_id: string;
  attribute_id: string;
  value_label: string | null;
  value_code: string | null;
  text_value: string | null;
  number_value: string | number | null;
  boolean_value: boolean | null;
  dimension_value: unknown;
};

type SourceEvidenceRow = SqlRow & {
  source_product_id: string;
  attribute_id: string;
  value_label: string | null;
  value_code: string | null;
  normalized_value: unknown;
  raw_value: unknown;
  source_unit: string | null;
};

type AliasRow = SqlRow & {
  attribute_id: string;
  display_value: string;
  alias: string;
};

type CompatibilityRow = SqlRow & {
  canonical_variant_id: string | null;
  family_id: string | null;
};

type SemanticAttribute = Readonly<{
  id: string;
  code: string;
  dataType: string;
  unit?: string;
  groupCode?: string;
  label: string;
  valueLevel: "family" | "variant";
  variantDefining: boolean;
  comparable: boolean;
  kind: PublicProductVariantKind;
  order: number;
}>;

type ResolvedValue = Readonly<{
  value: string;
  comparableValue: string;
  matchedText?: string;
}>;

type Candidate = Readonly<{
  row: CandidateRow;
  values: ReadonlyMap<string, ResolvedValue>;
  identity: string;
}>;

type SeriesRelation = Readonly<{
  candidate: Candidate;
  promotedFamilyIds: ReadonlySet<string>;
}>;

type UnitConversion = Readonly<{ source: string; factor: number }>;

const COMPATIBILITY_ATTRIBUTE_PATTERN = /(?:^|_)(?:compatib|compatible|compatibility|suitable_for|supported_models?|works_with|fitment|platform_compatible)(?:_|$)/u;
const CODELIKE_PAREN = /\((?=[^)]{1,18}\))(?=[^)]*\d)[\p{L}\p{N} ._+/-]{1,18}\)/giu;
const MIXED_SCRIPT_LOOKALIKE = new Map<string,string>([
  ["Α","A"],["Β","B"],["Ε","E"],["Ζ","Z"],["Η","H"],["Ι","I"],["Κ","K"],["Μ","M"],["Ν","N"],["Ο","O"],["Ρ","P"],["Τ","T"],["Υ","Y"],["Χ","X"],
  ["α","a"],["β","b"],["ε","e"],["ζ","z"],["η","h"],["ι","i"],["κ","k"],["μ","m"],["ν","n"],["ο","o"],["ρ","p"],["τ","t"],["υ","y"],["χ","x"],
  ["А","A"],["В","B"],["Е","E"],["К","K"],["М","M"],["Н","H"],["О","O"],["Р","P"],["С","C"],["Т","T"],["Х","X"],["У","Y"],
  ["а","a"],["в","b"],["е","e"],["к","k"],["м","m"],["н","h"],["о","o"],["р","p"],["с","c"],["т","t"],["х","x"],["у","y"]
]);

function emptyChoices(): PublicCrossFamilyChoices {
  return { currentVariantAttributes: [], variantExtensions: [], alternatives: { options: [], title: "Άλλες επιλογές" } };
}

function normalizeMixedScriptCatalogText(value:string):string {
  return value.replace(/[A-Za-zΑ-Ωα-ωА-Яа-я0-9]+/gu,(token)=>{
    if (!/[A-Za-z]/u.test(token) || !/[Α-Ωα-ωА-Яа-я]/u.test(token)) return token;
    return [...token].map((char)=>MIXED_SCRIPT_LOOKALIKE.get(char) ?? char).join("");
  });
}

function normalizedKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el")
    .replace(/(^|_)colour(?=_|$)/g, "$1color")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizedText(value: string): string {
  return normalizeMixedScriptCatalogText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedComparable(value: string): string {
  return normalizeMixedScriptCatalogText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el")
    .replace(/[^\p{L}\p{N}.,+/%-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedModel(value: string): string {
  return normalizeMixedScriptCatalogText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function objectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function scalarValue(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    const result = String(value).trim();
    return result || undefined;
  }
  if (typeof value === "boolean") return value ? "Ναι" : "Όχι";
  if (Array.isArray(value)) {
    const values = value.map(scalarValue).filter((entry): entry is string => Boolean(entry));
    return values.length ? [...new Set(values)].join(" · ") : undefined;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["label", "text", "value", "amount", "number", "normalizedValue"]) {
      const result = scalarValue(record[key]);
      if (result) return result;
    }
  }
  return undefined;
}

function numericValue(value: string): number | undefined {
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(4)));
}

function camelCaseKey(code: string): string {
  return code.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

function semanticKind(code: string, label: string, groupCode?: string): PublicProductVariantKind {
  const semantic = normalizedKey(`${code}_${label}_${groupCode ?? ""}`);
  if (semantic.includes("temperature")) return "other";
  if (semantic.includes("color") || semantic.includes("shade")) return "color";
  if (semantic.includes("diameter") || semantic.includes("διαμετρ")) return "diameter";
  if (semantic.includes("width") || semantic.includes("πλατ")) return "width";
  if (semantic.includes("height") || semantic.includes("drop") || semantic.includes("υψ")) return "height";
  if (semantic.includes("length") || semantic.includes("μηκ")) return "length";
  if (semantic.includes("size") || semantic.includes("μεγεθ")) return "size";
  if (semantic.includes("capacity") || semantic.includes("volume") || semantic.includes("χωρητικ") || semantic.includes("ογκο")) return "capacity";
  if (semantic.includes("material") || semantic.includes("composition") || semantic.includes("υλικο") || semantic.includes("συνθεση")) return "material";
  if (semantic.includes("voltage") || semantic.includes("ταση")) return "voltage";
  if (semantic.includes("quantity") || semantic.includes("count") || semantic.includes("ποσοτ")) return "quantity";
  if (semantic.includes("style") || semantic.includes("pattern") || semantic.includes("finish") || semantic.includes("ruling") || semantic.includes("σχεδ")) return "style";
  return "other";
}

function presentedLabel(attribute: SemanticAttribute): string {
  const code = normalizedKey(attribute.code);
  if (attribute.kind === "color" && ["manufacturer_color", "color"].includes(code)) return "Χρώμα";
  return attribute.label;
}

function localizedUnit(unit: string): string {
  const normalized = unit.trim().toLocaleLowerCase("en");
  if (["items", "item", "pcs", "pieces"].includes(normalized)) return "τεμ.";
  if (["sheets", "sheet"].includes(normalized)) return "φύλλα";
  return unit.trim();
}

function withUnit(value: string, unit?: string): string {
  const trimmed = value.trim();
  if (!trimmed || !unit) return trimmed;
  const displayUnit = localizedUnit(unit);
  const escaped = displayUnit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`(?:^|\\s)${escaped}$`, "i").test(trimmed)) return trimmed;
  return `${trimmed} ${displayUnit}`;
}

function normalizeUnit(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const unit = value.trim().toLocaleLowerCase("en").replace(/\s+/g, "");
  if (["l", "lt", "ltr", "litre", "liter"].includes(unit)) return "l";
  if (["ml", "millilitre", "milliliter"].includes(unit)) return "ml";
  if (["w", "watt", "watts"].includes(unit)) return "w";
  if (["kw", "kilowatt", "kilowatts"].includes(unit)) return "kw";
  if (["v", "volt", "volts"].includes(unit)) return "v";
  if (unit === "mv") return "mv";
  if (["gb", "gbyte", "gbytes"].includes(unit)) return "gb";
  if (["tb", "tbyte", "tbytes"].includes(unit)) return "tb";
  if (["mb", "mbyte", "mbytes"].includes(unit)) return "mb";
  if (unit === "mm") return "mm";
  if (unit === "cm") return "cm";
  if (["m", "metre", "meter"].includes(unit)) return "m";
  if (["g", "gram", "grams"].includes(unit)) return "g";
  if (["kg", "kilogram", "kilograms"].includes(unit)) return "kg";
  if (["in", "inch", "inches", "\"", "″"].includes(unit)) return "in";
  if (unit === "mah") return "mah";
  if (unit === "k") return "k";
  if (["%", "percent"].includes(unit)) return "%";
  return unit || undefined;
}

function unitConversions(targetUnit: string | null | undefined): readonly UnitConversion[] {
  const target = normalizeUnit(targetUnit);
  if (!target) return [];
  const conversions: Record<string, readonly UnitConversion[]> = {
    ml: [{ source: "ml", factor: 1 }, { source: "l", factor: 1000 }],
    l: [{ source: "l", factor: 1 }, { source: "ml", factor: 0.001 }],
    w: [{ source: "w", factor: 1 }, { source: "kw", factor: 1000 }],
    v: [{ source: "v", factor: 1 }, { source: "mv", factor: 0.001 }],
    gb: [{ source: "gb", factor: 1 }, { source: "tb", factor: 1024 }, { source: "mb", factor: 1 / 1024 }],
    mm: [{ source: "mm", factor: 1 }, { source: "cm", factor: 10 }, { source: "m", factor: 1000 }],
    cm: [{ source: "cm", factor: 1 }, { source: "mm", factor: 0.1 }, { source: "m", factor: 100 }],
    m: [{ source: "m", factor: 1 }, { source: "cm", factor: 0.01 }, { source: "mm", factor: 0.001 }],
    g: [{ source: "g", factor: 1 }, { source: "kg", factor: 1000 }],
    kg: [{ source: "kg", factor: 1 }, { source: "g", factor: 0.001 }],
    in: [{ source: "in", factor: 1 }],
    mah: [{ source: "mah", factor: 1 }],
    k: [{ source: "k", factor: 1 }],
    "%": [{ source: "%", factor: 1 }]
  };
  return conversions[target] ?? [{ source: target, factor: 1 }];
}

function unitAliases(unit: string): readonly string[] {
  const aliases: Record<string, readonly string[]> = {
    l: ["l", "lt", "ltr"], ml: ["ml"], w: ["w", "watt"], kw: ["kw"], v: ["v", "volt"], mv: ["mv"],
    gb: ["gb"], tb: ["tb"], mb: ["mb"], mm: ["mm"], cm: ["cm"], m: ["m"], g: ["g"], kg: ["kg"],
    in: ["in", "inch", "inches", "\"", "″"], mah: ["mah"], k: ["k"], "%": ["%"]
  };
  return aliases[unit] ?? [unit];
}

function measuredNumber(value: string, targetUnit: string | undefined, sourceUnitHint?: string | null): string | undefined {
  const match = value.trim().match(/^([+-]?[0-9]+(?:[.,][0-9]+)?)\s*([^0-9\s].*)?$/u);
  if (!match?.[1]) return undefined;
  const number = numericValue(match[1]);
  if (number === undefined) return undefined;
  const embeddedUnit = normalizeUnit(match[2]?.trim());
  const sourceUnit = normalizeUnit(sourceUnitHint) ?? embeddedUnit ?? normalizeUnit(targetUnit);
  const conversion = unitConversions(targetUnit).find((candidate) => candidate.source === sourceUnit);
  return formatNumber(conversion ? number * conversion.factor : number);
}

function sourceKeyUnit(key: string): string | undefined {
  const normalized = normalizedKey(key);
  return normalizeUnit(normalized.split("_").at(-1));
}

function payloadKeys(attribute: SemanticAttribute, sameKindCount: number): readonly string[] {
  const code = normalizedKey(attribute.code);
  const tokens = code.split("_");
  const targetUnit = normalizeUnit(attribute.unit);
  const baseTokens = targetUnit && normalizeUnit(tokens.at(-1)) === targetUnit ? tokens.slice(0, -1) : tokens;
  const keys = new Set<string>([code, camelCaseKey(code)]);
  if (baseTokens.length) {
    const base = baseTokens.join("_");
    keys.add(base);
    keys.add(camelCaseKey(base));
    if (baseTokens.length >= 2) {
      const compact = [baseTokens[0], baseTokens.at(-1)!].join("_");
      keys.add(compact);
      keys.add(camelCaseKey(compact));
    }
  }
  for (const conversion of unitConversions(attribute.unit)) {
    const base = baseTokens.join("_");
    if (base) {
      keys.add(`${base}_${conversion.source}`);
      keys.add(camelCaseKey(`${base}_${conversion.source}`));
    }
    if (baseTokens.length >= 2) {
      const first = baseTokens[0];
      const last = baseTokens.at(-1)!;
      keys.add(`${first}_${conversion.source}`);
      keys.add(camelCaseKey(`${first}_${conversion.source}`));
      keys.add(`${last}_${conversion.source}`);
      keys.add(camelCaseKey(`${last}_${conversion.source}`));
    }
  }
  if (attribute.kind === "color" && sameKindCount === 1) ["color", "colour", "color_name", "colour_name"].forEach((key) => keys.add(normalizedKey(key)));
  if (attribute.kind === "size" && sameKindCount === 1) ["size", "sizes"].forEach((key) => keys.add(key));
  if (attribute.kind === "capacity" && sameKindCount === 1) ["capacity", "volume"].forEach((key) => keys.add(key));
  if (attribute.kind === "voltage" && sameKindCount === 1) keys.add("voltage");
  if (attribute.kind === "quantity" && sameKindCount === 1) ["quantity", "pack_qty", "packQuantity"].forEach((key) => keys.add(key));
  if (code === "manufacturer_variant") ["variant_label", "variantLabel"].forEach((key) => keys.add(key));
  return [...keys];
}

function directPayloadValue(
  payload: unknown,
  variantAttributes: unknown,
  attribute: SemanticAttribute,
  sameKindCount: number
): ResolvedValue | undefined {
  for (const record of [objectValue(payload), objectValue(variantAttributes)]) {
    const entries = new Map(Object.entries(record).map(([key, value]) => [normalizedKey(key), { key, value }]));
    for (const candidateKey of payloadKeys(attribute, sameKindCount)) {
      const entry = entries.get(normalizedKey(candidateKey));
      if (!entry) continue;
      const raw = scalarValue(entry.value);
      if (!raw) continue;
      if (attribute.dataType === "number" || attribute.unit) {
        const value = measuredNumber(raw, attribute.unit, sourceKeyUnit(entry.key));
        if (value !== undefined) return { value, comparableValue: value };
      }
      return { value: raw, comparableValue: normalizedComparable(raw) };
    }
  }
  return undefined;
}

function titleNumericValue(title: string, attribute: SemanticAttribute, unitCompetition: number): ResolvedValue | undefined {
  if (!attribute.unit || unitCompetition !== 1) return undefined;
  for (const conversion of unitConversions(attribute.unit)) {
    for (const alias of unitAliases(conversion.source)) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const boundary = alias === "%" || alias === "\"" || alias === "″" ? "" : "(?=$|[^\\p{L}])";
      const regex = new RegExp(`(^|[^\\p{L}\\p{N}])([0-9]+(?:[.,][0-9]+)?)\\s*${escaped}${boundary}`, "iu");
      const match = title.match(regex);
      if (!match?.[2]) continue;
      const number = numericValue(match[2]);
      if (number === undefined) continue;
      const value = formatNumber(number * conversion.factor);
      return { value, comparableValue: value, matchedText: match[0].trim() };
    }
  }
  return undefined;
}

function titleAliasValue(title: string, aliases: readonly Readonly<{ display: string; alias: string }>[] | undefined): ResolvedValue | undefined {
  if (!aliases?.length) return undefined;
  const normalizedTitle = ` ${normalizedText(title)} `;
  const sorted = [...aliases].sort((a, b) => normalizedText(b.alias).length - normalizedText(a.alias).length);
  for (const entry of sorted) {
    const alias = normalizedText(entry.alias);
    if (!alias || !normalizedTitle.includes(` ${alias} `)) continue;
    return { value: entry.display, comparableValue: normalizedComparable(entry.display), matchedText: entry.alias };
  }
  return undefined;
}

function resolvedColor(value: string): PublicProductVariantColor | undefined {
  const color = resolveCatalogColor(value);
  if (!color) return undefined;
  const { sourceValue: _sourceValue, matchedAlias: _matchedAlias, ...publicColor } = color;
  return publicColor as PublicProductVariantColor;
}

function variantAttribute(attribute: SemanticAttribute, resolved: ResolvedValue): PublicProductVariantAttribute {
  const value = attribute.kind === "color"
    ? resolveCatalogColor(resolved.value)?.displayNameEl ?? resolved.value
    : withUnit(resolved.value, attribute.unit);
  return {
    key: attribute.code,
    label: presentedLabel(attribute),
    value,
    kind: attribute.kind,
    color: attribute.kind === "color" ? resolvedColor(resolved.value) : undefined
  };
}

function alternativeAttribute(attribute: SemanticAttribute, resolved: ResolvedValue): PublicProductAlternativeAttribute {
  return { key: attribute.code, label: presentedLabel(attribute), value: withUnit(resolved.value, attribute.unit) };
}

function canonicalEvidenceValue(row: CanonicalVariantEvidenceRow | CanonicalFamilyEvidenceRow, attribute: SemanticAttribute): ResolvedValue | undefined {
  const raw = row.value_label?.trim()
    || row.value_code?.trim()
    || row.text_value?.trim()
    || scalarValue(row.number_value)
    || (row.boolean_value === null ? undefined : scalarValue(row.boolean_value))
    || scalarValue(row.dimension_value);
  if (!raw) return undefined;
  if (attribute.dataType === "number" || attribute.unit) {
    const value = measuredNumber(raw, attribute.unit, attribute.unit);
    if (value !== undefined) return { value, comparableValue: value };
  }
  return { value: raw, comparableValue: normalizedComparable(raw) };
}

function sourceEvidenceValue(row: SourceEvidenceRow, attribute: SemanticAttribute): ResolvedValue | undefined {
  const raw = row.value_label?.trim()
    || row.value_code?.trim()
    || scalarValue(row.normalized_value)
    || scalarValue(row.raw_value);
  if (!raw) return undefined;
  if (attribute.dataType === "number" || attribute.unit) {
    const value = measuredNumber(raw, attribute.unit, row.source_unit);
    if (value !== undefined) return { value, comparableValue: value };
  }
  return { value: raw, comparableValue: normalizedComparable(raw) };
}

function safePriceMinor(value: string | number | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function safeSameSourceImage(sourceWebsite: string | null, sourceImage: string | null): boolean {
  if (!sourceWebsite || !sourceImage) return false;
  try {
    const source = new URL(sourceWebsite);
    const image = new URL(sourceImage, source);
    const normalizeHost = (host: string) => host.toLowerCase().replace(/^www\./, "");
    return image.protocol === "https:" && normalizeHost(image.hostname) === normalizeHost(source.hostname);
  } catch {
    return false;
  }
}

function imageFor(row: CandidateRow): Pick<PublicProductVariantOption, "imageSrc" | "imageAlt"> {
  if (row.media_public_id) return { imageSrc: `/api/media/${encodeURIComponent(row.media_public_id)}`, imageAlt: row.media_alt_text?.trim() || undefined };
  if (safeSameSourceImage(row.source_website, row.source_image_candidate)) return { imageSrc: `/api/catalog-source-image/${encodeURIComponent(row.canonical_public_id)}` };
  return {};
}

function removeNormalizedPhrase(title: string, phrase: string): string {
  const target = normalizedText(phrase);
  if (!target) return title;
  const words = target.split(" ").filter(Boolean).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return title;
  const regex = new RegExp(`(^|[^\\p{L}\\p{N}])${words.join("[^\\p{L}\\p{N}]+")}(?=$|[^\\p{L}\\p{N}])`, "giu");
  return title.replace(regex, "$1");
}

function numericPattern(value: number): string {
  const formatted = formatNumber(value);
  const [whole, fraction] = formatted.split(".");
  return fraction ? `${whole}[.,]${fraction}` : `${whole}(?:[.,]0+)?`;
}

function removeNumericChoice(title: string, attribute: SemanticAttribute, resolved: ResolvedValue): string {
  if (!attribute.unit) return title;
  const target = numericValue(resolved.value);
  if (target === undefined) return title;
  let working = title;
  for (const conversion of unitConversions(attribute.unit)) {
    const sourceValue = target / conversion.factor;
    for (const alias of unitAliases(conversion.source)) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const boundary = alias === "%" || alias === "\"" || alias === "″" ? "" : "(?=$|[^\\p{L}])";
      const regex = new RegExp(`(^|[^\\p{L}\\p{N}])${numericPattern(sourceValue)}\\s*${escaped}${boundary}`, "giu");
      working = working.replace(regex, "$1");
    }
  }
  return working;
}

function baseIdentitySignature(
  title: string,
  brandName: string | null,
  sourceModel: string | null,
  values: ReadonlyMap<string, ResolvedValue>,
  attributes: readonly SemanticAttribute[]
): string {
  let working = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (brandName) working = removeNormalizedPhrase(working, brandName);
  if (sourceModel) working = removeNormalizedPhrase(working, sourceModel);
  for (const attribute of attributes) {
    const resolved = values.get(attribute.id);
    if (!resolved) continue;
    if (resolved.matchedText) working = removeNormalizedPhrase(working, resolved.matchedText);
    working = removeNumericChoice(working, attribute, resolved);
    working = removeNormalizedPhrase(working, withUnit(resolved.value, attribute.unit));
    working = removeNormalizedPhrase(working, resolved.value);
  }
  working = working.replace(CODELIKE_PAREN, " ");
  const signature = normalizedText(working)
    .split(" ")
    .filter((token) => !/^\d+(?:[.,]\d+)?$/u.test(token))
    .join(" ")
    .trim();
  const tokens = signature.split(" ").filter(Boolean);
  if (tokens.length < 2 || !tokens.some((token) => token.length >= 4)) return "";
  return signature;
}

function valuesDiffer(a: ResolvedValue | undefined, b: ResolvedValue | undefined): boolean | undefined {
  if (!a && !b) return false;
  if (!a || !b) return undefined;
  return a.comparableValue !== b.comparableValue;
}

function optionIdentity(attributes: readonly PublicProductAlternativeAttribute[]): string {
  return attributes.map((attribute) => `${attribute.key}:${normalizedComparable(attribute.value)}`).join("|");
}

function compactChoiceTokens(attribute: SemanticAttribute, resolved: ResolvedValue): readonly string[] {
  const tokens = new Set<string>();
  const add = (value: string) => {
    const compact = normalizedModel(value);
    if (compact.length >= 2) tokens.add(compact);
  };
  add(resolved.value);
  if (resolved.matchedText) add(resolved.matchedText);
  const target = numericValue(resolved.value);
  if (target !== undefined) {
    add(formatNumber(target));
    for (const conversion of unitConversions(attribute.unit)) add(formatNumber(target / conversion.factor));
  }
  return [...tokens].sort((a, b) => b.length - a.length);
}

function modelStem(model: string, attribute: SemanticAttribute, resolved: ResolvedValue): string | undefined {
  const source = normalizedModel(model);
  for (const token of compactChoiceTokens(attribute, resolved)) {
    if (!source.includes(token)) continue;
    const stem = source.split(token).join("");
    if (stem.length >= 3 && stem !== source) return stem;
  }
  return undefined;
}

function modelChoiceExplains(
  currentModel: string,
  candidateModel: string,
  attribute: SemanticAttribute,
  currentValue: ResolvedValue,
  candidateValue: ResolvedValue
): boolean {
  const current = normalizedModel(currentModel);
  const candidate = normalizedModel(candidateModel);
  if (!current || !candidate || current === candidate) return false;
  const currentStem = modelStem(currentModel, attribute, currentValue);
  const candidateStem = modelStem(candidateModel, attribute, candidateValue);
  return Boolean(currentStem && candidateStem && currentStem === candidateStem);
}

function sameSeriesRelation(
  context: ProductContextRow,
  candidate: Candidate,
  currentValues: ReadonlyMap<string, ResolvedValue>,
  attributes: readonly SemanticAttribute[],
  currentIdentity: string
): Readonly<{ strong: boolean; promotedFamilyIds: ReadonlySet<string> }> {
  if (!currentIdentity || candidate.identity !== currentIdentity) return { strong: false, promotedFamilyIds: new Set() };
  const differing = attributes.filter((attribute) => valuesDiffer(currentValues.get(attribute.id), candidate.values.get(attribute.id)) === true);
  if (!differing.length) return { strong: false, promotedFamilyIds: new Set() };
  const titleExplained = new Set(differing
    .filter((attribute) => currentValues.get(attribute.id)?.matchedText && candidate.values.get(attribute.id)?.matchedText)
    .map((attribute) => attribute.id));

  if (context.source_family_key && candidate.row.source_family_key && context.source_family_key === candidate.row.source_family_key) {
    return {
      strong: true,
      promotedFamilyIds: new Set(differing
        .filter((attribute) => attribute.valueLevel === "family" && titleExplained.has(attribute.id))
        .map((attribute) => attribute.id))
    };
  }

  if (context.source_model && candidate.row.source_model) {
    const currentModel = normalizedModel(context.source_model);
    const candidateModel = normalizedModel(candidate.row.source_model);
    if (currentModel && currentModel === candidateModel) {
      return {
        strong: true,
        promotedFamilyIds: new Set(differing
          .filter((attribute) => attribute.valueLevel === "family" && titleExplained.has(attribute.id))
          .map((attribute) => attribute.id))
      };
    }
    const explained = differing.filter((attribute) => {
      const current = currentValues.get(attribute.id);
      const next = candidate.values.get(attribute.id);
      return Boolean(current && next && modelChoiceExplains(context.source_model!, candidate.row.source_model!, attribute, current, next));
    });
    if (explained.length) {
      return {
        strong: true,
        promotedFamilyIds: new Set(explained.filter((attribute) => attribute.valueLevel === "family").map((attribute) => attribute.id))
      };
    }
    return { strong: false, promotedFamilyIds: new Set() };
  }

  if (titleExplained.size) {
    return {
      strong: true,
      promotedFamilyIds: new Set(differing
        .filter((attribute) => attribute.valueLevel === "family" && titleExplained.has(attribute.id))
        .map((attribute) => attribute.id))
    };
  }

  return { strong: false, promotedFamilyIds: new Set() };
}

async function contextFor(canonicalVariantId: string, allowInactive: boolean): Promise<ProductContextRow | undefined> {
  const result = await getProductionPostgresRuntime().nativePool.query<ProductContextRow>(`
    SELECT cv.id::text AS canonical_uuid,cv.public_id AS canonical_public_id,cv.slug,cv.family_id::text AS family_id,
           cv.market_id::text AS market_id,cv.category_id::text AS category_id,cv.brand_id::text AS brand_id,
           brand.name AS brand_name,COALESCE(pf.product_type_id::text,source_type.product_type_id,category_default.product_type_id) AS product_type_id,
           source_row.source_id,source_row.source_product_id,source_row.source_title,source_row.source_model,source_row.source_family_key,
           source_row.normalized_payload,source_row.raw_payload,cv.variant_attributes
    FROM canonical_variants cv
    JOIN markets market ON market.id=cv.market_id AND market.code='sparta'
    LEFT JOIN brands brand ON brand.id=cv.brand_id
    LEFT JOIN product_families pf ON pf.id=cv.family_id
    LEFT JOIN LATERAL (
      SELECT linked.source_id::text AS source_id,linked.id::text AS source_product_id,latest.title AS source_title,
             COALESCE(NULLIF(btrim(latest.source_identity->>'model'),''),NULLIF(btrim(latest.normalized_payload->>'model'),'')) AS source_model,
             COALESCE(NULLIF(latest.normalized_payload->>'familyKey',''),NULLIF(latest.normalized_payload->>'variantFamilyId','')) AS source_family_key,
             latest.normalized_payload,latest.raw_payload
      FROM catalog_source_product_links csl
      JOIN catalog_source_products linked ON linked.id=csl.source_product_id
      JOIN LATERAL (
        SELECT candidate.*
        FROM catalog_source_products candidate
        JOIN catalog_source_snapshots snapshot ON snapshot.id=candidate.snapshot_id
        WHERE candidate.source_id=linked.source_id AND candidate.source_product_key=linked.source_product_key
        ORDER BY snapshot.observed_at DESC NULLS LAST,candidate.created_at DESC,candidate.id DESC
        LIMIT 1
      ) latest ON true
      WHERE csl.canonical_variant_id=cv.id AND csl.link_status='approved'
      ORDER BY csl.confidence DESC,csl.updated_at DESC,csl.id DESC
      LIMIT 1
    ) source_row ON true
    LEFT JOIN LATERAL (
      SELECT mr.product_type_id::text AS product_type_id
      FROM catalog_source_product_links csl
      JOIN catalog_source_products linked ON linked.id=csl.source_product_id
      JOIN catalog_source_attribute_mapping_rules mr ON mr.source_id=linked.source_id AND mr.status='approved'
       AND ((mr.scope_kind='taxonomy_node' AND mr.scope_key=linked.source_taxonomy_node_id::text)
         OR (mr.scope_kind='source_category' AND mr.scope_key=COALESCE(NULLIF(btrim(linked.source_identity->>'categoryId'),''),NULLIF(btrim(linked.source_identity->>'category_id'),''),NULLIF(btrim(linked.normalized_payload->>'sourceCategoryId'),''))))
      JOIN product_types pt ON pt.id=mr.product_type_id AND pt.status='active'
      WHERE csl.canonical_variant_id=cv.id AND csl.link_status='approved'
      GROUP BY mr.product_type_id ORDER BY count(*) DESC,max(mr.reviewed_at) DESC NULLS LAST,mr.product_type_id LIMIT 1
    ) source_type ON true
    LEFT JOIN LATERAL (
      SELECT cpt.product_type_id::text AS product_type_id
      FROM category_product_types cpt JOIN product_types pt ON pt.id=cpt.product_type_id AND pt.status='active'
      WHERE cpt.category_id=cv.category_id AND cpt.is_default=true ORDER BY cpt.sort_order,cpt.product_type_id LIMIT 1
    ) category_default ON true
    WHERE cv.public_id=$1 AND ($2::boolean OR cv.active=true) AND cv.suppressed=false AND cv.recalled=false LIMIT 1
  `,[canonicalVariantId,allowInactive]);
  return result.rows[0];
}

async function semanticAttributes(productTypeId: string): Promise<readonly SemanticAttribute[]> {
  const result = await getProductionPostgresRuntime().nativePool.query<SemanticAttributeRow>(`
    SELECT ad.id::text AS attribute_id,ad.code AS attribute_code,ad.data_type,COALESCE(pta.unit_override,ad.unit) AS unit,
           ad.group_code,COALESCE(NULLIF(at.label,''),ad.code) AS label_el,pta.value_level,pta.variant_defining,pta.comparable,
           pta.variant_axis_order,pta.sort_order
    FROM product_type_attributes pta
    JOIN product_types pt ON pt.id=pta.product_type_id AND pt.status='active'
    JOIN attribute_definitions ad ON ad.id=pta.attribute_id AND ad.active=true
    LEFT JOIN attribute_translations at ON at.attribute_id=ad.id AND upper(at.locale)='EL'
    WHERE pta.product_type_id=$1::uuid AND pta.customer_visible=true
      AND ((pta.value_level='variant' AND pta.variant_defining=true)
        OR (pta.value_level='family' AND pta.variant_defining=false AND pta.comparable=true))
    ORDER BY CASE pta.value_level WHEN 'variant' THEN 0 ELSE 1 END,pta.variant_axis_order NULLS LAST,pta.sort_order,ad.code
  `,[productTypeId]);
  return result.rows
    .filter((row) => !COMPATIBILITY_ATTRIBUTE_PATTERN.test(normalizedKey(row.attribute_code)))
    .map((row,index) => ({
      id: row.attribute_id,
      code: row.attribute_code,
      dataType: row.data_type,
      unit: row.unit ?? undefined,
      groupCode: row.group_code ?? undefined,
      label: row.label_el,
      valueLevel: row.value_level,
      variantDefining: Boolean(row.variant_defining),
      comparable: Boolean(row.comparable),
      kind: semanticKind(row.attribute_code,row.label_el,row.group_code ?? undefined),
      order: row.variant_axis_order ?? 10_000 + Number(row.sort_order ?? index)
    }));
}

async function candidateRows(context: ProductContextRow, scope: ChoiceScope): Promise<readonly CandidateRow[]> {
  if (!context.source_id || !context.product_type_id) return [];
  const demoMode = scope.mode === "demo";
  const demoVendorId = scope.mode === "demo" ? scope.vendorId : null;
  const result = await getProductionPostgresRuntime().nativePool.query<CandidateRow>(`
    SELECT cv.id::text AS canonical_uuid,cv.public_id AS canonical_public_id,cv.family_id::text AS family_id,cv.slug,cv.variant_attributes,
           latest.id::text AS source_product_id,latest.title AS source_title,
           COALESCE(NULLIF(btrim(latest.source_identity->>'model'),''),NULLIF(btrim(latest.normalized_payload->>'model'),'')) AS source_model,
           COALESCE(NULLIF(latest.normalized_payload->>'familyKey',''),NULLIF(latest.normalized_payload->>'variantFamilyId','')) AS source_family_key,
           latest.normalized_payload,latest.raw_payload,
           CASE WHEN $8::boolean THEN true ELSE eligible.from_price_minor IS NOT NULL END AS available,
           CASE WHEN $8::boolean THEN demo_offer.from_price_minor ELSE eligible.from_price_minor END AS from_price_minor,
           governed_media.media_public_id,governed_media.media_alt_text,source_image.source_image_candidate,source_image.source_website
    FROM canonical_variants cv
    LEFT JOIN product_families pf ON pf.id=cv.family_id
    JOIN catalog_source_product_links csl ON csl.canonical_variant_id=cv.id AND csl.link_status='approved'
    JOIN catalog_source_products linked ON linked.id=csl.source_product_id AND linked.source_id=$6::uuid
    JOIN LATERAL (
      SELECT candidate.* FROM catalog_source_products candidate
      JOIN catalog_source_snapshots snapshot ON snapshot.id=candidate.snapshot_id
      WHERE candidate.source_id=linked.source_id AND candidate.source_product_key=linked.source_product_key
      ORDER BY snapshot.observed_at DESC NULLS LAST,candidate.created_at DESC,candidate.id DESC LIMIT 1
    ) latest ON true
    LEFT JOIN LATERAL (
      SELECT MIN(vo.customer_price_minor)::bigint AS from_price_minor FROM vendor_offers vo
      WHERE $8::boolean AND vo.canonical_variant_id=cv.id AND vo.vendor_id=$9::uuid AND vo.status IN ('draft','pending_review','approved') AND vo.customer_price_minor>0
    ) demo_offer ON true
    LEFT JOIN LATERAL (
      SELECT MIN(vo.customer_price_minor)::bigint AS from_price_minor FROM vendor_offers vo
      JOIN vendor_businesses vendor ON vendor.id=vo.vendor_id JOIN vendor_locations location ON location.id=vo.location_id
      JOIN inventory_balances inventory ON inventory.offer_id=vo.id
      WHERE NOT $8::boolean AND vo.canonical_variant_id=cv.id AND vo.status='approved' AND vo.customer_price_minor>0
        AND vendor.status='active' AND location.active=true AND 'pickup'::fulfilment_mode=ANY(vo.fulfilment_modes)
        AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
        AND GREATEST(0,inventory.on_hand-inventory.active_reservations-inventory.safety_stock-inventory.blocked)>=1
        AND inventory.stock_confirmed_at + make_interval(secs=>inventory.freshness_ttl_seconds)>now()
    ) eligible ON true
    LEFT JOIN LATERAL (
      SELECT media.public_id AS media_public_id,media.alt_text AS media_alt_text FROM product_media media
      WHERE media.canonical_variant_id=cv.id AND media.kind='image' AND media.scan_status='clean' AND media.rights_status='approved'
        AND media.moderation_status='approved' AND media.object_key IS NOT NULL AND media.content_type IN ('image/jpeg','image/png','image/webp')
      ORDER BY CASE WHEN media.vendor_id IS NULL THEN 0 ELSE 1 END,media.reviewed_at DESC NULLS LAST,media.created_at DESC,media.public_id LIMIT 1
    ) governed_media ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(latest_image.source_image_url,latest_image.normalized_payload->>'imageUrl',latest_image.raw_payload->>'image_url') AS source_image_candidate,
             source.website AS source_website
      FROM catalog_sources source
      JOIN LATERAL (SELECT latest.source_image_url,latest.normalized_payload,latest.raw_payload) latest_image ON true
      WHERE source.id=linked.source_id AND source.active=true LIMIT 1
    ) source_image ON true
    WHERE cv.market_id=$2::uuid AND cv.category_id=$3::uuid AND ($4::uuid IS NULL OR cv.brand_id=$4::uuid)
      AND cv.suppressed=false AND cv.recalled=false AND cv.family_id IS DISTINCT FROM $5::uuid
      AND (pf.product_type_id IS NULL OR pf.product_type_id=$7::uuid)
      AND ((NOT $8::boolean AND cv.active=true) OR ($8::boolean AND EXISTS (
        SELECT 1 FROM vendor_offers preview_offer WHERE preview_offer.canonical_variant_id=cv.id AND preview_offer.vendor_id=$9::uuid
          AND preview_offer.status IN ('draft','pending_review','approved'))))
    ORDER BY csl.confidence DESC,cv.family_id,cv.slug LIMIT 400
  `,[context.canonical_uuid,context.market_id,context.category_id,context.brand_id,context.family_id,context.source_id,context.product_type_id,demoMode,demoVendorId]);
  const best = new Map<string,CandidateRow>();
  for (const row of result.rows) if (!best.has(row.canonical_uuid)) best.set(row.canonical_uuid,row);
  return [...best.values()];
}

async function aliasesFor(attributes: readonly SemanticAttribute[]): Promise<ReadonlyMap<string,readonly Readonly<{ display:string;alias:string }>[]>> {
  const ids = attributes.map((attribute) => attribute.id);
  if (!ids.length) return new Map();
  const result = await getProductionPostgresRuntime().nativePool.query<AliasRow>(`
    WITH values_and_labels AS (
      SELECT av.attribute_id::text AS attribute_id,COALESCE(NULLIF(avt.label,''),av.code) AS display_value,av.code AS alias
      FROM attribute_values av LEFT JOIN attribute_value_translations avt ON avt.attribute_value_id=av.id AND upper(avt.locale)='EL'
      WHERE av.active=true AND av.attribute_id=ANY($1::uuid[])
      UNION ALL
      SELECT av.attribute_id::text,COALESCE(NULLIF(avt.label,''),av.code),ava.alias
      FROM attribute_value_aliases ava JOIN attribute_values av ON av.id=ava.attribute_value_id AND av.active=true
      LEFT JOIN attribute_value_translations avt ON avt.attribute_value_id=av.id AND upper(avt.locale)='EL'
      WHERE av.attribute_id=ANY($1::uuid[])
    ) SELECT DISTINCT attribute_id,display_value,alias FROM values_and_labels WHERE NULLIF(btrim(alias),'') IS NOT NULL
  `,[ids]);
  const map = new Map<string,Array<{display:string;alias:string}>>();
  for (const row of result.rows) {
    const list = map.get(row.attribute_id) ?? [];
    list.push({display:row.display_value,alias:row.alias});
    map.set(row.attribute_id,list);
  }
  return map;
}

async function evidence(
  context: ProductContextRow,
  rows: readonly CandidateRow[],
  attributes: readonly SemanticAttribute[]
): Promise<Readonly<{
  variant: ReadonlyMap<string,ResolvedValue>;
  family: ReadonlyMap<string,ResolvedValue>;
  source: ReadonlyMap<string,ResolvedValue>;
}>> {
  const variantIds = [context.canonical_uuid,...rows.map((row) => row.canonical_uuid)];
  const familyIds = [context.family_id,...rows.map((row) => row.family_id)].filter((value):value is string=>Boolean(value));
  const sourceIds = [context.source_product_id,...rows.map((row) => row.source_product_id)].filter((value):value is string=>Boolean(value));
  const attributeIds = attributes.map((attribute)=>attribute.id);
  const attrById = new Map(attributes.map((attribute)=>[attribute.id,attribute]));
  if (!attributeIds.length) return {variant:new Map(),family:new Map(),source:new Map()};
  const [variantRows,familyRows,sourceRows] = await Promise.all([
    getProductionPostgresRuntime().nativePool.query<CanonicalVariantEvidenceRow>(`
      SELECT cvav.canonical_variant_id::text AS canonical_variant_id,cvav.attribute_id::text AS attribute_id,
             COALESCE(NULLIF(avt.label,''),av.code) AS value_label,av.code AS value_code,cvav.text_value,cvav.number_value,cvav.boolean_value,cvav.dimension_value
      FROM canonical_variant_attribute_values cvav LEFT JOIN attribute_values av ON av.id=cvav.attribute_value_id AND av.active=true
      LEFT JOIN attribute_value_translations avt ON avt.attribute_value_id=av.id AND upper(avt.locale)='EL'
      WHERE cvav.canonical_variant_id=ANY($1::uuid[]) AND cvav.attribute_id=ANY($2::uuid[])
      ORDER BY cvav.canonical_variant_id,cvav.attribute_id,cvav.position
    `,[variantIds,attributeIds]),
    getProductionPostgresRuntime().nativePool.query<CanonicalFamilyEvidenceRow>(`
      SELECT pfav.family_id::text AS family_id,pfav.attribute_id::text AS attribute_id,
             COALESCE(NULLIF(avt.label,''),av.code) AS value_label,av.code AS value_code,pfav.text_value,pfav.number_value,pfav.boolean_value,pfav.dimension_value
      FROM product_family_attribute_values pfav LEFT JOIN attribute_values av ON av.id=pfav.attribute_value_id AND av.active=true
      LEFT JOIN attribute_value_translations avt ON avt.attribute_value_id=av.id AND upper(avt.locale)='EL'
      WHERE pfav.family_id=ANY($1::uuid[]) AND pfav.attribute_id=ANY($2::uuid[])
      ORDER BY pfav.family_id,pfav.attribute_id,pfav.position
    `,[familyIds,attributeIds]),
    getProductionPostgresRuntime().nativePool.query<SourceEvidenceRow>(`
      SELECT DISTINCT ON (obs.source_product_id,obs.attribute_id) obs.source_product_id::text AS source_product_id,obs.attribute_id::text AS attribute_id,
             COALESCE(NULLIF(avt.label,''),av.code) AS value_label,av.code AS value_code,obs.normalized_value,obs.raw_value,obs.source_unit
      FROM catalog_source_attribute_observations obs JOIN catalog_source_products sp ON sp.id=obs.source_product_id
      LEFT JOIN attribute_values av ON av.id=obs.attribute_value_id AND av.active=true LEFT JOIN attribute_value_translations avt ON avt.attribute_value_id=av.id AND upper(avt.locale)='EL'
      WHERE obs.source_product_id=ANY($1::uuid[]) AND obs.attribute_id=ANY($2::uuid[]) AND (
        obs.mapping_status='mapped' OR (obs.mapping_status='review_required' AND EXISTS (
          SELECT 1 FROM catalog_source_attribute_mapping_rules rule WHERE rule.source_id=sp.source_id AND rule.source_attribute_key=obs.source_attribute_key
            AND rule.attribute_id=obs.attribute_id AND rule.status='approved' AND ((rule.scope_kind='taxonomy_node' AND rule.scope_key=sp.source_taxonomy_node_id::text)
              OR (rule.scope_kind='source_category' AND rule.scope_key=COALESCE(NULLIF(btrim(sp.source_identity->>'categoryId'),''),NULLIF(btrim(sp.source_identity->>'category_id'),''),NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')))))))
      ORDER BY obs.source_product_id,obs.attribute_id,CASE obs.mapping_status WHEN 'mapped' THEN 0 ELSE 1 END,obs.confidence DESC,obs.created_at DESC
    `,[sourceIds,attributeIds])
  ]);
  const variant = new Map<string,ResolvedValue>();
  for (const row of variantRows.rows) {
    const attribute = attrById.get(row.attribute_id);
    if (!attribute) continue;
    const value = canonicalEvidenceValue(row,attribute);
    if (value && !variant.has(`${row.canonical_variant_id}:${row.attribute_id}`)) variant.set(`${row.canonical_variant_id}:${row.attribute_id}`,value);
  }
  const family = new Map<string,ResolvedValue>();
  for (const row of familyRows.rows) {
    const attribute = attrById.get(row.attribute_id);
    if (!attribute) continue;
    const value = canonicalEvidenceValue(row,attribute);
    if (value && !family.has(`${row.family_id}:${row.attribute_id}`)) family.set(`${row.family_id}:${row.attribute_id}`,value);
  }
  const source = new Map<string,ResolvedValue>();
  for (const row of sourceRows.rows) {
    const attribute = attrById.get(row.attribute_id);
    if (!attribute) continue;
    const value = sourceEvidenceValue(row,attribute);
    if (value && !source.has(`${row.source_product_id}:${row.attribute_id}`)) source.set(`${row.source_product_id}:${row.attribute_id}`,value);
  }
  return {variant,family,source};
}

async function compatibilityExclusions(context: ProductContextRow): Promise<Readonly<{variants:ReadonlySet<string>;families:ReadonlySet<string>}>> {
  const result = await getProductionPostgresRuntime().nativePool.query<CompatibilityRow>(`
    SELECT pcc.target_canonical_variant_id::text AS canonical_variant_id,pcc.target_product_family_id::text AS family_id
    FROM product_compatibility_claims pcc WHERE pcc.subject_canonical_variant_id=$1::uuid AND pcc.review_status IN ('candidate','verified')
      AND pcc.relationship_type IN ('compatible_with','fits','uses_platform')
    UNION
    SELECT pcc.subject_canonical_variant_id::text AS canonical_variant_id,subject.family_id::text AS family_id
    FROM product_compatibility_claims pcc JOIN canonical_variants subject ON subject.id=pcc.subject_canonical_variant_id
    WHERE pcc.review_status IN ('candidate','verified') AND pcc.relationship_type IN ('compatible_with','fits','uses_platform')
      AND (pcc.target_canonical_variant_id=$1::uuid OR ($2::uuid IS NOT NULL AND pcc.target_product_family_id=$2::uuid))
  `,[context.canonical_uuid,context.family_id]);
  return {
    variants:new Set(result.rows.map((row)=>row.canonical_variant_id).filter((value):value is string=>Boolean(value))),
    families:new Set(result.rows.map((row)=>row.family_id).filter((value):value is string=>Boolean(value)))
  };
}

function resolvedValuesFor(
  row: Readonly<{
    canonical_uuid:string;
    family_id:string|null;
    source_product_id:string|null;
    source_title:string|null;
    normalized_payload:unknown;
    variant_attributes:unknown;
  }>,
  attributes: readonly SemanticAttribute[],
  aliases: ReadonlyMap<string,readonly Readonly<{display:string;alias:string }>[]>,
  evidenceMaps: Readonly<{variant:ReadonlyMap<string,ResolvedValue>;family:ReadonlyMap<string,ResolvedValue>;source:ReadonlyMap<string,ResolvedValue>}>
): ReadonlyMap<string,ResolvedValue> {
  const values = new Map<string,ResolvedValue>();
  const kindCounts = new Map<PublicProductVariantKind,number>();
  const unitCounts = new Map<string,number>();
  for (const attribute of attributes) {
    kindCounts.set(attribute.kind,(kindCounts.get(attribute.kind) ?? 0)+1);
    const unit = normalizeUnit(attribute.unit);
    if (unit) unitCounts.set(unit,(unitCounts.get(unit) ?? 0)+1);
  }
  for (const attribute of attributes) {
    const canonicalKey = attribute.valueLevel === "family" && row.family_id ? `${row.family_id}:${attribute.id}` : `${row.canonical_uuid}:${attribute.id}`;
    const canonical = attribute.valueLevel === "family" ? evidenceMaps.family.get(canonicalKey) : evidenceMaps.variant.get(canonicalKey);
    const source = row.source_product_id ? evidenceMaps.source.get(`${row.source_product_id}:${attribute.id}`) : undefined;
    const direct = directPayloadValue(row.normalized_payload,row.variant_attributes,attribute,kindCounts.get(attribute.kind) ?? 1);
    const alias = row.source_title ? titleAliasValue(row.source_title,aliases.get(attribute.id)) : undefined;
    const unit = normalizeUnit(attribute.unit);
    const numeric = row.source_title ? titleNumericValue(row.source_title,attribute,unit ? unitCounts.get(unit) ?? 1 : 0) : undefined;
    const base = canonical ?? source ?? direct ?? alias ?? numeric;
    if (!base) continue;
    const titleEvidence = numeric ?? alias;
    const resolved = titleEvidence && valuesDiffer(base,titleEvidence) === false && titleEvidence.matchedText
      ? { ...base, matchedText: titleEvidence.matchedText }
      : base;
    values.set(attribute.id,resolved);
  }
  return values;
}

function compatibleWithCurrentVariant(
  currentValues: ReadonlyMap<string,ResolvedValue>,
  candidateValues: ReadonlyMap<string,ResolvedValue>,
  variantAttributes: readonly SemanticAttribute[]
): Readonly<{matches:number;conflicts:number}> {
  let matches=0,conflicts=0;
  for (const attribute of variantAttributes) {
    const difference = valuesDiffer(currentValues.get(attribute.id),candidateValues.get(attribute.id));
    if (difference === false && currentValues.has(attribute.id) && candidateValues.has(attribute.id)) matches += 1;
    if (difference === true) conflicts += 1;
  }
  return {matches,conflicts};
}

function classify(
  context: ProductContextRow,
  rows: readonly CandidateRow[],
  attributes: readonly SemanticAttribute[],
  aliases: ReadonlyMap<string,readonly Readonly<{display:string;alias:string }>[]>,
  evidenceMaps: Readonly<{variant:ReadonlyMap<string,ResolvedValue>;family:ReadonlyMap<string,ResolvedValue>;source:ReadonlyMap<string,ResolvedValue>}>,
  exclusions: Readonly<{variants:ReadonlySet<string>;families:ReadonlySet<string>}>
): PublicCrossFamilyChoices {
  const variantAttrs = attributes.filter((attribute)=>attribute.valueLevel === "variant" && attribute.variantDefining);
  const familyAttrs = attributes.filter((attribute)=>attribute.valueLevel === "family" && attribute.comparable && !attribute.variantDefining);
  const attributeById = new Map(attributes.map((attribute)=>[attribute.id,attribute]));
  const currentValues = resolvedValuesFor({
    canonical_uuid:context.canonical_uuid,
    family_id:context.family_id,
    source_product_id:context.source_product_id,
    source_title:context.source_title,
    normalized_payload:context.normalized_payload,
    variant_attributes:context.variant_attributes
  },attributes,aliases,evidenceMaps);
  const currentIdentity = context.source_title
    ? baseIdentitySignature(context.source_title,context.brand_name,context.source_model,currentValues,attributes)
    : "";
  if (!currentIdentity) return emptyChoices();

  const relations: SeriesRelation[] = [];
  for (const row of rows) {
    if (exclusions.variants.has(row.canonical_uuid) || (row.family_id && exclusions.families.has(row.family_id))) continue;
    const values = resolvedValuesFor(row,attributes,aliases,evidenceMaps);
    const identity = baseIdentitySignature(row.source_title,context.brand_name,row.source_model,values,attributes);
    const candidate: Candidate = {row,values,identity};
    const relation = sameSeriesRelation(context,candidate,currentValues,attributes,currentIdentity);
    if (!relation.strong) continue;
    relations.push({candidate,promotedFamilyIds:relation.promotedFamilyIds});
  }

  const variantRelations = relations.filter((relation) => {
    let hasVariantDifference = false;
    let unknownVariantAxis = false;
    for (const attribute of variantAttrs) {
      const difference = valuesDiffer(currentValues.get(attribute.id),relation.candidate.values.get(attribute.id));
      if (difference === true) hasVariantDifference = true;
      if (difference === undefined) unknownVariantAxis = true;
    }
    const promotedDifference = [...relation.promotedFamilyIds].some((id) => valuesDiffer(currentValues.get(id),relation.candidate.values.get(id)) === true);
    return !unknownVariantAxis && (hasVariantDifference || promotedDifference);
  });

  const promotedIds = new Set(variantRelations.flatMap((relation)=>[...relation.promotedFamilyIds]));
  const promotedAttrs = [...promotedIds]
    .map((id)=>attributeById.get(id))
    .filter((attribute):attribute is SemanticAttribute=>Boolean(attribute))
    .sort((a,b)=>a.order-b.order);
  const displayAxes = [...variantAttrs,...promotedAttrs];

  const currentVariantAttributes = promotedAttrs
    .map((attribute)=>{
      const resolved=currentValues.get(attribute.id);
      return resolved ? variantAttribute(attribute,resolved) : undefined;
    })
    .filter((attribute):attribute is PublicProductVariantAttribute=>Boolean(attribute));

  const variantExtensions: PublicProductVariantOption[] = [];
  const variantIds = new Set<string>();
  for (const relation of variantRelations) {
    if (promotedAttrs.some((attribute)=>!relation.candidate.values.get(attribute.id) || !currentValues.get(attribute.id))) continue;
    const optionAttributes = displayAxes
      .map((attribute)=>{
        const resolved=relation.candidate.values.get(attribute.id);
        return resolved ? variantAttribute(attribute,resolved) : undefined;
      })
      .filter((attribute):attribute is PublicProductVariantAttribute=>Boolean(attribute));
    if (!optionAttributes.length) continue;
    variantIds.add(relation.candidate.row.canonical_public_id);
    variantExtensions.push({
      canonicalVariantId:relation.candidate.row.canonical_public_id,
      slug:relation.candidate.row.slug,
      attributes:optionAttributes,
      available:Boolean(relation.candidate.row.available),
      fromPriceMinor:safePriceMinor(relation.candidate.row.from_price_minor),
      ...imageFor(relation.candidate.row)
    });
  }

  const byFamily = new Map<string,SeriesRelation[]>();
  for (const relation of relations) {
    if (variantIds.has(relation.candidate.row.canonical_public_id) || !relation.candidate.row.family_id) continue;
    const list=byFamily.get(relation.candidate.row.family_id) ?? [];
    list.push(relation);
    byFamily.set(relation.candidate.row.family_id,list);
  }

  const alternatives: PublicProductAlternativeOption[]=[];
  for (const familyRelations of byFamily.values()) {
    const representative=familyRelations[0];
    if (!representative) continue;
    const differingFamilyAttrs = familyAttrs.filter((attribute)=>valuesDiffer(currentValues.get(attribute.id),representative.candidate.values.get(attribute.id)) === true);
    if (!differingFamilyAttrs.length) continue;
    if (differingFamilyAttrs.some((attribute)=>!currentValues.get(attribute.id) || !representative.candidate.values.get(attribute.id))) continue;
    const ranked = familyRelations
      .map((relation)=>({relation,...compatibleWithCurrentVariant(currentValues,relation.candidate.values,variantAttrs)}))
      .filter((entry)=>entry.conflicts===0)
      .sort((a,b)=>Number(Boolean(b.relation.candidate.row.available))-Number(Boolean(a.relation.candidate.row.available)) || b.matches-a.matches || a.relation.candidate.row.slug.localeCompare(b.relation.candidate.row.slug,"el"));
    const selected=ranked[0]?.relation.candidate;
    if (!selected) continue;
    const choiceAttributes=differingFamilyAttrs.map((attribute)=>alternativeAttribute(attribute,selected.values.get(attribute.id)!));
    alternatives.push({
      canonicalVariantId:selected.row.canonical_public_id,
      slug:selected.row.slug,
      attributes:choiceAttributes,
      available:Boolean(selected.row.available),
      ...imageFor(selected.row)
    });
  }

  const dedupedAlternatives = new Map<string,PublicProductAlternativeOption>();
  for (const option of alternatives) {
    const key=optionIdentity(option.attributes);
    const existing=dedupedAlternatives.get(key);
    if (!existing || (!existing.available && option.available)) dedupedAlternatives.set(key,option);
  }
  const alternativeOptions=[...dedupedAlternatives.values()];
  const alternativeLabels=[...new Set(alternativeOptions.flatMap((option)=>option.attributes.map((attribute)=>attribute.label)))];
  const title=alternativeLabels.length===1 ? `Άλλη επιλογή: ${alternativeLabels[0]}` : "Άλλες επιλογές του ίδιου προϊόντος";
  return {currentVariantAttributes,variantExtensions,alternatives:{options:alternativeOptions,title}};
}

async function crossFamilyChoices(canonicalVariantId: string, scope: ChoiceScope): Promise<PublicCrossFamilyChoices> {
  const canonicalId=canonicalVariantId.trim();
  if (!canonicalId || !productionDatabaseConfigured()) return emptyChoices();
  try {
    const context=await contextFor(canonicalId,scope.mode === "demo");
    if (!context?.product_type_id || !context.source_id || !context.source_title) return emptyChoices();
    const attributes=await semanticAttributes(context.product_type_id);
    if (!attributes.length) return emptyChoices();
    const rows=await candidateRows(context,scope);
    if (!rows.length) return emptyChoices();
    const [aliases,evidenceMaps,exclusions]=await Promise.all([
      aliasesFor(attributes),
      evidence(context,rows,attributes),
      compatibilityExclusions(context)
    ]);
    return classify(context,rows,attributes,aliases,evidenceMaps,exclusions);
  } catch (error) {
    console.error(JSON.stringify({
      level:"error",
      event:"storefront.cross_family_choice_classification_failed",
      canonicalVariantId:canonicalId,
      mode:scope.mode,
      message:error instanceof Error?error.message:String(error)
    }));
    return emptyChoices();
  }
}

const getCachedPublicCrossFamilyChoices=cache(async (canonicalVariantId:string)=>crossFamilyChoices(canonicalVariantId,{mode:"live"}));

export async function getPublicCrossFamilyChoices(canonicalVariantId:string):Promise<PublicCrossFamilyChoices>{
  return getCachedPublicCrossFamilyChoices(canonicalVariantId.trim());
}

export async function getDemoCrossFamilyChoices(canonicalVariantId:string,vendorId:string):Promise<PublicCrossFamilyChoices>{
  const canonicalId=canonicalVariantId.trim();
  const vendor=vendorId.trim();
  if (!canonicalId || !vendor) return emptyChoices();
  return crossFamilyChoices(canonicalId,{mode:"demo",vendorId:vendor});
}

function mergeAttributes(
  base: readonly PublicProductVariantAttribute[],
  extensions: readonly PublicProductVariantAttribute[]
): readonly PublicProductVariantAttribute[] {
  const byKey=new Map(base.map((attribute)=>[attribute.key,attribute]));
  for (const attribute of extensions) byKey.set(attribute.key,attribute);
  return [...byKey.values()];
}

export function mergeVariantPresentations(
  base:PublicProductVariantPresentation,
  extensions:readonly PublicProductVariantOption[],
  currentVariantId?:string,
  currentVariantAttributes:readonly PublicProductVariantAttribute[]=[]
):PublicProductVariantPresentation{
  const options=new Map<string,PublicProductVariantOption>();
  for (const option of base.options) options.set(option.canonicalVariantId,option);
  if (currentVariantId && currentVariantAttributes.length) {
    const current=options.get(currentVariantId);
    if (current) options.set(currentVariantId,{...current,attributes:mergeAttributes(current.attributes,currentVariantAttributes)});
  }
  for (const extension of extensions) {
    const existing=options.get(extension.canonicalVariantId);
    options.set(extension.canonicalVariantId,existing
      ? {...existing,attributes:mergeAttributes(existing.attributes,extension.attributes)}
      : extension);
  }
  return productVariantPresentation([...options.values()]);
}
