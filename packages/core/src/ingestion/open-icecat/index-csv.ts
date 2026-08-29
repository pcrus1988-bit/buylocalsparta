import type { OpenIcecatIndexEntry, OpenIcecatIndexFilter } from "./types.ts";
import { asBoolean, firstText, isValidGtin, normalizeGtin, stripContentToken } from "./utils.ts";

export function parseOpenIcecatIndexCsv(csv: string, filter: OpenIcecatIndexFilter = {}): OpenIcecatIndexEntry[] {
  const records = splitDelimitedRecords(csv).filter((record) => record.trim());
  if (!records.length) return [];
  const delimiter = detectDelimiter(records[0]);
  const headers = parseDelimitedLine(records[0], delimiter).map((value) => value.trim().toLowerCase());
  const entries: OpenIcecatIndexEntry[] = [];
  for (const record of records.slice(1)) {
    const entry = openIcecatIndexEntryFromRecord(record, headers, delimiter);
    if (entry && matchesOpenIcecatIndexFilter(entry, filter)) entries.push(entry);
  }
  return entries;
}

export function matchesOpenIcecatIndexFilter(entry: OpenIcecatIndexEntry, filter: OpenIcecatIndexFilter): boolean {
  const removed = entry.quality?.toUpperCase() === "REMOVED";
  if (removed && !filter.includeRemoved) return false;
  if (!removed && filter.requireOnMarket && entry.onMarket !== true) return false;
  if (!removed && filter.requireApprovedGtin && (entry.gtinsApproved !== true || entry.gtins.length === 0)) return false;
  if (!removed && filter.country) {
    const country = filter.country.trim().toUpperCase();
    if (country && !entry.countryMarkets.includes(country)) return false;
  }
  if (!removed && filter.qualities?.length) {
    const allowed = new Set(filter.qualities.map((quality) => quality.trim().toUpperCase()).filter(Boolean));
    if (!entry.quality || !allowed.has(entry.quality.toUpperCase())) return false;
  }
  return true;
}

export function openIcecatIndexEntryFromRecord(
  record: string,
  headers: readonly string[],
  delimiter: string
): OpenIcecatIndexEntry | undefined {
  const values = parseDelimitedLine(record, delimiter);
  const row: Record<string, string> = {};
  for (let index = 0; index < headers.length; index += 1) row[headers[index]] = values[index]?.trim() ?? "";
  return openIcecatIndexEntryFromRow(row);
}

export function openIcecatIndexEntryFromRow(row: Readonly<Record<string, string>>): OpenIcecatIndexEntry | undefined {
  const path = row.path?.trim();
  const productId = firstText(row.product_id, row.productid);
  if (!path || !productId) return undefined;
  const gtins = splitList(firstText(row.ean_upc, row.gtin, row.gtins)).map(normalizeGtin).filter(isValidGtin);
  const views = Number.parseInt(firstText(row.product_view, row.product_views) ?? "", 10);
  return {
    path,
    productId,
    updated: firstText(row.updated),
    quality: firstText(row.quality),
    supplierId: firstText(row.supplier_id),
    productCode: firstText(row.prod_id),
    categoryId: firstText(row.catid, row.category_id),
    mappedProductCode: firstText(row.m_prod_id),
    gtins: [...new Set(gtins)],
    onMarket: optionalBoolean(firstText(row.on_market)),
    countryMarkets: splitList(firstText(row.country_market)).map((country) => country.toUpperCase()),
    modelName: firstText(row.model_name),
    productViews: Number.isFinite(views) ? views : undefined,
    highPic: firstText(row.high_pic) ? stripContentToken(row.high_pic) : undefined,
    gtinsApproved: optionalBoolean(firstText(row.ean_upc_is_approved)),
    limited: optionalBoolean(firstText(row.limited))
  };
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(/[;,|]/).map((item) => item.trim()).filter(Boolean);
}

function optionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value === "") return undefined;
  return asBoolean(value);
}

export function detectDelimiter(header: string): string {
  const candidates = ["\t", ",", ";"] as const;
  let winner: string = ",";
  let highest = -1;
  for (const candidate of candidates) {
    const count = parseDelimitedLine(header, candidate).length;
    if (count > highest) {
      highest = count;
      winner = candidate;
    }
  }
  return winner;
}

export function parseDelimitedLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

export function splitDelimitedRecords(input: string): string[] {
  const records: string[] = [];
  let record = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      record += char;
      if (quoted && input[index + 1] === '"') {
        record += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      records.push(record);
      record = "";
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      continue;
    }
    record += char;
  }
  if (record.length) records.push(record);
  return records;
}
