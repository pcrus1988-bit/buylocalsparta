import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const SOURCE = "https://www.polo.gr";
const API = `${SOURCE}/wp-json/wc/store/v1/products`;
const OUTPUT_DIR = "data/imports/polo";
const USER_AGENT = "KONTA-MOU-Catalogue-Research/1.0 (+https://kontamou.site; public catalogue indexing)";
const PER_PAGE = 100;
const CONCURRENCY = 4;
const TIMEOUT_MS = 30_000;
const RETRIES = 3;

const now = new Date();
const crawledAt = now.toISOString();
const researchedDate = crawledAt.slice(0, 10);

const canonicalHeaders = [
  "supplier_code", "gtin", "brand", "model", "title", "description", "image_url", "source_url",
  "category", "price", "currency", "stock", "variant", "specifications", "compatibility"
];

const richHeaders = [
  "source", "source_product_id", "source_slug", "source_api_url", "family_key", "family_title",
  "variant_code", "color", "size", "capacity_l", "dimensions_text", "height_cm", "width_cm", "depth_cm",
  "weight_g", "feature_list", "technical_specs_text", "attributes_json", "category_ids", "category_paths",
  "tag_names", "msrp", "msrp_minor", "selling_price", "selling_price_minor", "regular_price", "regular_price_minor",
  "sale_price", "sale_price_minor", "price_kind", "tax_inclusive", "stock_status", "purchasable", "on_sale",
  "variation_ids", "sibling_color_urls", "image_urls", "image_count", "gtin_status", "gtin_evidence_kind",
  "gtin_evidence_url", "description_quality", "data_quality_flags", "last_researched_date", "crawled_at",
  "source_payload_sha256"
];

const allHeaders = [...canonicalHeaders, ...richHeaders];

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function text(value) { return typeof value === "string" ? value.trim() : ""; }
function asArray(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function normalizeSpace(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function semantic(value) {
  return normalizeSpace(value).toLocaleLowerCase("el-GR")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9α-ω]+/g, " ").trim();
}
function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function stripHtml(value) {
  return normalizeSpace(decodeHtml(String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:br|\/p|\/li|\/tr|\/div|\/h\d)>/gi, " | ")
    .replace(/<[^>]+>/g, " ")))
    .replace(/\s*\|\s*\|+/g, " | ")
    .replace(/^\|\s*|\s*\|$/g, "")
    .trim();
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function euroFromMinor(minor) {
  if (minor === null || minor === undefined || minor === "") return "";
  const n = Number(minor);
  return Number.isFinite(n) ? (n / 100).toFixed(2) : "";
}
function integer(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}
function decimal(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).trim().replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]+/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
function csvCell(value) {
  let raw = value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
  raw = raw.replace(/\r?\n/g, " ");
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}
function csv(rows, headers = allHeaders) {
  return [headers.join(","), ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(","))].join("\n") + "\n";
}

async function fetchResponse(url, options = {}) {
  let last;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        redirect: "follow",
        ...options,
        headers: { "user-agent": USER_AGENT, accept: "*/*", ...(options.headers ?? {}) },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (response.ok) return response;
      last = new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status)) throw last;
    } catch (error) {
      clearTimeout(timer);
      last = error;
    }
    await sleep(400 * attempt * attempt);
  }
  throw last ?? new Error(`Request failed: ${url}`);
}

async function fetchJson(url) {
  const response = await fetchResponse(url, { headers: { accept: "application/json" } });
  return { response, value: await response.json() };
}
async function fetchHtml(url) {
  const response = await fetchResponse(url, { headers: { accept: "text/html,application/xhtml+xml" } });
  return { response, value: await response.text() };
}

async function discoverProducts() {
  const firstUrl = `${API}?per_page=${PER_PAGE}&page=1&orderby=id&order=asc`;
  const first = await fetchJson(firstUrl);
  const products = asArray(first.value);
  const headerPages = integer(first.response.headers.get("x-wp-totalpages"));
  const headerTotal = integer(first.response.headers.get("x-wp-total"));
  let pages = headerPages ?? 1;
  if (!headerPages && products.length === PER_PAGE) pages = 2;

  if (headerPages) {
    for (let page = 2; page <= headerPages; page += 1) {
      const { value } = await fetchJson(`${API}?per_page=${PER_PAGE}&page=${page}&orderby=id&order=asc`);
      const batch = asArray(value);
      products.push(...batch);
      console.log(`[polo] store-api page ${page}/${headerPages}: +${batch.length}`);
    }
  } else {
    let page = 2;
    while (page <= 200) {
      let value;
      try { ({ value } = await fetchJson(`${API}?per_page=${PER_PAGE}&page=${page}&orderby=id&order=asc`)); }
      catch (error) {
        if (/HTTP 400/.test(String(error))) break;
        throw error;
      }
      const batch = asArray(value);
      if (!batch.length) break;
      products.push(...batch);
      console.log(`[polo] store-api page ${page}: +${batch.length}`);
      if (batch.length < PER_PAGE) break;
      page += 1;
      pages = page;
    }
  }
  return { products, headerTotal, pages: headerPages ?? Math.ceil(products.length / PER_PAGE) };
}

function walk(value, fn, path = []) {
  if (Array.isArray(value)) return value.forEach((entry, i) => walk(entry, fn, [...path, String(i)]));
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    fn(key, entry, [...path, key]);
    if (entry && typeof entry === "object") walk(entry, fn, [...path, key]);
  }
}

function validGtin(candidate) {
  const digits = String(candidate ?? "").replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(digits.length)) return false;
  const body = digits.slice(0, -1).split("").reverse().map(Number);
  const sum = body.reduce((acc, digit, i) => acc + digit * (i % 2 === 0 ? 3 : 1), 0);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits.at(-1));
}

function collectIdentifierCandidates(value, evidenceKind) {
  const results = [];
  const keyPattern = /^(gtin|gtin8|gtin12|gtin13|gtin14|ean|ean8|ean13|barcode|upc|global_unique_id|globaluniqueid)$/i;
  walk(value, (key, entry, path) => {
    if (!keyPattern.test(key)) return;
    const candidates = Array.isArray(entry) ? entry : [entry];
    for (const candidate of candidates) {
      const digits = String(candidate ?? "").replace(/\D/g, "");
      if (validGtin(digits)) results.push({ gtin: digits, evidenceKind, path: path.join(".") });
    }
  });
  return results;
}

function parseJsonLd(html) {
  const values = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(re)) {
    const raw = decodeHtml(match[1]).trim();
    if (!raw) continue;
    try { values.push(JSON.parse(raw)); } catch { /* malformed third-party JSON-LD: preserve crawl, ignore block */ }
  }
  return values;
}

function collectHtmlIdentifierCandidates(html) {
  const results = [];
  const re = /(?:["']?(gtin(?:8|12|13|14)?|ean(?:8|13)?|barcode|upc|global_unique_id)["']?)\s*(?:[:=]|&quot;:\s*)&?quot;?\s*["']?(\d{8,14})/gi;
  for (const match of html.matchAll(re)) {
    if (validGtin(match[2])) results.push({ gtin: match[2], evidenceKind: "product_page_embedded_identifier", path: match[1] });
  }
  return results;
}

function chooseGtin(product, jsonLd, html) {
  const candidates = [
    ...collectIdentifierCandidates(product, "woo_store_api"),
    ...jsonLd.flatMap((value) => collectIdentifierCandidates(value, "json_ld")),
    ...collectHtmlIdentifierCandidates(html)
  ];
  const preferred = candidates.find((item) => item.gtin.length === 13) ?? candidates[0];
  return preferred ? { ...preferred, status: "primary_source_verified" } : { gtin: "", evidenceKind: "", path: "", status: "missing_primary_source_enrichment_required" };
}

function findJsonLdProduct(jsonLd) {
  let found = null;
  const visit = (value) => {
    if (found || !value) return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value !== "object") return;
    const type = value["@type"];
    if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) { found = value; return; }
    if (value["@graph"]) visit(value["@graph"]);
  };
  jsonLd.forEach(visit);
  return found;
}

function findAttribute(product, pattern) {
  for (const attribute of asArray(product.attributes)) {
    const name = semantic(attribute?.name ?? attribute?.taxonomy ?? "");
    if (!pattern.test(name)) continue;
    const terms = asArray(attribute?.terms).map((term) => text(term?.name) || text(term?.slug)).filter(Boolean);
    if (terms.length) return terms.join(" | ");
  }
  return "";
}

function attributeObject(product) {
  return asArray(product.attributes).map((attribute) => ({
    id: attribute?.id ?? null,
    name: text(attribute?.name),
    taxonomy: text(attribute?.taxonomy),
    hasVariations: Boolean(attribute?.has_variations),
    terms: asArray(attribute?.terms).map((term) => ({ id: term?.id ?? null, name: text(term?.name), slug: text(term?.slug) }))
  }));
}

function visiblePrice(html, labelPattern) {
  const plain = stripHtml(html);
  const match = plain.match(new RegExp(`${labelPattern}[^0-9]{0,30}([0-9]{1,5}(?:[.,][0-9]{1,2})?)\\s*€`, "i"));
  return match ? decimal(match[1]) : null;
}

function extractSection(html, startPattern, stopPattern) {
  const plain = stripHtml(html);
  const start = plain.search(startPattern);
  if (start < 0) return "";
  const tail = plain.slice(start);
  const stop = tail.slice(10).search(stopPattern);
  return normalizeSpace(stop >= 0 ? tail.slice(0, stop + 10) : tail.slice(0, 2000));
}

function parseDimensionFacts(textValue) {
  const value = normalizeSpace(textValue);
  const result = { dimensionsText: "", heightCm: null, widthCm: null, depthCm: null, capacityL: null, weightG: null };
  const triplet = value.match(/(?:διαστασ(?:η|εις)|dimensions?)[^0-9]{0,30}(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:cm|εκ\.?)/i);
  if (triplet) {
    result.dimensionsText = `${triplet[1]} x ${triplet[2]} x ${triplet[3]} cm`;
    result.heightCm = decimal(triplet[1]);
    result.widthCm = decimal(triplet[2]);
    result.depthCm = decimal(triplet[3]);
  }
  const capacity = value.match(/(?:χωρητικοτητα|capacity)[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*(?:l|lt|λιτρ)/i);
  if (capacity) result.capacityL = decimal(capacity[1]);
  const grams = value.match(/(?:βαρος|weight)[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*(?:g|gr|γραμ)/i);
  if (grams) result.weightG = decimal(grams[1]);
  const kilos = !grams && value.match(/(?:βαρος|weight)[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*(?:kg|κιλ)/i);
  if (kilos) result.weightG = Math.round((decimal(kilos[1]) ?? 0) * 1000);
  return result;
}

function extractSiblingUrls(html, currentUrl) {
  const marker = html.search(/Άλλα\s+Χρώματα|Αλλα\s+Χρωματα|Other\s+Colou?rs/i);
  if (marker < 0) return [];
  const section = html.slice(marker, marker + 60_000);
  const urls = [];
  for (const match of section.matchAll(/href=["']([^"']+)["']/gi)) {
    try {
      const url = new URL(decodeHtml(match[1]), SOURCE).toString().replace(/#.*$/, "");
      if (!url.startsWith(`${SOURCE}/product/`) || url === currentUrl) continue;
      urls.push(url);
    } catch { /* ignore malformed href */ }
  }
  return [...new Set(urls)].slice(0, 40);
}

function familyParts(sku, title) {
  const code = text(sku);
  if (code.includes("-")) {
    const parts = code.split("-").filter(Boolean);
    return { familyKey: parts.slice(0, -1).join("-") || code, variantCode: parts.at(-1) ?? "" };
  }
  const simplified = semantic(title).split(" ").slice(0, 6).join("-") || code || "unknown";
  return { familyKey: code || simplified, variantCode: "" };
}

function deriveBrand(product, jsonLdProduct) {
  const fromLd = jsonLdProduct?.brand;
  if (typeof fromLd === "string" && fromLd.trim()) return fromLd.trim();
  if (fromLd && typeof fromLd === "object" && text(fromLd.name)) return text(fromLd.name);
  const brandAttr = findAttribute(product, /^(brand|μαρκα|κατασκευαστης)$/i);
  return brandAttr || "POLO";
}

function deriveModel(product, html) {
  const attr = findAttribute(product, /^(model|μοντελο|mpn)$/i);
  if (attr) return attr;
  const visible = stripHtml(html).match(/(?:μοντελο|model|mpn)\s*:?\s*([A-Z0-9][A-Z0-9._/-]{2,40})/i);
  return visible?.[1] ?? text(product.sku);
}

function deriveColor(product, html) {
  const attr = findAttribute(product, /(χρωμα|color|colour)/i);
  if (attr) return attr;
  const visible = stripHtml(html).match(/(?:χρωμα|color|colour)\s*:?\s*([^|;]{2,60})/i);
  return normalizeSpace(visible?.[1] ?? "").replace(/\s+(?:μεγεθος|size|διαστασεις).*$/i, "").slice(0, 60);
}

function deriveSize(product, html) {
  const attr = findAttribute(product, /(μεγεθος|size)/i);
  if (attr) return attr;
  const visible = stripHtml(html).match(/(?:μεγεθος|size)\s*:?\s*([^|;]{1,40})/i);
  return normalizeSpace(visible?.[1] ?? "").slice(0, 40);
}

function deriveFeatures(product, description, technicalText) {
  const attrTerms = asArray(product.attributes).flatMap((attribute) => asArray(attribute?.terms).map((term) => text(term?.name))).filter(Boolean);
  const sentences = `${description} | ${technicalText}`.split(/\s*\|\s*|[.;]\s+/).map(normalizeSpace).filter((part) => part.length >= 4 && part.length <= 180);
  return [...new Set([...attrTerms, ...sentences])].slice(0, 40);
}

function currencyInfo(product) {
  const prices = object(product.prices);
  const minorUnit = integer(prices.currency_minor_unit) ?? 2;
  const scale = 10 ** minorUnit;
  const toMinor = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * (100 / scale));
  };
  return {
    currency: text(prices.currency_code) || "EUR",
    sellingMinor: toMinor(prices.price),
    regularMinor: toMinor(prices.regular_price),
    saleMinor: toMinor(prices.sale_price),
    currencyMinorUnit: minorUnit
  };
}

async function enrichProduct(product, index, total) {
  const sourceUrl = text(product.permalink) || `${SOURCE}/?post_type=product&p=${product.id}`;
  let html = "";
  let pageError = "";
  try { ({ value: html } = await fetchHtml(sourceUrl)); }
  catch (error) { pageError = String(error?.message ?? error); }

  const jsonLd = html ? parseJsonLd(html) : [];
  const jsonLdProduct = findJsonLdProduct(jsonLd);
  const gtin = chooseGtin(product, jsonLd, html);
  const sku = text(product.sku) || text(jsonLdProduct?.sku);
  const title = stripHtml(product.name) || text(jsonLdProduct?.name);
  const description = stripHtml(product.description) || stripHtml(product.short_description) || stripHtml(jsonLdProduct?.description) || title;
  const shortDescription = stripHtml(product.short_description);
  const technicalText = html ? extractSection(html, /Τεχνικ(?:ά|α)\s+Χαρακτηριστικ|Τεχνικ(?:ές|ες)\s+Προδιαγραφ|Technical\s+(?:Specifications|Features)/i, /Άλλα\s+Χρώματα|Δείτε\s+επίσης|Σχετικά\s+προϊόντα|Related\s+Products|SKU\s*:/i) : "";
  const dimensionsSection = html ? extractSection(html, /Διαστάσεις|Διαστασεις|Dimensions/i, /Τεχνικ|Άλλα\s+Χρώματα|Δείτε\s+επίσης|Related/i) : "";
  const dims = parseDimensionFacts(`${description} | ${technicalText} | ${dimensionsSection}`);
  const { familyKey, variantCode } = familyParts(sku, title);
  const color = deriveColor(product, html);
  const size = deriveSize(product, html);
  const attributes = attributeObject(product);
  const features = deriveFeatures(product, shortDescription || description, technicalText);
  const categories = asArray(product.categories).map((category) => ({ id: category?.id ?? null, name: text(category?.name), slug: text(category?.slug) }));
  const tags = asArray(product.tags).map((tag) => text(tag?.name) || text(tag?.slug)).filter(Boolean);
  const images = asArray(product.images).map((image) => text(image?.src)).filter(Boolean);
  const variationIds = asArray(product.variations).map((value) => typeof value === "object" ? value?.id : value).filter((value) => value !== null && value !== undefined).map(String);
  const siblingUrls = html ? extractSiblingUrls(html, sourceUrl) : [];
  const prices = currencyInfo(product);
  const plt = html ? (visiblePrice(html, "Π\\.?\\s*Λ\\.?\\s*Τ\\.?") ?? visiblePrice(html, "P\\.?\\s*L\\.?\\s*T\\.?")) : null;
  const msrpMinor = plt !== null ? Math.round(plt * 100) : prices.regularMinor;
  const sellingMinor = prices.sellingMinor ?? msrpMinor;
  const qualityFlags = [];
  if (!gtin.gtin) qualityFlags.push("gtin_missing_primary_source");
  if (!description || description === title) qualityFlags.push("description_sparse");
  if (!images.length) qualityFlags.push("images_missing");
  if (!sku) qualityFlags.push("supplier_code_missing");
  if (!technicalText && !attributes.length) qualityFlags.push("technical_specs_sparse");
  if (!color && siblingUrls.length) qualityFlags.push("color_name_unresolved_with_color_siblings");
  if (pageError) qualityFlags.push("product_page_fetch_failed");

  const sourcePayload = JSON.stringify(product);
  const specificationObject = {
    dimensions: dims.dimensionsText || undefined,
    height_cm: dims.heightCm ?? undefined,
    width_cm: dims.widthCm ?? undefined,
    depth_cm: dims.depthCm ?? undefined,
    capacity_l: dims.capacityL ?? undefined,
    weight_g: dims.weightG ?? undefined,
    technical_text: technicalText || undefined,
    features,
    attributes
  };
  const variantObject = {
    family_key: familyKey,
    variant_code: variantCode || undefined,
    color: color || undefined,
    size: size || undefined,
    variation_ids: variationIds,
    sibling_color_urls: siblingUrls
  };

  const row = {
    supplier_code: sku,
    gtin: gtin.gtin,
    brand: deriveBrand(product, jsonLdProduct),
    model: deriveModel(product, html),
    title,
    description,
    image_url: images[0] ?? text(jsonLdProduct?.image?.[0]) ?? text(jsonLdProduct?.image),
    source_url: sourceUrl,
    category: categories.map((category) => category.name).filter(Boolean).join(" > "),
    price: euroFromMinor(sellingMinor),
    currency: prices.currency,
    stock: text(product.stock_status) || (product.is_in_stock ? "instock" : "outofstock"),
    variant: JSON.stringify(variantObject),
    specifications: JSON.stringify(specificationObject),
    compatibility: "",
    source: "polo-gr",
    source_product_id: String(product.id ?? ""),
    source_slug: text(product.slug),
    source_api_url: `${API}/${product.id}`,
    family_key: familyKey,
    family_title: title,
    variant_code: variantCode,
    color,
    size,
    capacity_l: dims.capacityL ?? "",
    dimensions_text: dims.dimensionsText || dimensionsSection,
    height_cm: dims.heightCm ?? "",
    width_cm: dims.widthCm ?? "",
    depth_cm: dims.depthCm ?? "",
    weight_g: dims.weightG ?? "",
    feature_list: features.join(" | "),
    technical_specs_text: technicalText,
    attributes_json: JSON.stringify(attributes),
    category_ids: categories.map((category) => category.id).filter((value) => value !== null).join("|"),
    category_paths: categories.map((category) => category.slug || category.name).filter(Boolean).join("|"),
    tag_names: tags.join("|"),
    msrp: euroFromMinor(msrpMinor),
    msrp_minor: msrpMinor ?? "",
    selling_price: euroFromMinor(sellingMinor),
    selling_price_minor: sellingMinor ?? "",
    regular_price: euroFromMinor(prices.regularMinor),
    regular_price_minor: prices.regularMinor ?? "",
    sale_price: euroFromMinor(prices.saleMinor),
    sale_price_minor: prices.saleMinor ?? "",
    price_kind: plt !== null ? "POLO_P.L.T._plus_store_price" : "store_api_price",
    tax_inclusive: "true",
    stock_status: text(product.stock_status),
    purchasable: String(Boolean(product.is_purchasable)),
    on_sale: String(Boolean(product.on_sale)),
    variation_ids: variationIds.join("|"),
    sibling_color_urls: siblingUrls.join("|"),
    image_urls: images.join("|"),
    image_count: String(images.length),
    gtin_status: gtin.status,
    gtin_evidence_kind: gtin.evidenceKind,
    gtin_evidence_url: gtin.gtin ? sourceUrl : "",
    description_quality: description.length >= 100 ? "supplier_page_detailed" : description.length >= 30 ? "supplier_page_basic" : "supplier_page_sparse",
    data_quality_flags: qualityFlags.join("|"),
    last_researched_date: researchedDate,
    crawled_at: crawledAt,
    source_payload_sha256: sha256(sourcePayload),
    _raw: product,
    _jsonLd: jsonLd,
    _pageError: pageError
  };

  if ((index + 1) % 25 === 0 || index + 1 === total) console.log(`[polo] enriched ${index + 1}/${total}`);
  return row;
}

async function mapConcurrent(items, limit, fn) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      output[index] = await fn(items[index], index, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

function familySummary(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row.family_key || row.supplier_code || row.source_product_id;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return [...map].map(([family_key, members]) => ({
    family_key,
    family_title: members[0]?.family_title ?? "",
    variant_count: members.length,
    colors: [...new Set(members.map((row) => row.color).filter(Boolean))].join("|"),
    sizes: [...new Set(members.map((row) => row.size).filter(Boolean))].join("|"),
    supplier_codes: members.map((row) => row.supplier_code).filter(Boolean).join("|"),
    gtins: members.map((row) => row.gtin).filter(Boolean).join("|"),
    min_price: Math.min(...members.map((row) => Number(row.price)).filter(Number.isFinite)).toFixed(2),
    max_price: Math.max(...members.map((row) => Number(row.price)).filter(Number.isFinite)).toFixed(2),
    source_urls: members.map((row) => row.source_url).filter(Boolean).join("|")
  }));
}

async function main() {
  console.log(`[polo] crawl started ${crawledAt}`);
  const robots = await fetchHtml(`${SOURCE}/robots.txt`).then(({ value }) => value).catch(() => "");
  const discovered = await discoverProducts();
  console.log(`[polo] discovered ${discovered.products.length} public catalogue products`);
  const rows = await mapConcurrent(discovered.products, CONCURRENCY, enrichProduct);

  const outputRows = rows.map(({ _raw, _jsonLd, _pageError, ...row }) => row);
  const missingGtin = outputRows.filter((row) => !row.gtin);
  const qualityReview = outputRows.filter((row) => row.data_quality_flags);
  const families = familySummary(outputRows);
  const familyHeaders = ["family_key", "family_title", "variant_count", "colors", "sizes", "supplier_codes", "gtins", "min_price", "max_price", "source_urls"];

  const structured = rows.map((row) => ({
    canonical: Object.fromEntries(canonicalHeaders.map((key) => [key, row[key]])),
    rich: Object.fromEntries(richHeaders.map((key) => [key, row[key]])),
    rawStoreApi: row._raw,
    jsonLd: row._jsonLd,
    pageError: row._pageError || undefined
  }));

  const summary = {
    source: SOURCE,
    storeApi: API,
    crawledAt,
    productCount: outputRows.length,
    apiReportedTotal: discovered.headerTotal,
    apiPages: discovered.pages,
    familyCount: families.length,
    withSupplierCode: outputRows.filter((row) => row.supplier_code).length,
    withGtin: outputRows.length - missingGtin.length,
    missingGtin: missingGtin.length,
    withDescription: outputRows.filter((row) => row.description && row.description !== row.title).length,
    withImages: outputRows.filter((row) => row.image_url).length,
    totalImages: outputRows.reduce((sum, row) => sum + Number(row.image_count || 0), 0),
    withColor: outputRows.filter((row) => row.color).length,
    withSize: outputRows.filter((row) => row.size).length,
    withStructuredSpecs: outputRows.filter((row) => row.technical_specs_text || row.attributes_json !== "[]").length,
    withMsrp: outputRows.filter((row) => row.msrp).length,
    withSellingPrice: outputRows.filter((row) => row.selling_price).length,
    qualityReviewRows: qualityReview.length,
    canonicalHeaders,
    richHeaders,
    gtinPolicy: "Use POLO Woo Store API / POLO product-page JSON-LD / embedded identifier first. Missing GTINs remain explicit QA rows for externally evidenced enrichment; no identifier is guessed.",
    variantPolicy: "One sellable POLO product/SKU per master row; family_key groups SKU stems, while Woo variation IDs, explicit color/size attributes and POLO sibling-colour links are preserved.",
    pricePolicy: "price/selling_price comes from the live Woo Store API. MSRP prefers the visible POLO Π.Λ.Τ. value when found, otherwise the Store API regular price.",
    robotsSha256: robots ? sha256(robots) : null
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(join(OUTPUT_DIR, "polo-master.csv"), csv(outputRows), "utf8");
  await writeFile(join(OUTPUT_DIR, "polo-master.jsonl"), structured.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
  await writeFile(join(OUTPUT_DIR, "polo-families.csv"), csv(families, familyHeaders), "utf8");
  await writeFile(join(OUTPUT_DIR, "polo-gtin-missing.csv"), csv(missingGtin), "utf8");
  await writeFile(join(OUTPUT_DIR, "polo-quality-review.csv"), csv(qualityReview), "utf8");
  await writeFile(join(OUTPUT_DIR, "polo-crawl-summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");
  await writeFile(join(OUTPUT_DIR, "polo-robots.txt"), robots, "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("[polo] crawl failed", error);
  process.exitCode = 1;
});
