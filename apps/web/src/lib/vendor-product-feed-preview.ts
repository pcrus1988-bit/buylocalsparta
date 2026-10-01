import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  PostgresUnitOfWork,
  parseVendorProductXml,
  parseXmlCurrency,
  parseXmlMoneyMinor,
  parseXmlStock,
  type SessionPrincipal,
  type SqlRow,
  type VendorXmlFieldMapping,
  xmlFieldValue
} from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export const VENDOR_XML_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const VENDOR_XML_REMOTE_MAX_BYTES = 20 * 1024 * 1024;
export const VENDOR_XML_MAX_PRODUCTS = 5_000;

export type VendorProductFeedCategory = Readonly<{ id: string; code: string; name: string }>;
export type VendorProductFeedPreviewError = Readonly<{ rowNumber: number; externalId?: string; field?: string; message: string }>;
export type VendorProductFeedNormalizedRow = Readonly<{
  rowNumber: number;
  externalId: string;
  vendorSku?: string;
  title: string;
  description?: string;
  brand?: string;
  model?: string;
  mpn?: string;
  gtin?: string;
  condition: string;
  categoryCode: string;
  sourceCategory?: string;
  priceMinor: number;
  currency: "EUR";
  stockOnHand: number;
  imageUrl?: string;
  productUrl?: string;
  sourceHash: string;
}>;
export type VendorProductFeedPreview = Readonly<{
  itemTag: string;
  fields: readonly string[];
  mapping: VendorXmlFieldMapping;
  sourceCategories: readonly string[];
  categories: readonly VendorProductFeedCategory[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  sample: readonly VendorProductFeedNormalizedRow[];
  errors: readonly VendorProductFeedPreviewError[];
}>;
export type VendorProductFeedMappingInput = Readonly<{
  fieldMapping?: VendorXmlFieldMapping;
  categoryMapping?: Readonly<Record<string, string>>;
  defaultCategoryCode?: string;
}>;
export type VendorProductFeedPreparedRow = VendorProductFeedNormalizedRow & Readonly<{ payload: Record<string, unknown> }>;
export type VendorProductFeedPreparedPreview = Readonly<{
  preview: VendorProductFeedPreview;
  rows: readonly VendorProductFeedPreparedRow[];
}>;

const sql = (...parts: string[]) => parts.join(" ");

function uow() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, {
    statementTimeoutMs: 60_000,
    lockTimeoutMs: 5_000
  });
}

function requiredVendorId(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}

function trimOptional(value: string | undefined, max: number): string | undefined {
  const result = value?.trim();
  return result ? result.slice(0, max) : undefined;
}

function normalizeCategoryKey(value: string): string {
  return value.trim().toLocaleLowerCase("el").replace(/\s+/g, " ");
}

function normalizeCondition(value: string | undefined): string {
  const raw = value?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!raw || raw === "new" || raw === "καινούριο" || raw === "καινουργιο") return "new";
  if (["used", "preowned", "pre_owned", "μεταχειρισμένο", "μεταχειρισμενο"].includes(raw)) return "used";
  if (["refurbished", "ανακατασκευασμένο", "ανακατασκευασμενο"].includes(raw)) return "refurbished";
  return "new";
}

function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function cleanMapping(input: VendorXmlFieldMapping | undefined, suggested: VendorXmlFieldMapping): VendorXmlFieldMapping {
  const allowed: readonly (keyof VendorXmlFieldMapping)[] = [
    "externalId", "vendorSku", "title", "description", "brand", "model", "mpn", "gtin",
    "price", "currency", "stock", "availability", "categoryCode", "sourceCategory",
    "imageUrl", "productUrl", "condition"
  ];
  const result: Partial<Record<keyof VendorXmlFieldMapping, string>> = { ...suggested };
  if (input) {
    for (const key of allowed) {
      const value = input[key];
      if (typeof value !== "string") continue;
      if (value.trim()) result[key] = value.trim();
      else delete result[key];
    }
  }
  return result;
}

async function categoriesForVendor(principal: SessionPrincipal): Promise<readonly VendorProductFeedCategory[]> {
  const vendorId = requiredVendorId(principal);
  return uow().withTransaction({ actorUserId: principal.userId, vendorId }, async (tx) => {
    const result = await tx.query<SqlRow>(sql(
      "SELECT c.id::text AS id,c.code,COALESCE(el.name,en.name,c.code) AS name",
      "FROM categories c",
      "LEFT JOIN category_translations el ON el.category_id=c.id AND el.locale='el'",
      "LEFT JOIN category_translations en ON en.category_id=c.id AND en.locale='en'",
      "WHERE c.active=true AND c.assignable=true",
      "AND (c.market_id IS NULL OR c.market_id=(SELECT market_id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1))",
      "ORDER BY COALESCE(el.name,en.name,c.code),c.code"
    ), [vendorId]);
    return result.rows.map((row) => ({ id: String(row.id), code: String(row.code), name: String(row.name) }));
  }, { readOnly: true });
}

export async function prepareVendorProductFeed(
  principal: SessionPrincipal,
  xml: string,
  input: VendorProductFeedMappingInput = {}
): Promise<VendorProductFeedPreparedPreview> {
  if (Buffer.byteLength(xml, "utf8") > VENDOR_XML_REMOTE_MAX_BYTES) throw new Error("Το XML υπερβαίνει το μέγιστο υποστηριζόμενο μέγεθος των 20 MB.");
  const parsed = parseVendorProductXml(xml);
  if (parsed.records.length > VENDOR_XML_MAX_PRODUCTS) {
    throw new Error("Το XML περιέχει " + parsed.records.length + " προϊόντα. Το όριο ανά feed είναι " + VENDOR_XML_MAX_PRODUCTS.toLocaleString("el-GR") + ".");
  }

  const categories = await categoriesForVendor(principal);
  const mapping = cleanMapping(input.fieldMapping, parsed.suggestedMapping);
  const byCode = new Map(categories.map((category) => [category.code.toLowerCase(), category]));
  const byName = new Map<string, VendorProductFeedCategory>();
  for (const category of categories) {
    const key = normalizeCategoryKey(category.name);
    if (!byName.has(key)) byName.set(key, category);
  }

  const defaultCategory = input.defaultCategoryCode?.trim()
    ? byCode.get(input.defaultCategoryCode.trim().toLowerCase())
    : undefined;
  if (input.defaultCategoryCode?.trim() && !defaultCategory) throw new Error("Η προεπιλεγμένη κατηγορία δεν είναι διαθέσιμη για αυτόν τον vendor.");

  const categoryMapping = input.categoryMapping ?? {};
  const errors: VendorProductFeedPreviewError[] = [];
  const valid: VendorProductFeedPreparedRow[] = [];
  const sourceCategories = new Set<string>();
  const seenIds = new Set<string>();

  for (const record of parsed.records) {
    const externalId = trimOptional(
      xmlFieldValue(record, mapping.externalId)
      ?? xmlFieldValue(record, mapping.vendorSku)
      ?? xmlFieldValue(record, mapping.gtin),
      300
    );
    const vendorSku = trimOptional(xmlFieldValue(record, mapping.vendorSku), 300);
    const gtin = trimOptional(xmlFieldValue(record, mapping.gtin), 64);
    const title = trimOptional(xmlFieldValue(record, mapping.title), 500);
    const priceRaw = xmlFieldValue(record, mapping.price);
    const priceMinor = parseXmlMoneyMinor(priceRaw);
    const currency = parseXmlCurrency(xmlFieldValue(record, mapping.currency), priceRaw);
    const stockOnHand = parseXmlStock(xmlFieldValue(record, mapping.stock), xmlFieldValue(record, mapping.availability));
    const sourceCategory = trimOptional(xmlFieldValue(record, mapping.sourceCategory), 500);
    if (sourceCategory) sourceCategories.add(sourceCategory);

    const explicitCategory = trimOptional(xmlFieldValue(record, mapping.categoryCode), 160);
    let category = explicitCategory ? byCode.get(explicitCategory.toLowerCase()) : undefined;
    if (!category && sourceCategory) {
      const mappedCode = categoryMapping[sourceCategory] ?? categoryMapping[normalizeCategoryKey(sourceCategory)];
      if (mappedCode) category = byCode.get(mappedCode.trim().toLowerCase());
      if (!category) category = byCode.get(sourceCategory.toLowerCase()) ?? byName.get(normalizeCategoryKey(sourceCategory));
      if (!category && sourceCategory.includes(">")) {
        const leaf = sourceCategory.split(">").at(-1)?.trim();
        if (leaf) category = byName.get(normalizeCategoryKey(leaf));
      }
    }
    category ??= defaultCategory;

    const rowErrors: VendorProductFeedPreviewError[] = [];
    const fail = (field: string, message: string) => rowErrors.push({ rowNumber: record.index, externalId, field, message });
    if (!externalId) fail("id", "Λείπει σταθερό product ID, SKU ή GTIN.");
    else if (seenIds.has(externalId)) fail("id", "Το ίδιο product ID εμφανίζεται περισσότερες από μία φορές στο XML.");
    if (!title) fail("title", "Λείπει τίτλος προϊόντος.");
    if (priceMinor === undefined) fail("price", "Η τιμή λείπει ή δεν είναι έγκυρη.");
    if (currency !== "EUR") fail("currency", "Το KONTA MOU δέχεται τιμές EUR. Βρέθηκε " + currency + ".");
    if (stockOnHand === undefined) fail("stock", "Λείπει έγκυρο απόθεμα ή availability.");
    if (!category) fail("category", "Δεν βρέθηκε αντιστοίχιση κατηγορίας. Επίλεξε προεπιλεγμένη κατηγορία ή mapping.");
    if (externalId) seenIds.add(externalId);
    if (rowErrors.length) {
      errors.push(...rowErrors);
      continue;
    }

    const payload = {
      feedExternalId: externalId,
      vendorSku,
      title,
      description: trimOptional(xmlFieldValue(record, mapping.description), 10_000),
      brand: trimOptional(xmlFieldValue(record, mapping.brand), 200),
      model: trimOptional(xmlFieldValue(record, mapping.model), 300),
      mpn: trimOptional(xmlFieldValue(record, mapping.mpn), 300),
      gtin,
      condition: normalizeCondition(xmlFieldValue(record, mapping.condition)),
      categoryCode: category!.code,
      sourceCategory,
      priceMinor,
      currency: "EUR",
      stockOnHand,
      imageUrl: safeHttpUrl(xmlFieldValue(record, mapping.imageUrl)),
      productUrl: safeHttpUrl(xmlFieldValue(record, mapping.productUrl))
    };
    valid.push({
      rowNumber: record.index,
      externalId: externalId!,
      vendorSku,
      title: title!,
      description: payload.description,
      brand: payload.brand,
      model: payload.model,
      mpn: payload.mpn,
      gtin,
      condition: payload.condition,
      categoryCode: category!.code,
      sourceCategory,
      priceMinor: priceMinor!,
      currency: "EUR",
      stockOnHand: stockOnHand!,
      imageUrl: payload.imageUrl,
      productUrl: payload.productUrl,
      sourceHash: hash(payload),
      payload
    });
  }

  return {
    preview: {
      itemTag: parsed.itemTag,
      fields: parsed.fields,
      mapping,
      sourceCategories: [...sourceCategories].sort((a, b) => a.localeCompare(b, "el")).slice(0, 200),
      categories,
      totalRows: parsed.records.length,
      validRows: valid.length,
      errorRows: parsed.records.length - valid.length,
      sample: valid.slice(0, 50).map(({ payload: _payload, ...row }) => row),
      errors: errors.slice(0, 150)
    },
    rows: valid
  };
}

export async function previewVendorProductFeed(
  principal: SessionPrincipal,
  xml: string,
  input: VendorProductFeedMappingInput = {}
): Promise<VendorProductFeedPreview> {
  return (await prepareVendorProductFeed(principal, xml, input)).preview;
}

export function normalizeVendorFeedUrl(value: string | undefined): string {
  if (!value?.trim()) throw new Error("Δώσε το URL του XML feed.");
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Το XML feed URL δεν είναι έγκυρο.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Το XML feed URL πρέπει να είναι HTTP ή HTTPS.");
  if (url.username || url.password) throw new Error("Credentials μέσα στο XML URL δεν υποστηρίζονται.");
  url.hash = "";
  return url.toString();
}

export async function fetchVendorXml(rawUrl: string): Promise<string> {
  let url = new URL(normalizeVendorFeedUrl(rawUrl));
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    await assertPublicUrl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "application/xml,text/xml,application/rss+xml,text/plain;q=0.8,*/*;q=0.2",
          "user-agent": "KONTAMOU-VendorFeed/1.0 (+https://kontamou.site/)"
        }
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirect === 3) throw new Error("Το XML URL κάνει μη έγκυρη ή υπερβολική ανακατεύθυνση.");
        url = new URL(location, url);
        continue;
      }
      if (!response.ok) throw new Error("Το XML URL επέστρεψε HTTP " + response.status + ".");
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (Number.isFinite(declared) && declared > VENDOR_XML_REMOTE_MAX_BYTES) throw new Error("Το XML URL υπερβαίνει το μέγιστο μέγεθος των 20 MB.");
      if (!response.body) return await response.text();

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        total += part.value.byteLength;
        if (total > VENDOR_XML_REMOTE_MAX_BYTES) {
          await reader.cancel();
          throw new Error("Το XML URL υπερβαίνει το μέγιστο μέγεθος των 20 MB.");
        }
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Δεν ήταν δυνατή η λήψη του XML.");
}

async function assertPublicUrl(url: URL) {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || !hostname.includes(".")) {
    throw new Error("Το XML URL πρέπει να είναι δημόσια προσβάσιμο.");
  }
  if (isIP(hostname)) {
    if (!isPublicIp(hostname)) throw new Error("Το XML URL δείχνει σε μη δημόσια διεύθυνση.");
    return;
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isPublicIp(entry.address))) throw new Error("Το XML URL επιλύεται σε μη δημόσια διεύθυνση.");
}

function isPublicIp(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 0 || b === 168)) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  if (kind === 6) {
    const value = address.toLowerCase();
    if (value === "::" || value === "::1") return false;
    if (value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value)) return false;
    if (value.startsWith("::ffff:")) return isPublicIp(value.slice(7));
    return !value.startsWith("2001:db8:");
  }
  return false;
}
