import type { CatalogFulfilmentMode } from "./management.ts";

export type VendorProductImportRow = Readonly<{
  rowNumber: number;
  vendorSku?: string;
  categoryCode: string;
  title: string;
  brand?: string;
  model?: string;
  mpn?: string;
  gtin?: string;
  condition: "new" | "refurbished" | "used";
  attributes: Readonly<Record<string, string>>;
  supplierUnitPriceMinor: number;
  supplierTaxRateBps: number;
  stockOnHand: number;
  safetyStock: number;
  fulfilmentModes: readonly CatalogFulfilmentMode[];
  adviceAvailable: boolean;
}>;

export type VendorProductImportError = Readonly<{ rowNumber: number; field?: string; message: string }>;

export type VendorProductImportPreview = Readonly<{
  headers: readonly string[];
  rows: readonly VendorProductImportRow[];
  errors: readonly VendorProductImportError[];
  totalRows: number;
}>;

const REQUIRED = ["category_code", "title", "supplier_price_minor", "stock_on_hand"] as const;
const FULFILMENT = new Set<CatalogFulfilmentMode>(["pickup", "local_delivery", "shipping"]);

export function previewVendorProductCsv(csv: string): VendorProductImportPreview {
  if (!csv.trim()) throw new Error("CSV content is empty");
  const records = parseCsv(csv);
  if (records.length === 0) throw new Error("CSV has no records");
  const headers = records[0].map(normalizeHeader);
  const errors: VendorProductImportError[] = [];
  for (const required of REQUIRED) if (!headers.includes(required)) errors.push({ rowNumber: 1, field: required, message: `Missing required column '${required}'` });
  if (errors.length) return { headers, rows: [], errors, totalRows: Math.max(0, records.length - 1) };

  const rows: VendorProductImportRow[] = [];
  for (let i = 1; i < records.length; i += 1) {
    const raw = records[i];
    if (raw.every((value) => !value.trim())) continue;
    const rowNumber = i + 1;
    const data = Object.fromEntries(headers.map((header, index) => [header, raw[index]?.trim() ?? ""]));
    const rowErrors: VendorProductImportError[] = [];
    const categoryCode = data.category_code;
    const title = data.title;
    if (!categoryCode) rowErrors.push({ rowNumber, field: "category_code", message: "Category is required" });
    if (!title) rowErrors.push({ rowNumber, field: "title", message: "Title is required" });
    const supplierUnitPriceMinor = integerField(data.supplier_price_minor, rowNumber, "supplier_price_minor", rowErrors, false);
    const stockOnHand = integerField(data.stock_on_hand, rowNumber, "stock_on_hand", rowErrors, false);
    const safetyStock = integerField(data.safety_stock || "0", rowNumber, "safety_stock", rowErrors, false);
    const supplierTaxRateBps = integerField(data.supplier_tax_rate_bps || "2400", rowNumber, "supplier_tax_rate_bps", rowErrors, false);
    if (supplierTaxRateBps > 10000) rowErrors.push({ rowNumber, field: "supplier_tax_rate_bps", message: "Tax rate cannot exceed 10000 basis points" });
    if (safetyStock > stockOnHand) rowErrors.push({ rowNumber, field: "safety_stock", message: "Safety stock cannot exceed on-hand stock" });
    const condition = (data.condition || "new") as VendorProductImportRow["condition"];
    if (!(["new", "refurbished", "used"] as const).includes(condition)) rowErrors.push({ rowNumber, field: "condition", message: "Condition must be new, refurbished or used" });
    const fulfilmentModes = (data.fulfilment_modes || "pickup").split(/[|;]/).map((value) => value.trim()).filter(Boolean) as CatalogFulfilmentMode[];
    if (!fulfilmentModes.length || fulfilmentModes.some((value) => !FULFILMENT.has(value))) rowErrors.push({ rowNumber, field: "fulfilment_modes", message: "Fulfilment modes must use pickup, local_delivery or shipping" });
    const adviceValue = (data.advice_available || "false").toLowerCase();
    if (!["true", "false", "1", "0", "yes", "no"].includes(adviceValue)) rowErrors.push({ rowNumber, field: "advice_available", message: "Advice availability must be true/false" });
    const attributes = parseAttributes(data.attributes, rowNumber, rowErrors);

    errors.push(...rowErrors);
    if (rowErrors.length) continue;
    rows.push({
      rowNumber,
      vendorSku: data.vendor_sku || undefined,
      categoryCode,
      title,
      brand: data.brand || undefined,
      model: data.model || undefined,
      mpn: data.mpn || undefined,
      gtin: data.gtin || undefined,
      condition,
      attributes,
      supplierUnitPriceMinor,
      supplierTaxRateBps,
      stockOnHand,
      safetyStock,
      fulfilmentModes,
      adviceAvailable: ["true", "1", "yes"].includes(adviceValue)
    });
  }
  return { headers, rows, errors, totalRows: Math.max(0, records.length - 1) };
}

function integerField(value: string, rowNumber: number, field: string, errors: VendorProductImportError[], allowNegative: boolean): number {
  if (!/^-?\d+$/.test(value)) {
    errors.push({ rowNumber, field, message: `${field} must be an integer` });
    return 0;
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || (!allowNegative && number < 0)) {
    errors.push({ rowNumber, field, message: `${field} is outside the allowed integer range` });
    return 0;
  }
  return number;
}

function parseAttributes(value: string, rowNumber: number, errors: VendorProductImportError[]): Record<string, string> {
  if (!value) return {};
  const attributes: Record<string, string> = {};
  for (const pair of value.split("|")) {
    const separator = pair.indexOf("=");
    if (separator <= 0) {
      errors.push({ rowNumber, field: "attributes", message: "Attributes must use key=value pairs separated by |" });
      continue;
    }
    const key = pair.slice(0, separator).trim();
    const attributeValue = pair.slice(separator + 1).trim();
    if (!key || !attributeValue) errors.push({ rowNumber, field: "attributes", message: "Attribute keys and values cannot be empty" });
    else attributes[key] = attributeValue;
  }
  return attributes;
}

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field");
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}
