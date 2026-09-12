import { createHash } from "node:crypto";
import { classifyNovaSupplierCondition } from "./bazaar-commerce";

export type CatalogueEnrichmentStatus = "pending" | "enriched" | "needs_review" | "failed";

export type VerifiedProductFacts = Readonly<{
  brand: string | null;
  model: string | null;
  productType: string | null;
  color: string | null;
  materials: readonly string[];
  dimensions: Readonly<Record<string, string | number>>;
  season: string | null;
  gender: string | null;
  condition: string | null;
  features: readonly string[];
  claims: readonly string[];
}>;

export type FactProvenance = Readonly<Record<string, readonly string[]>>;

export type CatalogueEnrichmentDraft = Readonly<{
  titleEl: string;
  shortDescriptionEl: string | null;
  descriptionEl: string | null;
  titleEn?: string | null;
  shortDescriptionEn?: string | null;
  descriptionEn?: string | null;
}>;

export type DeterministicPresentation = Readonly<{
  titleEl: string;
  shortDescriptionEl: string | null;
  specificationsEl: Readonly<Record<string, string>>;
}>;

export type BazaarPresentationOverlay = Readonly<{
  commerceChannel: "normal" | "bazaar";
  condition: "new" | "preloved" | "preowned_defect" | "open_box";
  bazaarSource: string | null;
  supplierCondition: string | null;
}>;

export type VerifiedFactExtraction = Readonly<{
  facts: VerifiedProductFacts;
  provenance: FactProvenance;
}>;

export interface CatalogueLanguageEnricher {
  generate(input: Readonly<{
    facts: VerifiedProductFacts;
    fallback: DeterministicPresentation;
    bazaar: BazaarPresentationOverlay;
  }>): Promise<CatalogueEnrichmentDraft>;
}

const MODEL_KEYS = new Set(["model","model_name","product_model","product_line","product_family","style_name","style"]);
const TYPE_KEYS = new Set(["product_type","type","item_type","product_category"]);
const COLOR_KEYS = new Set(["color","colour","main_color","primary_color"]);
const MATERIAL_KEYS = new Set(["material","materials","composition","fabric","fabric_composition"]);
const SEASON_KEYS = new Set(["season","collection","collection_season"]);
const FEATURE_KEYS = new Set(["feature","features","details","product_features"]);

const COLOR_EL: Readonly<Record<string,string>> = Object.freeze({
  beige: "Μπεζ", black: "Μαύρο", white: "Λευκό", brown: "Καφέ", red: "Κόκκινο",
  blue: "Μπλε", green: "Πράσινο", pink: "Ροζ", grey: "Γκρι", gray: "Γκρι",
  gold: "Χρυσό", silver: "Ασημί", orange: "Πορτοκαλί", purple: "Μωβ", yellow: "Κίτρινο"
});

const MATERIAL_EL: Readonly<Record<string,string>> = Object.freeze({
  cotton: "βαμβάκι", leather: "δέρμα", "calf leather": "δέρμα μοσχαριού", calfskin: "δέρμα μοσχαριού",
  wool: "μαλλί", silk: "μετάξι", polyester: "πολυεστέρα", nylon: "νάιλον", linen: "λινό"
});

const PRODUCT_TYPE_EL: Readonly<Record<string,string>> = Object.freeze({
  bag: "Τσάντα", "tote bag": "Τσάντα Tote", tote: "Τσάντα Tote", "shoulder bag": "Τσάντα Ώμου",
  "crossbody bag": "Τσάντα Crossbody", handbag: "Τσάντα Χειρός", clutch: "Clutch", wallet: "Πορτοφόλι",
  sneakers: "Sneakers", sneaker: "Sneakers", loafers: "Loafers", pumps: "Pumps", sandals: "Σανδάλια",
  sunglasses: "Γυαλιά Ηλίου", earrings: "Σκουλαρίκια", necklace: "Κολιέ", bracelet: "Βραχιόλι", watch: "Ρολόι"
});

export function catalogueAiEnrichmentEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BLS_CATALOGUE_AI_ENRICHMENT_ENABLED === "true";
}

export function extractNovaVerifiedFacts(payload: Readonly<Record<string, unknown>>): VerifiedFactExtraction {
  const attributes = normalizeAttributes(payload.attributes);
  const defaultAttributes = normalizeAttributes(payload.defaultAttributes);
  const combined = new Map([...attributes, ...defaultAttributes]);
  const provenance: Record<string,string[]> = {};

  const brand = namedValue(payload.brand);
  if (brand) provenance.brand = ["brand.name"];

  const modelEntry = firstAttribute(combined,MODEL_KEYS);
  if (modelEntry) provenance.model = [`attributes.${modelEntry[0]}`];

  const typeEntry = firstAttribute(combined,TYPE_KEYS);
  const categoryType = lastNamedCategory(payload.categoryDetails) ?? lastNamedCategory(payload.categories);
  const productType = typeEntry?.[1] ?? categoryType;
  if (typeEntry) provenance.productType = [`attributes.${typeEntry[0]}`];
  else if (categoryType) provenance.productType = ["categoryDetails/categories"];

  const colorEntry = firstAttribute(combined,COLOR_KEYS);
  if (colorEntry) provenance.color = [`attributes.${colorEntry[0]}`];

  const materialEntries = allAttributes(combined,MATERIAL_KEYS);
  const materials = unique(materialEntries.flatMap(([,value]) => splitList(value)));
  if (materialEntries.length) provenance.materials = materialEntries.map(([key]) => `attributes.${key}`);

  const seasonEntry = firstAttribute(combined,SEASON_KEYS);
  if (seasonEntry) provenance.season = [`attributes.${seasonEntry[0]}`];

  const featureEntries = allAttributes(combined,FEATURE_KEYS);
  const features = unique(featureEntries.flatMap(([,value]) => splitList(value)));
  if (featureEntries.length) provenance.features = featureEntries.map(([key]) => `attributes.${key}`);

  const gender = namedValue(payload.gender);
  if (gender) provenance.gender = ["gender.name"];
  const condition = namedValue(payload.condition);
  if (condition) provenance.condition = ["condition.name"];

  const dimensions = shippingDimensions(payload.shipping);
  if (Object.keys(dimensions).length) provenance.dimensions = ["shipping.dimensions"];

  return {
    facts: {
      brand,
      model: modelEntry?.[1] ?? null,
      productType,
      color: colorEntry?.[1] ?? null,
      materials,
      dimensions,
      season: seasonEntry?.[1] ?? null,
      gender,
      condition,
      features,
      claims: []
    },
    provenance
  };
}

/**
 * Hash only merchandising-relevant evidence. Prices, stock, availability and
 * variant quantities deliberately do not participate, so routine stock syncs do
 * not trigger expensive copy regeneration.
 */
export function catalogueEnrichmentSourceHash(
  payload: Readonly<Record<string, unknown>>,
  facts: VerifiedProductFacts
): string {
  const evidence = {
    facts,
    sourceTitle: text(payload.name),
    sourceDescription: normalizeSourceText(payload.description),
    attributes: payload.attributes ?? null,
    defaultAttributes: payload.defaultAttributes ?? null,
    categories: payload.categories ?? null,
    categoryDetails: payload.categoryDetails ?? null,
    brand: payload.brand ?? null,
    gender: payload.gender ?? null,
    condition: payload.condition ?? null,
    shippingDimensions: record(payload.shipping).dimensions ?? null
  };
  return createHash("sha256").update(stableStringify(evidence)).digest("hex");
}

export function buildDeterministicGreekPresentation(facts: VerifiedProductFacts): DeterministicPresentation {
  const identity = [facts.brand,facts.model].filter((value): value is string => Boolean(value)).join(" ");
  const productType = translate(PRODUCT_TYPE_EL,facts.productType) ?? facts.productType;
  const color = translate(COLOR_EL,facts.color) ?? facts.color;
  const material = facts.materials.length ? (translate(MATERIAL_EL,facts.materials[0]) ?? facts.materials[0]) : null;

  const descriptive = [productType,color ? `σε ${color}` : null].filter(Boolean).join(" ");
  const titleEl = identity && descriptive ? `${identity} – ${descriptive}` : identity || descriptive || "Προϊόν";
  const fragments = [
    facts.brand ? `Προϊόν της ${facts.brand}` : null,
    facts.model ? `σειρά/μοντέλο ${facts.model}` : null,
    productType ? `τύπος ${productType}` : null,
    color ? `χρώμα ${color}` : null,
    material ? `υλικό ${material}` : null
  ].filter((value): value is string => Boolean(value));

  const specifications: Record<string,string> = {};
  if (facts.season) specifications["Συλλογή"] = facts.season;
  if (facts.color) specifications["Χρώμα"] = color ?? facts.color;
  if (facts.materials.length) specifications["Υλικό"] = facts.materials.map((value) => translate(MATERIAL_EL,value) ?? value).join(", ");
  if (Object.keys(facts.dimensions).length) specifications["Διαστάσεις"] = formatDimensions(facts.dimensions);
  if (facts.brand) specifications["Μάρκα"] = facts.brand;

  return {
    titleEl,
    shortDescriptionEl: fragments.length ? `${fragments.join(", ")}.` : null,
    specificationsEl: specifications
  };
}

export function buildBazaarPresentationOverlay(payload: Readonly<Record<string, unknown>>): BazaarPresentationOverlay {
  const classification = classifyNovaSupplierCondition(payload);
  return {
    commerceChannel: classification.commerceChannel,
    condition: classification.condition,
    bazaarSource: classification.bazaarSource,
    supplierCondition: namedValue(payload.condition)
  };
}

export function validateCatalogueEnrichmentDraft(
  facts: VerifiedProductFacts,
  draft: CatalogueEnrichmentDraft
): readonly string[] {
  const errors: string[] = [];
  const generated = [draft.titleEl,draft.shortDescriptionEl,draft.descriptionEl,draft.titleEn,draft.shortDescriptionEn,draft.descriptionEn]
    .filter((value): value is string => Boolean(value)).join(" ");

  const allowedNumbers = new Set(numericTokens(stableStringify(facts)));
  for (const number of numericTokens(generated)) {
    if (!allowedNumbers.has(number)) errors.push(`unsupported_number:${number}`);
  }

  const lowered = generated.normalize("NFKC").toLowerCase();
  const restrictedClaims = ["αυθεντικ","γνήσι","πιστοποιημ","χειροποίητ","limited edition","certified authentic"];
  if (facts.claims.length === 0) {
    for (const claim of restrictedClaims) {
      if (lowered.includes(claim)) errors.push(`unsupported_claim:${claim}`);
    }
  }

  for (const [source,greek] of Object.entries(MATERIAL_EL)) {
    if (lowered.includes(greek.toLowerCase()) && !facts.materials.some((value) => normalize(value).includes(source))) {
      errors.push(`unsupported_material:${source}`);
    }
  }
  return unique(errors);
}

function normalizeAttributes(value: unknown): Map<string,string> {
  const output = new Map<string,string>();
  if (!Array.isArray(value)) return output;
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string,unknown>;
    const key = normalizeKey(text(row.name) ?? text(row.slug) ?? text(row.key) ?? "");
    const valueText = scalarAttribute(row.option) ?? scalarAttribute(row.value) ?? scalarAttribute(row.options);
    if (key && valueText) output.set(key,valueText);
  }
  return output;
}

function firstAttribute(attributes: Map<string,string>, keys: ReadonlySet<string>): readonly [string,string] | null {
  for (const [key,value] of attributes) if (keys.has(key)) return [key,value];
  return null;
}

function allAttributes(attributes: Map<string,string>, keys: ReadonlySet<string>): readonly (readonly [string,string])[] {
  return [...attributes].filter(([key]) => keys.has(key));
}

function lastNamedCategory(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (let index=value.length-1; index>=0; index -= 1) {
    const item = value[index];
    if (typeof item === "string" && item.trim()) return item.trim();
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const named = namedValue(item);
      if (named) return named;
    }
  }
  return null;
}

function shippingDimensions(value: unknown): Record<string,string | number> {
  const dimensions = record(record(value).dimensions);
  const output: Record<string,string | number> = {};
  for (const key of ["length","width","height","depth","unit"] as const) {
    const candidate = dimensions[key];
    if ((typeof candidate === "string" && candidate.trim()) || (typeof candidate === "number" && Number.isFinite(candidate))) output[key] = candidate as string | number;
  }
  return output;
}

function formatDimensions(value: Readonly<Record<string,string | number>>): string {
  const ordered = [value.width,value.height,value.depth ?? value.length].filter((item) => item !== undefined && item !== null && String(item).trim());
  const unit = value.unit ? ` ${String(value.unit)}` : "";
  return ordered.length ? `${ordered.join(" × ")}${unit}` : Object.entries(value).map(([key,item]) => `${key}: ${item}`).join(", ");
}

function translate(dictionary: Readonly<Record<string,string>>, value: string | null): string | null {
  if (!value) return null;
  return dictionary[normalize(value)] ?? null;
}

function splitList(value: string): string[] {
  return value.split(/\||,|;|\//g).map((item) => item.trim()).filter(Boolean);
}

function numericTokens(value: string): string[] {
  return value.match(/\d+(?:[.,]\d+)?/g)?.map((token) => token.replace(",",".")) ?? [];
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([left],[right]) => left.localeCompare(right)).map(([key,item]) => [key,stableValue(item)]));
}

function normalizeSourceText(value: unknown): string | null {
  const source = text(value);
  return source ? source.replace(/<[^>]*>/g," ").replace(/&nbsp;/gi," ").replace(/\s+/g," ").trim() : null;
}

function namedValue(value: unknown): string | null {
  if (typeof value === "string") return text(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string,unknown>;
  return text(row.name) ?? text(row.label) ?? text(row.value) ?? text(row.title);
}

function scalarAttribute(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return text(value);
  if (Array.isArray(value)) {
    const items = value.map(scalarAttribute).filter((item): item is string => Boolean(item));
    return items.length ? items.join("|") : null;
  }
  return null;
}

function normalizeKey(value: string): string {
  return normalize(value).replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").replace(/^colour$/, "color");
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g," ");
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function record(value: unknown): Record<string,unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {};
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
