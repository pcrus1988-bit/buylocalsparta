import type { OpenIcecatIndexEntry, OpenIcecatIndexFilter } from "./types.ts";
import { asBoolean, firstText, isValidGtin, normalizeGtin, stripContentToken } from "./utils.ts";

export function parseOpenIcecatIndexCsv(csv: string, filter: OpenIcecatIndexFilter = {}): OpenIcecatIndexEntry[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter = detectDelimiter(lines[0]);
  const headers = parseDelimitedLine(lines[0], delimiter).map((value) => value.trim().toLowerCase());
  const entries: OpenIcecatIndexEntry[] = [];
  for (const line of lines.slice(1)) {
    const values = parseDelimitedLine(line, delimiter);
    const row: Record<string, string> = {};
    for (let index = 0; index < headers.length; index += 1) row[headers[index]] = values[index]?.trim() ?? "";
    const entry = openIcecatIndexEntryFromRow(row);
    if (entry && matchesOpenIcecatIndexFilter(entry, filter)) entries.push(entry);
  }
  return entries;
}

export function matchesOpenIcecatIndexFilter(entry: OpenIcecatIndexEntry, filter: OpenIcecatIndexFilter): boolean {
  if (filter.requireOnMarket && entry.onMarket !== true) return false;
  if (filter.requireApprovedGtin && (entry.gtinsApproved !== true || entry.gtins.length === 0)) return false;
  if (filter.country) {
    const country = filter.country.trim().toUpperCase();
    if (country && !entry.countryMarkets.includes(country)) return false;
  }
  if (filter.qualities?.length) {
    const allowed = new Set(filter.qualities.map((quality) => quality.trim().toUpperCase()).filter(Boolean));
    if (!entry.quality || !allowed.has(entry.quality.toUpperCase())) return false;
  }
  return entry.quality?.toUpperCase() !== "REMOVED";
}

function openIcecatIndexEntryFromRow(row: Readonly<Record<string, string>>): OpenIcecatIndexEntry | undefined {
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

function detectDelimiter(header: string): string {
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

function parseDelimitedLine(line: string, delimiter: string): string[] {
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
