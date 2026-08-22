import { createHash } from "node:crypto";

export type CsvRow = Record<string, string>;

export const NIKOLAOU_REQUIRED_HEADERS = [
  "supplier_code", "gtin13", "model", "brand", "title", "master_description_el",
  "product_type", "source_url", "image_url", "supplier_categories", "app_category_code",
  "taxonomy_confidence", "variant_attributes_json", "specifications_json", "disambiguation_key",
  "platform", "compatibility_confidence", "explicit_compatible_models_all", "price_status",
  "recommended_price_minor", "improved_price_candidate_minor", "price_review_required",
  "data_quality_flags", "master_record_version", "last_researched_date"
] as const;

export function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const matrix: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"' && field.length === 0) quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); matrix.push(row); row = []; field = ""; }
    else field += char;
  }
  if (quoted) throw new Error("CSV ended inside a quoted field");
  if (field.length || row.length) { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); matrix.push(row); }
  while (matrix.length && matrix.at(-1)!.every((value) => value === "")) matrix.pop();
  if (!matrix.length) throw new Error("CSV is empty");
  const headers = matrix[0].map((value, index) => index === 0 ? value.replace(/^\uFEFF/, "") : value);
  const duplicateHeaders = duplicates(headers.filter(Boolean));
  if (duplicateHeaders.length) throw new Error(`CSV has duplicate headers: ${duplicateHeaders.join(", ")}`);
  if (headers.some((header) => !header)) throw new Error("CSV contains an empty header");
  const rows = matrix.slice(1).map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${values.length} columns; expected ${headers.length}`);
    return Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""]));
  });
  return { headers, rows };
}

export function assertNikolaouHeaders(headers: readonly string[]): void {
  const available = new Set(headers);
  const missing = NIKOLAOU_REQUIRED_HEADERS.filter((header) => !available.has(header));
  if (missing.length) throw new Error(`Nikolaou master is missing required columns: ${missing.join(", ")}`);
}

export function analyzeNikolaouRows(rows: readonly CsvRow[]) {
  const sourceKeys = rows.map(sourceProductKey);
  const taxonomyConfidence: Record<string, number> = {};
  for (const row of rows) {
    const key = text(row.taxonomy_confidence).toLowerCase() || "unknown";
    taxonomyConfidence[key] = (taxonomyConfidence[key] ?? 0) + 1;
  }
  return {
    rowCount: rows.length,
    pricedLegacy: rows.filter(hasLegacyPrice).length,
    unpricedLegacy: rows.filter((row) => !hasLegacyPrice(row)).length,
    improvedPriceCandidates: rows.filter((row) => minor(row.improved_price_candidate_minor) !== undefined).length,
    priceReviewRequired: rows.filter((row) => yes(row.price_review_required)).length,
    distinctSupplierCategories: new Set(rows.map((row) => text(row.supplier_categories) || "Uncategorized")).size,
    distinctAppCategories: new Set(rows.map((row) => text(row.app_category_code)).filter(Boolean)).size,
    taxonomyConfidence,
    compatibilityRows: rows.filter((row) => text(row.platform) || splitPipe(row.explicit_compatible_models_all).length).length,
    rowsWithStructuredAttributes: rows.filter((row) => Object.keys(jsonObject(row.variant_attributes_json)).length || Object.keys(jsonObject(row.specifications_json)).length).length,
    duplicateSourceKeys: duplicates(sourceKeys)
  };
}

export function sourceProductKey(row: CsvRow): string {
  const explicit = text(row.disambiguation_key);
  if (explicit) return explicit;
  const identity = [row.supplier_code, row.model, row.normalized_variant_signature, row.index].map(text).join("|");
  return `nikolaou:${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
}

export function sourceTaxonomyPath(value: string): string[] {
  const normalized = text(value);
  if (!normalized) return ["Uncategorized"];
  const parts = normalized.split(/\s*(?:>|\||\s\/\s)\s*/u).map(text).filter(Boolean);
  return parts.length ? parts : [normalized];
}

export function sourceTaxonomyKey(path: readonly string[]): string {
  return `nikolaou:${createHash("sha256").update(path.map((part) => part.toLocaleLowerCase("el-GR")).join(" > ")).digest("hex").slice(0, 20)}`;
}

export function confidence(value: string, fallback = 0.5): number {
  const normalized = text(value).toLowerCase();
  if (normalized === "high") return 0.95;
  if (normalized === "medium") return 0.75;
  if (normalized === "low") return 0.5;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

export function jsonObject(value: string): Record<string, unknown> {
  const normalized = text(value);
  if (!normalized) return {};
  try {
    const parsed = JSON.parse(normalized);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

export function structuredAttributes(row: CsvRow) {
  const result: Array<{ sourceKey: string; attributeCode: string; value: unknown; evidenceKind: "variant" | "specification" }> = [];
  for (const [key, value] of Object.entries(jsonObject(row.variant_attributes_json))) result.push({ sourceKey: `variant.${key}`, attributeCode: key, value, evidenceKind: "variant" });
  for (const [key, value] of Object.entries(jsonObject(row.specifications_json))) result.push({ sourceKey: `spec.${key}`, attributeCode: key, value, evidenceKind: "specification" });
  return result;
}

export function splitPipe(value: string): string[] {
  return [...new Set(text(value).split("|").map(text).filter(Boolean))];
}

export function minor(value: string): number | undefined {
  const normalized = text(value);
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && Number.isInteger(parsed) ? parsed : undefined;
}

export function hasLegacyPrice(row: CsvRow): boolean {
  return text(row.price_status).toLowerCase() !== "unpriced" && minor(row.recommended_price_minor) !== undefined;
}

export function normalizedSourceProduct(row: CsvRow): Record<string, unknown> {
  return compact({
    descriptionEl: text(row.master_description_el), supplierDescription: text(row.supplier_description), productType: text(row.product_type),
    supplierCategory: text(row.supplier_categories), appCategoryCode: text(row.app_category_code), taxonomyConfidence: text(row.taxonomy_confidence), taxonomyReason: text(row.taxonomy_reason),
    crawlStatus: text(row.crawl_status), descriptionQuality: text(row.description_quality), descriptionBasis: text(row.description_basis), descriptionSource: text(row.description_source), descriptionEvidenceUrl: text(row.description_evidence_url),
    specificationEvidenceUrls: splitPipe(row.specification_evidence_urls), includedItems: splitPipe(row.included_items), manualUrl: text(row.manual_url), sparePartsUrl: text(row.spare_parts_url), relatedModels: splitPipe(row.related_models),
    variantAttributes: jsonObject(row.variant_attributes_json), priceDrivers: jsonObject(row.price_driver_json), priceDriverSummary: text(row.price_driver_summary), priceDefiningAttributes: text(row.price_defining_attributes), normalizedVariantSignature: text(row.normalized_variant_signature),
    variantFamilyId: text(row.variant_family_id), variantFamilyModelHint: text(row.variant_family_model_hint), variantGroupSize: numberValue(row.variant_group_size), commercialUnitBasis: text(row.commercial_unit_basis), commercialPackQuantity: numberValue(row.commercial_pack_quantity),
    platform: text(row.platform), voltageFamily: text(row.voltage_family), batteryRequirementQty: numberValue(row.battery_requirement_qty), compatibilityType: text(row.compatibility_type), compatibilityConfidence: text(row.compatibility_confidence),
    compatibilityInterface: jsonObject(row.compatibility_interface_json), compatibilityRelationship: jsonObject(row.compatibility_relationship_json), masterRecordVersion: text(row.master_record_version), lastResearchedDate: text(row.last_researched_date)
  });
}

export function qualityPayload(row: CsvRow): Record<string, unknown> {
  return compact({
    specDiscrepancyFlags: splitPipe(row.spec_discrepancy_flags), compatibilityDiscrepancyFlags: splitPipe(row.compatibility_discrepancy_flags), dataQualityFlags: splitPipe(row.data_quality_flags), unresolvedCompatibilityTokens: splitPipe(row.unresolved_compatibility_tokens),
    supplierCodeCollisionCount: numberValue(row.supplier_code_collision_count), supplierCodeCollisionModels: splitPipe(row.supplier_code_collision_models), priceReviewRequired: yes(row.price_review_required), researchPriority: text(row.research_priority), researchPriorityReason: text(row.research_priority_reason), researchNotes: text(row.research_notes), compatibilityNotes: text(row.compatibility_notes), notes: text(row.notes)
  });
}

export function priceState(row: CsvRow): "unpriced" | "matched" | "review_required" {
  if (yes(row.price_review_required)) return "review_required";
  if (hasLegacyPrice(row)) return "matched";
  if (minor(row.improved_price_candidate_minor) !== undefined) return "review_required";
  return "unpriced";
}

export function text(value: string | undefined): string { return (value ?? "").trim().replace(/\s+/gu, " "); }
export function slugCode(value: string): string {
  const normalized = text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || createHash("sha256").update(normalized).digest("hex").slice(0, 20);
}
export function yes(value: string): boolean { return ["yes", "true", "1", "y"].includes(text(value).toLowerCase()); }

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== "" && (!Array.isArray(value) || value.length > 0) && !(typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0)));
}
function numberValue(value: string): number | undefined { const parsed = Number(text(value)); return text(value) && Number.isFinite(parsed) ? parsed : undefined; }
function duplicates(values: readonly string[]): string[] { const seen = new Set<string>(); const dup = new Set<string>(); for (const value of values) { if (seen.has(value)) dup.add(value); else seen.add(value); } return [...dup].sort(); }
