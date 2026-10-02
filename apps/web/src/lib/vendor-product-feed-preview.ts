import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
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
  additionalImageUrls: readonly string[];
  productUrl?: string;
  itemGroupId?: string;
  size?: string;
  color?: string;
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
  observedExternalIds: readonly string[];
  reconciliationSafe: boolean;
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
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&gt;/gi, ">")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("el")
    .replace(/[^a-z0-9\p{L}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function effectivePriceRaw(record: Parameters<typeof xmlFieldValue>[0], mappedField: string | undefined): string | undefined {
  const mapped = xmlFieldValue(record, mappedField);
  const normalizedField = mappedField?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const regularFields = new Set(["g:price", "price", "retail_price", "selling_price"]);
  const saleFields = new Set(["g:sale_price", "sale_price"]);

  if (!mappedField || regularFields.has(normalizedField ?? "")) {
    const salePrice = xmlFieldValue(record, "g:sale_price") ?? xmlFieldValue(record, "sale_price");
    if (salePrice && parseXmlMoneyMinor(salePrice) !== undefined) return salePrice;
    return mapped
      ?? xmlFieldValue(record, "g:price")
      ?? xmlFieldValue(record, "price");
  }
  if (saleFields.has(normalizedField ?? "")) {
    return mapped
      ?? xmlFieldValue(record, "g:price")
      ?? xmlFieldValue(record, "price");
  }
  return mapped;
}

function inferCategoryCode(
  sourceCategory: string | undefined,
  title: string | undefined,
  availableCodes: ReadonlySet<string>
): string | undefined {
  if (!sourceCategory) return undefined;
  const segments = sourceCategory.split(">").map((part) => normalizeCategoryKey(part)).filter(Boolean);
  const leaf = segments.at(-1) ?? "";
  const path = segments.join(" ");
  const titleKey = normalizeCategoryKey(title ?? "");
  const signal = [leaf, titleKey, path].filter(Boolean).join(" ");
  const has = (...needles: string[]) => needles.some((needle) => signal.includes(needle));
  const hasIn = (value: string, ...needles: string[]) => needles.some((needle) => value.includes(needle));
  const available = (code: string | undefined) => code && availableCodes.has(code) ? code : undefined;

  const genderFrom = (value: string) => ({
    male: hasIn(value, "ανδρ", "mens ", " men "),
    female: hasIn(value, "γυναικ", "womens ", " women "),
    kid: hasIn(value, "παιδ", "αγορ", "κοριτσ", "μπεμπ", "kids ", "child", "baby")
  });
  let gender = genderFrom(leaf);
  if (!gender.male && !gender.female && !gender.kid) gender = genderFrom(titleKey);
  if (!gender.male && !gender.female && !gender.kid) {
    const pathGender = genderFrom(path);
    if (!(pathGender.male && pathGender.female)) gender = pathGender;
  }
  const { male, female, kid } = gender;

  if (has("καλτσ", "καλσον", "hosiery", "socks")) return available("socks-hosiery");
  if (has("σακιδ", "backpack")) return available("backpacks");
  if (has("ζων", "belt")) return available("belts");
  if (has("πορτοφολ", "wallet")) return available("wallets-cardholders");
  if (has("γυαλια ηλιου", "sunglass")) return available("sunglasses");
  if (has("καπελ", "σκουφ", "γαντ", "κασκολ", "hat", "glove", "scarf")) return available("scarves-hats-gloves");
  if (has("τσαντ", "handbag", " bag ")) return available(female ? "handbags" : male ? "mens-bags" : "unisex-bags");
  if (has("εσωρουχ", "underwear")) return available(male ? "mens-underwear" : female ? "womens-underwear" : undefined);

  if (has("μποτακ", "μποτες", " boots", " boot ")) return available(male ? "mens-boots" : female ? "womens-boots" : kid ? "kids-boots" : undefined);
  if (has("επισημ", "formal") && has("παπου", "shoe")) return available(male ? "mens-formal-shoes" : female ? "womens-formal-shoes" : kid ? "kids-formal-shoes" : undefined);
  if (has("σανδαλ", "σαγιον", "σαμπο", "havaianas", "crocs", "sandal", "clog")) return available(male ? "mens-sandals" : female ? "womens-sandals" : kid ? "kids-sandals" : undefined);
  if ((has("αθλητικ") && has("παπου")) || has("sneaker", "trainer")) {
    if (has("τρεξ", "running")) return available(male ? "mens-running-shoes" : female ? "womens-running-shoes" : kid ? "kids-running-shoes" : undefined);
    return available(male ? "mens-sneakers" : female ? "womens-sneakers" : kid ? "kids-sneakers" : undefined);
  }

  if (has("t shirt", "tshirt", "μπλουζ")) return available(male ? "fashion-mens-tshirts-tops" : female ? "fashion-womens-tops" : undefined);
  if (has("πουκαμισ", "shirt")) return available(male ? "fashion-mens-shirts" : female ? "fashion-womens-shirts" : undefined);
  if (has("μπουφαν", "παλτο", "σακακ", "jacket", "coat", "blazer")) return available(male ? "fashion-mens-jackets-coats" : female ? "fashion-womens-jackets-coats" : undefined);
  if (has("τζιν", "παντελον", "παντελονα", "cargo", "τσινο", "chino", "trouser", "jeans")) return available(male ? "fashion-mens-trousers-jeans" : female ? "fashion-womens-trousers-jeans" : undefined);
  if (has("σορτ", "βερμουδ", "shorts")) return available(male ? "fashion-mens-shorts" : female ? "fashion-womens-shorts" : undefined);
  if (has("μαγιο", "swimwear")) return available(male ? "fashion-mens-swimwear" : female ? "fashion-womens-swimwear" : undefined);
  if (has("πλεκτ", "πλεχτ", "knit")) return available(male ? "fashion-mens-knitwear" : female ? "fashion-womens-knitwear" : undefined);
  if (has("φορεμα", "dress")) return available(female ? "fashion-womens-dresses" : male ? "fashion-mens-dresses" : undefined);
  if (has("φουστ", "skirt")) return available(female ? "fashion-womens-skirts" : male ? "fashion-mens-skirts" : undefined);
  if (has("ολοσωμ", "jumpsuit")) return available(female ? "fashion-womens-jumpsuits" : undefined);
  if (has("σετ", "φορμ", "κολαν", "φουτερ", "ζακετ", "μπουστακ", "tracksuit", "legging", "hoodie", "sweatshirt", "sports bra")) {
    return available(male ? "fashion-mens-activewear" : female ? "fashion-womens-activewear" : undefined);
  }

  if (kid && has("ρουχ", "clothing")) {
    if (has("κοριτσ", "girls")) return available("girls-clothing");
    if (has("αγορ", "boys")) return available("boys-clothing");
  }
  return undefined;
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

function safeHttpUrls(value: string | undefined): readonly string[] {
  if (!value?.trim()) return [];
  return [...new Set(value.split(/\s*\|\s*|\s*,\s*(?=https?:\/\/)/i).map((item) => safeHttpUrl(item)).filter((item): item is string => Boolean(item)))].slice(0, 20);
}

function titleSizeCandidate(title: string | undefined): string | undefined {
  const candidate = title?.match(/\s+-\s+([^\r\n]{1,32})\s*$/)?.[1]?.trim();
  if (!candidate) return undefined;
  const numericSize = /^\d{1,3}(?:[.,]\d+)?(?:\s+\d\s*\/\s*\d)?(?:\s*-\s*\d{1,3}(?:[.,]\d+)?(?:\s+\d\s*\/\s*\d)?)?$/;
  const namedSize = /^(?:XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|[2-6]XL|OS|O\/S|ONE\s*SIZE)$/i;
  return numericSize.test(candidate) || namedSize.test(candidate) ? candidate.replace(",", ".") : undefined;
}

function sizeFromProductUrl(productUrl: string | undefined, title: string | undefined): string | undefined {
  if (!productUrl) return undefined;
  try {
    const raw = new URL(productUrl).searchParams.get("attribute_pa_megethos")?.trim();
    if (!raw) return undefined;
    return titleSizeCandidate(title) ?? raw.replaceAll("_", "-");
  } catch {
    return undefined;
  }
}

function colorFromDescription(description: string | undefined): string | undefined {
  if (!description) return undefined;
  for (const line of description.split(/\r?\n/)) {
    const match = line.match(/^\s*[•·*\-]?\s*(?:Χρώμα(?:\s+προϊόντος)?|Product\s+colou?r|Colou?r)\s*:\s*(.+?)\s*$/i);
    const value = match?.[1]?.trim();
    if (value) return value.slice(0, 160);
  }
  return undefined;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function cleanMapping(input: VendorXmlFieldMapping | undefined, suggested: VendorXmlFieldMapping): VendorXmlFieldMapping {
  const allowed: readonly (keyof VendorXmlFieldMapping)[] = [
    "externalId", "vendorSku", "title", "description", "brand", "model", "mpn", "gtin",
    "price", "currency", "stock", "availability", "categoryCode", "sourceCategory",
    "imageUrl", "additionalImageUrl", "productUrl", "itemGroupId", "size", "color", "condition"
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
  const availableCategoryCodes = new Set(byCode.keys());
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
  const seenVendorSkus = new Set<string>();
  const observedExternalIds = new Set<string>();

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
    const priceRaw = effectivePriceRaw(record, mapping.price);
    const priceMinor = parseXmlMoneyMinor(priceRaw);
    const currency = parseXmlCurrency(xmlFieldValue(record, mapping.currency), priceRaw);
    const stockOnHand = parseXmlStock(xmlFieldValue(record, mapping.stock), xmlFieldValue(record, mapping.availability));
    const sourceCategory = trimOptional(xmlFieldValue(record, mapping.sourceCategory), 500);
    if (sourceCategory) sourceCategories.add(sourceCategory);
    if (externalId) observedExternalIds.add(externalId);

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
      if (!category) {
        const inferredCode = inferCategoryCode(sourceCategory, title, availableCategoryCodes);
        if (inferredCode) category = byCode.get(inferredCode);
      }
    }
    category ??= defaultCategory;

    const rowErrors: VendorProductFeedPreviewError[] = [];
    const fail = (field: string, message: string) => rowErrors.push({ rowNumber: record.index, externalId, field, message });
    if (!externalId) fail("id", "Λείπει σταθερό product ID, SKU ή GTIN.");
    else if (seenIds.has(externalId)) fail("id", "Το ίδιο product ID εμφανίζεται περισσότερες από μία φορές στο XML.");
    if (vendorSku) {
      if (seenVendorSkus.has(vendorSku)) fail("sku", "Το ίδιο vendor SKU εμφανίζεται περισσότερες από μία φορές στο XML.");
      else seenVendorSkus.add(vendorSku);
    }
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

    const description = trimOptional(xmlFieldValue(record, mapping.description), 10_000);
    const productUrl = safeHttpUrl(xmlFieldValue(record, mapping.productUrl));
    const size = trimOptional(xmlFieldValue(record, mapping.size), 160) ?? sizeFromProductUrl(productUrl, title);
    const color = trimOptional(xmlFieldValue(record, mapping.color), 160) ?? colorFromDescription(description);
    const payload = {
      feedExternalId: externalId,
      vendorSku,
      title,
      description,
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
      additionalImageUrls: safeHttpUrls(xmlFieldValue(record, mapping.additionalImageUrl)),
      productUrl,
      itemGroupId: trimOptional(xmlFieldValue(record, mapping.itemGroupId), 300),
      size,
      color,
      variantAttributes: Object.fromEntries([
        ["size", size],
        ["color", color]
      ].filter((entry): entry is [string, string] => Boolean(entry[1])))
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
      additionalImageUrls: payload.additionalImageUrls,
      productUrl: payload.productUrl,
      itemGroupId: payload.itemGroupId,
      size: payload.size,
      color: payload.color,
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
    rows: valid,
    observedExternalIds: [...observedExternalIds],
    reconciliationSafe: parsed.records.length > 0 && observedExternalIds.size / parsed.records.length >= 0.95
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

type PublicVendorTarget = Readonly<{ address: string; family: 4 | 6 }>;
export type PublicVendorResource = Readonly<{
  bytes: Uint8Array;
  contentType: string;
  finalUrl: string;
  headers: IncomingHttpHeaders;
}>;
export type PublicVendorResourceOptions = Readonly<{
  maxBytes: number;
  accept: string;
  userAgent: string;
  timeoutMs?: number;
}>;

async function resolvePublicVendorTarget(url: URL): Promise<PublicVendorTarget> {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || !hostname.includes(".")) {
    throw new Error("Το URL πρέπει να είναι δημόσια προσβάσιμο.");
  }
  const literalFamily = isIP(hostname);
  if (literalFamily) {
    if (!isPublicIp(hostname)) throw new Error("Το URL δείχνει σε μη δημόσια διεύθυνση.");
    return { address: hostname, family: literalFamily as 4 | 6 };
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isPublicIp(entry.address))) {
    throw new Error("Το URL επιλύεται σε μη δημόσια διεύθυνση.");
  }
  const selected = addresses[0]!;
  return { address: selected.address, family: selected.family as 4 | 6 };
}

async function requestPinnedPublicResource(
  url: URL,
  target: PublicVendorTarget,
  options: PublicVendorResourceOptions
): Promise<Readonly<{ statusCode: number; headers: IncomingHttpHeaders; bytes: Uint8Array }>> {
  const maxBytes = Math.max(1, Math.trunc(options.maxBytes));
  const timeoutMs = Math.max(1_000, Math.trunc(options.timeoutMs ?? 20_000));

  return new Promise((resolve, reject) => {
    const requestFn = url.protocol === "https:" ? httpsRequest : httpRequest;
    let settled = false;
    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const request = requestFn(url, {
      method: "GET",
      family: target.family,
      lookup: ((_hostname: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
        callback(null, target.address, target.family);
      }) as never,
      headers: {
        accept: options.accept,
        "user-agent": options.userAgent
      }
    }, (response) => {
      const statusCode = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(statusCode)) {
        response.resume();
        if (!settled) {
          settled = true;
          resolve({ statusCode, headers: response.headers, bytes: new Uint8Array() });
        }
        return;
      }

      const declared = Number(response.headers["content-length"] ?? 0);
      if (Number.isFinite(declared) && declared > maxBytes) {
        response.resume();
        request.destroy(new Error("vendor_resource_too_large"));
        return;
      }

      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += bytes.byteLength;
        if (total > maxBytes) {
          request.destroy(new Error("vendor_resource_too_large"));
          return;
        }
        chunks.push(bytes);
      });
      response.on("error", (error) => finishReject(error instanceof Error ? error : new Error(String(error))));
      response.on("end", () => {
        if (settled) return;
        settled = true;
        resolve({ statusCode, headers: response.headers, bytes: Buffer.concat(chunks, total) });
      });
    });

    request.setTimeout(timeoutMs, () => request.destroy(new Error("vendor_resource_timeout")));
    request.on("error", (error) => finishReject(error instanceof Error ? error : new Error(String(error))));
    request.end();
  });
}

export async function fetchPublicVendorResource(
  rawUrl: string,
  options: PublicVendorResourceOptions
): Promise<PublicVendorResource> {
  let url = new URL(normalizeVendorFeedUrl(rawUrl));
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    // Resolve once, reject every private/local answer, then pin the actual socket
    // lookup to the validated address. This closes the DNS-rebinding gap between
    // validation and the outbound request while preserving Host/SNI validation.
    const target = await resolvePublicVendorTarget(url);
    const response = await requestPinnedPublicResource(url, target, options);

    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
      const location = Array.isArray(response.headers.location) ? response.headers.location[0] : response.headers.location;
      if (!location || redirect === 3) throw new Error("Το URL κάνει μη έγκυρη ή υπερβολική ανακατεύθυνση.");
      url = new URL(location, url);
      continue;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error("Το URL επέστρεψε HTTP " + response.statusCode + ".");
    }

    const contentTypeHeader = Array.isArray(response.headers["content-type"])
      ? response.headers["content-type"][0]
      : response.headers["content-type"];
    return {
      bytes: response.bytes,
      contentType: (contentTypeHeader ?? "").split(";")[0]!.trim().toLowerCase(),
      finalUrl: url.toString(),
      headers: response.headers
    };
  }
  throw new Error("Δεν ήταν δυνατή η λήψη του URL.");
}

export async function fetchVendorXml(rawUrl: string): Promise<string> {
  const response = await fetchPublicVendorResource(rawUrl, {
    maxBytes: VENDOR_XML_REMOTE_MAX_BYTES,
    accept: "application/xml,text/xml,application/rss+xml,text/plain;q=0.8,*/*;q=0.2",
    userAgent: "KONTAMOU-VendorFeed/1.0 (+https://kontamou.site/)"
  });
  return new TextDecoder("utf-8", { fatal: false }).decode(response.bytes);
}

export async function assertPublicVendorUrl(url: URL) {
  await resolvePublicVendorTarget(url);
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
    if (value.startsWith("::ffff:")) return isPublicIp(value.slice(7));
    // Reject non-global IPv6 space before DNS pinning: ULA, link/site-local,
    // multicast, discard-only, documentation and benchmarking ranges.
    if (value.startsWith("fc") || value.startsWith("fd")) return false;
    if (/^fe[89abcdef]/.test(value)) return false;
    if (value.startsWith("ff")) return false;
    if (value === "100::" || value.startsWith("100::")) return false;
    if (value.startsWith("2001:db8:") || value.startsWith("2001:2:")) return false;
    return true;
  }
  return false;
}
