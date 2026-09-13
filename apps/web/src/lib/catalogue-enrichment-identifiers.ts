import { createHash } from "node:crypto";
import type { VerifiedProductFacts } from "./catalogue-enrichment";

export type CatalogueProductIdentifiers = Readonly<{
  gtins: readonly string[];
  mpn: string | null;
  styleCode: string | null;
}>;

export type CatalogueResearchEligibility = Readonly<{
  eligible: boolean;
  strength: "gtin" | "mpn" | "model" | "none";
  query: string | null;
  reason: string;
}>;

const GTIN_KEYS = new Set([
  "gtin","gtin8","gtin12","gtin13","gtin14","ean","ean8","ean13","upc","upca","barcode","bar_code"
]);
const MPN_KEYS = new Set([
  "mpn","manufacturer_part_number","manufacturerpartnumber","part_number","partnumber","manufacturer_code","manufacturer_sku"
]);
const STYLE_KEYS = new Set([
  "style_code","stylecode","style_number","stylenumber","model_code","modelcode","product_code","productcode","article_code","articlecode"
]);

export function extractCatalogueProductIdentifiers(payload: Readonly<Record<string,unknown>>): CatalogueProductIdentifiers {
  const direct = collectObjectCandidates(payload);
  const attributes = [...collectAttributeCandidates(payload.attributes),...collectAttributeCandidates(payload.defaultAttributes)];
  const variants = Array.isArray(payload.variants)
    ? payload.variants.flatMap((variant) => variant && typeof variant === "object" && !Array.isArray(variant)
      ? [...collectObjectCandidates(variant as Record<string,unknown>),...collectAttributeCandidates((variant as Record<string,unknown>).attributes)]
      : [])
    : [];
  const candidates = [...direct,...attributes,...variants];

  const gtins = unique(candidates
    .filter(([key]) => GTIN_KEYS.has(key))
    .flatMap(([,value]) => splitCandidates(value))
    .map(normalizeGtin)
    .filter((value): value is string => Boolean(value && isValidGtin(value))));
  const mpn = firstIdentifier(candidates,MPN_KEYS);
  const styleCode = firstIdentifier(candidates,STYLE_KEYS);
  return { gtins,mpn,styleCode };
}

export function isValidGtin(value: string): boolean {
  const gtin = normalizeGtin(value);
  if (!gtin || ![8,12,13,14].includes(gtin.length)) return false;
  const check = Number(gtin.at(-1));
  if (!Number.isInteger(check)) return false;
  let sum = 0;
  let weight = 3;
  for (let index=gtin.length-2; index>=0; index -= 1) {
    sum += Number(gtin[index]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10 === check;
}

export function catalogueResearchEligibility(input: Readonly<{
  identifiers: CatalogueProductIdentifiers;
  facts: VerifiedProductFacts;
  sourceTitle: string | null;
}>): CatalogueResearchEligibility {
  const brand = input.facts.brand?.trim() || null;
  if (input.identifiers.gtins.length) {
    return {
      eligible: true,
      strength: "gtin",
      query: [input.identifiers.gtins[0],brand].filter(Boolean).join(" "),
      reason: "valid_gtin"
    };
  }
  const code = input.identifiers.mpn ?? input.identifiers.styleCode;
  if (brand && code) {
    return { eligible: true,strength: "mpn",query: `${brand} ${code}`,reason: "brand_and_manufacturer_code" };
  }
  if (brand && input.facts.model && input.facts.model.trim().length >= 3) {
    return { eligible: true,strength: "model",query: `${brand} ${input.facts.model.trim()}`,reason: "brand_and_verified_model" };
  }
  return {
    eligible: false,
    strength: "none",
    query: null,
    reason: input.sourceTitle ? "no_strong_public_identity_key" : "insufficient_identity"
  };
}

export function catalogueResearchSourceHash(sourceHash: string,identifiers: CatalogueProductIdentifiers): string {
  return createHash("sha256").update(JSON.stringify({ sourceHash,identifiers })).digest("hex");
}

function collectObjectCandidates(value: Readonly<Record<string,unknown>>): [string,string][] {
  const output: [string,string][] = [];
  for (const [rawKey,rawValue] of Object.entries(value)) {
    const key = normalizeKey(rawKey);
    if (![...GTIN_KEYS,...MPN_KEYS,...STYLE_KEYS].includes(key)) continue;
    const scalar = scalarText(rawValue);
    if (scalar) output.push([key,scalar]);
  }
  const identifiers = value.identifiers;
  if (identifiers && typeof identifiers === "object" && !Array.isArray(identifiers)) {
    for (const [rawKey,rawValue] of Object.entries(identifiers as Record<string,unknown>)) {
      const key = normalizeKey(rawKey);
      const scalar = scalarText(rawValue);
      if (scalar) output.push([key,scalar]);
    }
  }
  return output;
}

function collectAttributeCandidates(value: unknown): [string,string][] {
  if (!Array.isArray(value)) return [];
  const output: [string,string][] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string,unknown>;
    const key = normalizeKey(scalarText(row.name) ?? scalarText(row.slug) ?? scalarText(row.key) ?? "");
    const val = scalarText(row.option) ?? scalarText(row.value) ?? scalarText(row.options);
    if (key && val) output.push([key,val]);
  }
  return output;
}

function firstIdentifier(candidates: readonly [string,string][],keys: ReadonlySet<string>): string | null {
  for (const [key,value] of candidates) {
    if (!keys.has(key)) continue;
    const clean = value.trim();
    if (clean.length >= 2 && clean.length <= 100) return clean;
  }
  return null;
}

function splitCandidates(value: string): string[] {
  return value.split(/[\s,;|/]+/g).map((part) => part.trim()).filter(Boolean);
}

function normalizeGtin(value: string): string | null {
  const digits = value.replace(/[\s-]+/g,"");
  return /^\d+$/.test(digits) ? digits : null;
}

function normalizeKey(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
}

function scalarText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    const flattened = value.map(scalarText).filter((item): item is string => Boolean(item));
    return flattened.length ? flattened.join(" ") : null;
  }
  if (value && typeof value === "object") {
    const row = value as Record<string,unknown>;
    return scalarText(row.name) ?? scalarText(row.value) ?? scalarText(row.label);
  }
  return null;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
