import { createHash } from "node:crypto";
import {
  analyzeProductImport,
  isValidGtin,
  parseDelimited,
  type ProductImportCanonicalField,
  type ProductImportMapping,
  type ProductImportRowDecision
} from "./product-import-intelligence.ts";

export type ProductImportNormalizedFields = Readonly<{
  supplierCode?: string;
  gtin?: string;
  brand?: string;
  model?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  sourceUrl?: string;
  categoryPath: readonly string[];
  priceMinor?: number;
  currency?: string;
  stockQuantity?: number;
  stockStatus?: string;
  variantAttributes: Readonly<Record<string, unknown>>;
  specifications: Readonly<Record<string, unknown>>;
  compatibility: readonly string[];
}>;

export type ProductImportNormalizedRow = Readonly<{
  rowNumber: number;
  sourceKey: string;
  identityConfidence: number;
  triageStatus: ProductImportRowDecision["status"];
  reasons: readonly string[];
  normalized: ProductImportNormalizedFields;
  raw: Readonly<Record<string, string>>;
}>;

export type ProductImportNormalization = Readonly<{
  normalizerVersion: "product-import-normalization-v1";
  analysis: ReturnType<typeof analyzeProductImport>;
  profileKey: string;
  duplicateSourceKeys: readonly string[];
  rows: readonly ProductImportNormalizedRow[];
}>;

export function normalizeProductImport(text: string, sourceFilename = "upload.csv"): ProductImportNormalization {
  const analysis = analyzeProductImport(text, sourceFilename);
  const parsed = parseDelimited(text, analysis.delimiter);
  const byField = new Map(analysis.mappings.map((mapping) => [mapping.canonicalField, mapping]));
  const baseRows = parsed.rows.map((row, index) => normalizeRow(row, index + 2, byField));

  const counts = new Map<string, number>();
  for (const row of baseRows) counts.set(row.sourceKey, (counts.get(row.sourceKey) ?? 0) + 1);
  const duplicateSourceKeys = [...counts].filter(([, count]) => count > 1).map(([key]) => key).sort();

  const duplicateSet = new Set(duplicateSourceKeys);
  const rows = baseRows.map((row) => {
    if (!duplicateSet.has(row.sourceKey)) return row;
    return {
      ...row,
      triageStatus: row.triageStatus === "quarantine" ? "quarantine" : "needs_mapping_review",
      reasons: [...new Set([...row.reasons, "duplicate_source_key"])]
    } satisfies ProductImportNormalizedRow;
  });

  const profileKey = createHash("sha256").update(JSON.stringify({
    delimiter: analysis.delimiter,
    headers: analysis.headers,
    mappings: analysis.mappings.map((mapping) => [mapping.sourceColumn, mapping.canonicalField, mapping.confidence])
  })).digest("hex");

  return {
    normalizerVersion: "product-import-normalization-v1",
    analysis,
    profileKey,
    duplicateSourceKeys,
    rows
  };
}

function normalizeRow(
  row: Record<string, string>,
  rowNumber: number,
  byField: Map<ProductImportCanonicalField, ProductImportMapping>
): ProductImportNormalizedRow {
  const value = (field: ProductImportCanonicalField) => clean(byField.get(field) ? row[byField.get(field)!.sourceColumn] : "");
  const gtinRaw = value("gtin");
  const supplier = value("supplier_code");
  const brand = value("brand");
  const model = value("model");
  const title = value("title");
  const variant = value("variant");

  const reasons: string[] = [];
  let identityConfidence = 0;
  if (gtinRaw) {
    if (isValidGtin(gtinRaw)) identityConfidence = 0.99;
    else reasons.push("invalid_gtin");
  }
  if (supplier && brand && model) identityConfidence = Math.max(identityConfidence, 0.94);
  if (brand && model && title) identityConfidence = Math.max(identityConfidence, 0.90);
  if (supplier && title) identityConfidence = Math.max(identityConfidence, 0.84);
  if (model && title) identityConfidence = Math.max(identityConfidence, 0.76);
  if (title) identityConfidence = Math.max(identityConfidence, 0.48);
  if (!title) reasons.push("missing_title");
  if (identityConfidence < 0.75) reasons.push("weak_identity");

  let triageStatus: ProductImportRowDecision["status"];
  if (!title || identityConfidence < 0.5) triageStatus = "quarantine";
  else if (identityConfidence < 0.85 || reasons.includes("invalid_gtin")) triageStatus = "needs_mapping_review";
  else triageStatus = "ready_for_identity_matching";

  const gtin = gtinRaw && isValidGtin(gtinRaw) ? digits(gtinRaw) : undefined;
  const stock = parseStock(value("stock"));
  return {
    rowNumber,
    sourceKey: sourceIdentityKey({ gtin, supplier, brand, model, title, variant }),
    identityConfidence: round(identityConfidence),
    triageStatus,
    reasons: [...new Set(reasons)],
    normalized: {
      supplierCode: optional(supplier),
      gtin,
      brand: optional(brand),
      model: optional(model),
      title: optional(title),
      description: optional(value("description")),
      imageUrl: validUrlOrUndefined(value("image_url")),
      sourceUrl: validUrlOrUndefined(value("source_url")),
      categoryPath: categoryPath(value("category")),
      priceMinor: parsePriceMinor(value("price")),
      currency: normalizeCurrency(value("currency")),
      stockQuantity: stock.quantity,
      stockStatus: stock.status,
      variantAttributes: objectValue(variant),
      specifications: objectValue(value("specifications")),
      compatibility: listValue(value("compatibility"))
    },
    raw: row
  };
}

function sourceIdentityKey(input: { gtin?: string; supplier: string; brand: string; model: string; title: string; variant: string }): string {
  if (input.gtin) return `gtin:${input.gtin}`;
  if (input.supplier) {
    const identity = [semantic(input.supplier), semantic(input.brand), semantic(input.model)].filter(Boolean).join("|");
    return `supplier:${digest(identity)}`;
  }
  if (input.brand && input.model) return `model:${digest(`${semantic(input.brand)}|${semantic(input.model)}`)}`;
  return `fingerprint:${digest([semantic(input.brand), semantic(input.model), semantic(input.title), semantic(input.variant)].join("|"))}`;
}

function categoryPath(value: string): string[] {
  if (!value) return [];
  return value.split(/\s*(?:>|→|›|\||\s\/\s)\s*/u).map(clean).filter(Boolean);
}

function parsePriceMinor(value: string): number | undefined {
  if (!value) return undefined;
  let normalized = value.replace(/\s/g, "").replace(/[^\d,.\-]/g, "");
  if (!normalized) return undefined;
  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    if (comma > dot) normalized = normalized.replace(/\./g, "").replace(",", ".");
    else normalized = normalized.replace(/,/g, "");
  } else if (comma >= 0) {
    normalized = /,\d{1,2}$/.test(normalized) ? normalized.replace(",", ".") : normalized.replace(/,/g, "");
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  const minor = Math.round(amount * 100);
  return Number.isSafeInteger(minor) ? minor : undefined;
}

function parseStock(value: string): { quantity?: number; status?: string } {
  if (!value) return {};
  const normalized = semantic(value);
  if (["yes", "true", "available", "in stock", "διαθεσιμο", "διαθεσιμα"].includes(normalized)) return { status: "in_stock" };
  if (["no", "false", "unavailable", "out of stock", "μη διαθεσιμο"].includes(normalized)) return { status: "out_of_stock" };
  const number = Number(numberText(value));
  if (Number.isFinite(number) && number >= 0) return { quantity: Math.floor(number), status: number > 0 ? "in_stock" : "out_of_stock" };
  return { status: clean(value).slice(0, 120) };
}

function normalizeCurrency(value: string): string | undefined {
  const normalized = value.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(normalized)) return normalized;
  if (["€", "EURO"].includes(normalized)) return "EUR";
  return undefined;
}

function objectValue(value: string): Readonly<Record<string, unknown>> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch { /* preserve non-JSON text below */ }
  return { value };
}

function listValue(value: string): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return [...new Set(parsed.map((item) => clean(String(item))).filter(Boolean))];
  } catch { /* use delimited text */ }
  return [...new Set(value.split(/\s*(?:\||;|,)\s*/u).map(clean).filter(Boolean))];
}

function validUrlOrUndefined(value: string): string | undefined {
  if (!value) return undefined;
  try { return ["http:", "https:"].includes(new URL(value).protocol) ? value : undefined; } catch { return undefined; }
}

function numberText(value: string): string {
  return value.trim().replace(/\s/g, "").replace(/(?<=\d),(?=\d{1,2}$)/, ".").replace(/[^\d.-]/g, "");
}
function digest(value: string): string { return createHash("sha256").update(value).digest("hex").slice(0, 24); }
function optional(value: string): string | undefined { return value || undefined; }
function clean(value: string | undefined): string { return (value ?? "").trim().replace(/\s+/gu, " "); }
function digits(value: string): string { return value.replace(/\D/g, ""); }
function semantic(value: string): string {
  return clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("el-GR")
    .replace(/[_\-.]+/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function round(value: number): number { return Math.round(value * 1000) / 1000; }
