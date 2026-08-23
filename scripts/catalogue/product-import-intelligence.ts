import { createHash } from "node:crypto";

export type ProductImportCanonicalField = "supplier_code" | "gtin" | "brand" | "model" | "title" | "description" | "image_url" | "source_url" | "category" | "price" | "currency" | "stock" | "variant" | "specifications" | "compatibility";
export type ProductImportMapping = Readonly<{ sourceColumn: string; canonicalField: ProductImportCanonicalField; confidence: number; method: "header_exact" | "header_semantic" | "value_pattern" | "combined"; evidence: readonly string[] }>;
export type ProductImportColumnProfile = Readonly<{ name: string; nonEmpty: number; unique: number; sampleValues: readonly string[]; inferredType: "empty" | "text" | "integer" | "decimal" | "url" | "image_url" | "gtin" | "json" | "boolean" | "currency" }>;
export type ProductImportRowDecision = Readonly<{ rowNumber: number; identityConfidence: number; status: "ready_for_identity_matching" | "needs_mapping_review" | "quarantine"; reasons: readonly string[]; sourceKey: string }>;
export type ProductImportAnalysis = Readonly<{
  engineVersion: "product-import-intelligence-v1";
  sourceFilename: string;
  sourceSha256: string;
  delimiter: "," | ";" | "\t" | "|";
  headers: readonly string[];
  rowCount: number;
  mappings: readonly ProductImportMapping[];
  unmappedColumns: readonly string[];
  ambiguousColumns: readonly string[];
  columnProfiles: readonly ProductImportColumnProfile[];
  readiness: Readonly<{ mappedCoverage: number; identityCoverage: number; readyRows: number; reviewRows: number; quarantineRows: number; criticalIssues: readonly string[] }>;
  rowDecisions: readonly ProductImportRowDecision[];
  preview: readonly Record<string, string>[];
}>;

type CsvRow = Record<string, string>;
type FieldDefinition = Readonly<{ field: ProductImportCanonicalField; aliases: readonly string[] }>;

const FIELDS: readonly FieldDefinition[] = [
  { field: "supplier_code", aliases: ["supplier code", "supplier sku", "supplier id", "sku", "item code", "product code", "κωδικος", "κωδικος προιοντος", "κωδικος ειδους"] },
  { field: "gtin", aliases: ["gtin", "gtin13", "ean", "ean13", "barcode", "upc", "isbn"] },
  { field: "brand", aliases: ["brand", "manufacturer", "maker", "μαρκα", "κατασκευαστης"] },
  { field: "model", aliases: ["model", "model number", "mpn", "part number", "part no", "μοντελο"] },
  { field: "title", aliases: ["title", "product title", "name", "product name", "description short", "ονομα", "ονομασια", "τιτλος", "label"] },
  { field: "description", aliases: ["description", "long description", "product description", "details", "περιγραφη", "αναλυτικη περιγραφη"] },
  { field: "image_url", aliases: ["image", "image url", "image_url", "photo", "photo url", "picture", "picture url", "εικονα", "φωτογραφια"] },
  { field: "source_url", aliases: ["url", "product url", "source url", "source_url", "link", "product link", "σελιδα προιοντος"] },
  { field: "category", aliases: ["category", "categories", "product category", "taxonomy", "category path", "κατηγορια", "κατηγοριες"] },
  { field: "price", aliases: ["price", "retail price", "sale price", "recommended price", "rrp", "msrp", "unit price", "τιμη", "λιανικη"] },
  { field: "currency", aliases: ["currency", "currency code", "νομισμα"] },
  { field: "stock", aliases: ["stock", "quantity", "qty", "inventory", "availability", "διαθεσιμοτητα", "ποσοτητα"] },
  { field: "variant", aliases: ["variant", "variant attributes", "options", "option", "size color", "παραλλαγη", "χαρακτηριστικα παραλλαγης"] },
  { field: "specifications", aliases: ["specifications", "specs", "technical data", "attributes", "features", "τεχνικα χαρακτηριστικα", "χαρακτηριστικα"] },
  { field: "compatibility", aliases: ["compatibility", "compatible with", "compatible models", "fits", "platform", "συμβατοτητα", "συμβατα μοντελα"] }
];

const DELIMITERS = [",", ";", "\t", "|"] as const;
const MAX_ROWS = 50_000;

export function analyzeProductImport(text: string, sourceFilename = "upload.csv"): ProductImportAnalysis {
  if (!text.trim()) throw new Error("Product import file is empty");
  const delimiter = detectDelimiter(text);
  const { headers, rows } = parseDelimited(text, delimiter);
  if (rows.length > MAX_ROWS) throw new Error(`Product import exceeds the ${MAX_ROWS.toLocaleString("en-US")}-row analysis limit`);
  const profiles = headers.map((name) => profile(name, rows));
  const candidates = profiles.flatMap(mappingCandidates);
  const mappings = resolveMappings(candidates);
  const mapped = new Set(mappings.map((item) => item.sourceColumn));
  const ambiguousColumns = ambiguous(candidates, mappings);
  const mappingByField = new Map(mappings.map((item) => [item.canonicalField, item]));
  const rowDecisions = rows.slice(0, 500).map((row, index) => classify(row, index + 2, mappingByField, ambiguousColumns));
  const summary = summarize(rows, mappingByField, ambiguousColumns);
  const criticalIssues: string[] = [];
  if (!mappingByField.has("title")) criticalIssues.push("No reliable product title column was detected");
  if (!["gtin", "supplier_code", "model"].some((field) => mappingByField.has(field as ProductImportCanonicalField))) criticalIssues.push("No strong identity column (GTIN, supplier code or model) was detected");
  if (ambiguousColumns.length) criticalIssues.push(`${ambiguousColumns.length} source column(s) have ambiguous semantic mappings`);
  return {
    engineVersion: "product-import-intelligence-v1",
    sourceFilename,
    sourceSha256: createHash("sha256").update(text).digest("hex"),
    delimiter,
    headers,
    rowCount: rows.length,
    mappings,
    unmappedColumns: headers.filter((header) => !mapped.has(header)),
    ambiguousColumns,
    columnProfiles: profiles,
    readiness: { mappedCoverage: round(headers.length ? mapped.size / headers.length : 0), identityCoverage: round(summary.identified / Math.max(rows.length, 1)), readyRows: summary.ready, reviewRows: summary.review, quarantineRows: summary.quarantine, criticalIssues },
    rowDecisions,
    preview: rows.slice(0, 8)
  };
}

export function detectDelimiter(text: string): ProductImportAnalysis["delimiter"] {
  const sample = text.slice(0, 64 * 1024);
  let best: ProductImportAnalysis["delimiter"] = ",";
  let bestScore = -1;
  for (const delimiter of DELIMITERS) {
    try {
      const parsed = parseDelimited(sample, delimiter, 40);
      if (parsed.headers.length < 2) continue;
      const score = parsed.headers.length * 5 + parsed.rows.length;
      if (score > bestScore) { best = delimiter; bestScore = score; }
    } catch { /* try next */ }
  }
  return best;
}

export function parseDelimited(text: string, delimiter: ProductImportAnalysis["delimiter"], maxRows = MAX_ROWS): { headers: string[]; rows: CsvRow[] } {
  const matrix: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') { if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false; }
      else field += char;
      continue;
    }
    if (char === '"' && field.length === 0) quoted = true;
    else if (char === delimiter) { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); matrix.push(row); row = []; field = ""; if (matrix.length > maxRows + 1) break; }
    else field += char;
  }
  if (quoted) throw new Error("Product import ended inside a quoted field");
  if (matrix.length <= maxRows && (field.length || row.length)) { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); matrix.push(row); }
  while (matrix.length && matrix.at(-1)!.every((value) => value.trim() === "")) matrix.pop();
  if (!matrix.length) throw new Error("Product import is empty");
  const headers = matrix[0].map((value, index) => value.replace(/^\uFEFF/, "").trim() || `column_${index + 1}`);
  const dup = duplicates(headers);
  if (dup.length) throw new Error(`Product import has duplicate headers: ${dup.join(", ")}`);
  const rows = matrix.slice(1).filter((values) => values.some((value) => value.trim())).map((values, index) => {
    if (values.length !== headers.length) throw new Error(`Row ${index + 2} has ${values.length} columns; expected ${headers.length}`);
    return Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""]));
  });
  return { headers, rows };
}

function profile(name: string, rows: readonly CsvRow[]): ProductImportColumnProfile {
  const values = rows.map((row) => clean(row[name])).filter(Boolean);
  const sample = values.slice(0, 80);
  return { name, nonEmpty: values.length, unique: new Set(values).size, sampleValues: [...new Set(values)].slice(0, 5), inferredType: inferType(sample) };
}

function inferType(values: readonly string[]): ProductImportColumnProfile["inferredType"] {
  if (!values.length) return "empty";
  const share = (fn: (value: string) => boolean) => values.filter(fn).length / values.length;
  if (share(isImageUrl) >= 0.75) return "image_url";
  if (share(isUrl) >= 0.8) return "url";
  if (share(isValidGtin) >= 0.75) return "gtin";
  if (share(isJson) >= 0.8) return "json";
  if (share((value) => /^(true|false|yes|no|y|n|0|1)$/i.test(value)) >= 0.9) return "boolean";
  if (share((value) => /^[A-Z]{3}$/i.test(value)) >= 0.9) return "currency";
  if (share((value) => /^-?\d+$/.test(numberText(value))) >= 0.9) return "integer";
  if (share((value) => /^-?\d+(?:\.\d+)?$/.test(numberText(value))) >= 0.9) return "decimal";
  return "text";
}

function mappingCandidates(profile: ProductImportColumnProfile): ProductImportMapping[] {
  const header = semantic(profile.name);
  const result: ProductImportMapping[] = [];
  for (const definition of FIELDS) {
    let score = 0;
    let method: ProductImportMapping["method"] = "header_semantic";
    const evidence: string[] = [];
    for (const alias of definition.aliases) {
      const target = semantic(alias);
      if (header === target) { score = Math.max(score, 0.99); method = "header_exact"; evidence.push(`header exactly matches “${alias}”`); }
      else if (header.includes(target) || target.includes(header)) { score = Math.max(score, 0.86); evidence.push(`header semantically contains “${alias}”`); }
      else {
        const similarity = tokenSimilarity(header, target);
        if (similarity >= 0.6) { score = Math.max(score, 0.68 + similarity * 0.18); evidence.push(`header similarity ${Math.round(similarity * 100)}% to “${alias}”`); }
      }
    }
    const pattern = valuePatternConfidence(definition.field, profile.inferredType);
    if (pattern > 0) {
      const prior = score;
      score = prior > 0 ? Math.min(0.995, prior + (pattern - 0.7) * 0.45) : pattern;
      evidence.push(`values look like ${profile.inferredType}`);
      method = prior > 0 ? "combined" : "value_pattern";
    }
    if (score >= 0.58) result.push({ sourceColumn: profile.name, canonicalField: definition.field, confidence: round(score), method, evidence });
  }
  return result.sort((a, b) => b.confidence - a.confidence);
}

function valuePatternConfidence(field: ProductImportCanonicalField, type: ProductImportColumnProfile["inferredType"]): number {
  if (field === "gtin" && type === "gtin") return 0.96;
  if (field === "image_url" && type === "image_url") return 0.95;
  if (field === "source_url" && type === "url") return 0.88;
  if (field === "currency" && type === "currency") return 0.9;
  if (field === "specifications" && type === "json") return 0.66;
  if (field === "variant" && type === "json") return 0.62;
  if (field === "price" && ["decimal", "integer"].includes(type)) return 0.58;
  if (field === "stock" && ["integer", "boolean"].includes(type)) return 0.58;
  return 0;
}

function resolveMappings(candidates: readonly ProductImportMapping[]): ProductImportMapping[] {
  const result: ProductImportMapping[] = [];
  const usedColumns = new Set<string>();
  const usedFields = new Set<ProductImportCanonicalField>();
  for (const candidate of [...candidates].sort((a, b) => b.confidence - a.confidence || a.sourceColumn.localeCompare(b.sourceColumn))) {
    if (candidate.confidence < 0.7 || usedColumns.has(candidate.sourceColumn) || usedFields.has(candidate.canonicalField)) continue;
    result.push(candidate); usedColumns.add(candidate.sourceColumn); usedFields.add(candidate.canonicalField);
  }
  return result.sort((a, b) => FIELDS.findIndex((item) => item.field === a.canonicalField) - FIELDS.findIndex((item) => item.field === b.canonicalField));
}

function ambiguous(candidates: readonly ProductImportMapping[], resolved: readonly ProductImportMapping[]): string[] {
  const accepted = new Set(resolved.map((item) => item.sourceColumn));
  const grouped = new Map<string, ProductImportMapping[]>();
  for (const candidate of candidates) grouped.set(candidate.sourceColumn, [...(grouped.get(candidate.sourceColumn) ?? []), candidate]);
  return [...grouped].filter(([column, list]) => {
    const sorted = [...list].sort((a, b) => b.confidence - a.confidence);
    return sorted[1] ? sorted[0].confidence >= 0.7 && sorted[1].confidence >= 0.7 && sorted[0].confidence - sorted[1].confidence < 0.12 : !accepted.has(column) && sorted[0].confidence >= 0.62;
  }).map(([column]) => column).sort();
}

function classify(row: CsvRow, rowNumber: number, byField: Map<ProductImportCanonicalField, ProductImportMapping>, ambiguousColumns: readonly string[]): ProductImportRowDecision {
  const value = (field: ProductImportCanonicalField) => clean(byField.get(field) ? row[byField.get(field)!.sourceColumn] : "");
  const gtin = value("gtin"), supplier = value("supplier_code"), brand = value("brand"), model = value("model"), title = value("title");
  const reasons: string[] = [];
  let confidence = 0;
  if (gtin) { if (isValidGtin(gtin)) confidence = 0.99; else reasons.push("invalid_gtin"); }
  if (supplier && brand && model) confidence = Math.max(confidence, 0.94);
  if (brand && model && title) confidence = Math.max(confidence, 0.9);
  if (supplier && title) confidence = Math.max(confidence, 0.84);
  if (model && title) confidence = Math.max(confidence, 0.76);
  if (title) confidence = Math.max(confidence, 0.48);
  if (!title) reasons.push("missing_title");
  if (confidence < 0.75) reasons.push("weak_identity");
  if (ambiguousColumns.length) reasons.push("mapping_ambiguity");
  const status: ProductImportRowDecision["status"] = !title || confidence < 0.5 ? "quarantine" : reasons.includes("mapping_ambiguity") || confidence < 0.85 || reasons.includes("invalid_gtin") ? "needs_mapping_review" : "ready_for_identity_matching";
  const sourceKey = gtin && isValidGtin(gtin) ? `gtin:${digits(gtin)}` : supplier ? `supplier:${semantic(supplier)}` : `row:${createHash("sha256").update([brand, model, title, String(rowNumber)].join("|")).digest("hex").slice(0, 20)}`;
  return { rowNumber, identityConfidence: round(confidence), status, reasons: [...new Set(reasons)], sourceKey };
}

function summarize(rows: readonly CsvRow[], byField: Map<ProductImportCanonicalField, ProductImportMapping>, ambiguousColumns: readonly string[]) {
  let ready = 0, review = 0, quarantine = 0, identified = 0;
  rows.forEach((row, index) => {
    const decision = classify(row, index + 2, byField, ambiguousColumns);
    if (decision.identityConfidence >= 0.75) identified += 1;
    if (decision.status === "ready_for_identity_matching") ready += 1;
    else if (decision.status === "needs_mapping_review") review += 1;
    else quarantine += 1;
  });
  return { ready, review, quarantine, identified };
}

export function isValidGtin(value: string): boolean {
  const normalized = digits(value);
  if (![8, 12, 13, 14].includes(normalized.length)) return false;
  const numbers = normalized.split("").map(Number);
  const check = numbers.pop()!;
  let total = 0;
  for (let index = numbers.length - 1, position = 0; index >= 0; index -= 1, position += 1) total += numbers[index] * (position % 2 === 0 ? 3 : 1);
  return (10 - total % 10) % 10 === check;
}

function isUrl(value: string): boolean { try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } }
function isImageUrl(value: string): boolean { return isUrl(value) && /\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(value); }
function isJson(value: string): boolean { try { const parsed = JSON.parse(value); return parsed !== null && typeof parsed === "object"; } catch { return false; } }
function numberText(value: string): string { return value.trim().replace(/\s/g, "").replace(/(?<=\d),(?=\d{1,2}$)/, ".").replace(/[^\d.-]/g, ""); }
function clean(value: string | undefined): string { return (value ?? "").trim().replace(/\s+/gu, " "); }
function digits(value: string): string { return value.replace(/\D/g, ""); }
function semantic(value: string): string { return clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("el-GR").replace(/[_\-.]+/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }
function tokenSimilarity(a: string, b: string): number { const left = new Set(a.split(" ").filter(Boolean)), right = new Set(b.split(" ").filter(Boolean)); if (!left.size || !right.size) return 0; return [...left].filter((token) => right.has(token)).length / Math.max(left.size, right.size); }
function duplicates(values: readonly string[]): string[] { const seen = new Set<string>(), dup = new Set<string>(); for (const value of values) { if (seen.has(value)) dup.add(value); else seen.add(value); } return [...dup].sort(); }
function round(value: number): number { return Math.round(value * 1000) / 1000; }
