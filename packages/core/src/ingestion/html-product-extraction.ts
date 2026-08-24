import type { ExtractedImage, ExtractedPrice, ExtractedProductCandidate, ProductFieldEvidence } from "./types.ts";

export type HtmlProductAnalysis = Readonly<{
  candidates: readonly ExtractedProductCandidate[];
  productLikelihood: number;
  requiresRendering: boolean;
  signals: readonly string[];
}>;

type MetaMap = Map<string, string[]>;

type PriceKind = ExtractedPrice["kind"];

const MAX_DESCRIPTION = 4000;
const MAX_IMAGES = 24;
const MAX_EMBEDDED_JSON_NODES = 5000;

export function analyzeHtmlProductPage(html: string, sourceUrl: string): HtmlProductAnalysis {
  const visible = visibleText(html);
  const meta = collectMeta(html);
  const signals: string[] = [];
  let score = 0;

  if (/itemtype\s*=\s*["'][^"']*schema\.org\/(?:Product|IndividualProduct)/i.test(html)) { score += 5; signals.push("schema_product_microdata"); }
  if (/(?:single-product|product-template-default|product-detail|product-page|product-info-main|productView|woocommerce-product-details|product__info|product-single)/i.test(html)) { score += 4; signals.push("product_template"); }
  if (hasMeta(meta, ["product:price:amount", "og:price:amount", "price", "product:retailer_item_id"])) { score += 4; signals.push("commerce_meta"); }
  if (/\b(?:SKU|EAN|GTIN|UPC|MPN|ISBN|Κωδ(?:ικός|\.)?|Barcode)\b/i.test(visible)) { score += 3; signals.push("identity_label"); }
  if (/(?:R\.?R\.?P\.?|MSRP|Recommended Retail Price|Προτεινόμενη\s+(?:Λιανική\s+)?Τιμή|Τιμή)\s*[:\-]?\s*(?:€|EUR|\$|USD|£|GBP)?\s*\d/i.test(visible)) { score += 3; signals.push("price_label"); }
  if (/(?:add to cart|add to basket|buy now|προσθήκη στο καλάθι|αγορά τώρα)/i.test(visible)) { score += 2; signals.push("purchase_action"); }
  if (/\b(?:Dimensions|Technical Details|Specifications|Χαρακτηριστικά|Τεχνικά Χαρακτηριστικά|Διαστάσεις)\b/i.test(visible)) { score += 2; signals.push("product_specs"); }
  if (/\b(?:Categories|Κατηγορίες)\s*:/i.test(visible) || /breadcrumb/i.test(html)) { score += 1; signals.push("category_context"); }
  if (extractH1(html)) { score += 1; signals.push("h1"); }

  const urlScore = productUrlLikelihood(sourceUrl);
  score += Math.round(urlScore * 4);
  if (urlScore >= 0.5) signals.push("product_url_shape");

  if (/(?:product-category|collection-template|archive-product|search-results|category-page)/i.test(html) || /\/(?:product-category|collections?|category|search)(?:\/|\?|$)/i.test(new URL(sourceUrl).pathname)) {
    score -= 5;
    signals.push("listing_page_penalty");
  }

  const embedded = extractEmbeddedJsonCandidates(html, sourceUrl);
  if (embedded.length) {
    score = Math.max(score, 10);
    signals.push("embedded_product_json");
  }

  const fallback = score >= 7 ? buildHtmlCandidate(html, visible, meta, sourceUrl, score, signals) : undefined;
  const candidates = dedupeCandidates([...embedded, ...(fallback ? [fallback] : [])]);
  const requiresRendering = candidates.length === 0 && looksLikeJavascriptShell(html, visible);
  if (requiresRendering) signals.push("javascript_shell");
  const productLikelihood = candidates.length
    ? Math.min(0.99, Math.max(0.82, score / 12))
    : Math.min(0.92, Math.max(urlScore, score / 12));

  return { candidates, productLikelihood, requiresRendering, signals };
}

function buildHtmlCandidate(
  html: string,
  visible: string,
  meta: MetaMap,
  sourceUrl: string,
  score: number,
  signals: readonly string[]
): ExtractedProductCandidate | undefined {
  const canonical = canonicalUrl(html, sourceUrl);
  const h1 = extractH1(html);
  const title = cleanTitle(h1 ?? firstMeta(meta, ["og:title", "twitter:title", "title"]) ?? documentTitle(html));
  if (!title || title.length < 2 || title.length > 500) return undefined;

  const htmlEvidence = (selector: string, confidence = 0.82, note?: string): ProductFieldEvidence => ({
    origin: "html",
    sourceUrl: canonical,
    confidence,
    selector,
    note
  });
  const microdataEvidence = (selector: string, confidence = 0.94): ProductFieldEvidence => ({
    origin: "microdata",
    sourceUrl: canonical,
    confidence,
    selector
  });

  const sku = firstDefined(
    metaItem(meta, ["sku", "product:retailer_item_id"]),
    attributeValue(html, ["data-product-sku", "data-sku"]),
    labeledValue(visible, ["SKU", "Κωδικός", "Κωδ.", "Product code", "Item code", "Reference", "Ref."]),
    headerIdentityNearPrice(visible)
  );
  const gtin = digitsOnly(firstDefined(
    metaItem(meta, ["gtin", "gtin8", "gtin12", "gtin13", "gtin14", "ean", "upc", "isbn"]),
    labeledValue(visible, ["GTIN", "EAN", "UPC", "Barcode", "ISBN"])
  ));
  const mpn = firstDefined(metaItem(meta, ["mpn"]), labeledValue(visible, ["MPN", "Manufacturer part number", "Part number"]));
  const model = firstDefined(metaItem(meta, ["model"]), labeledValue(visible, ["Model", "Μοντέλο"]));
  const brand = firstDefined(metaItem(meta, ["brand", "product:brand"]), labeledValue(visible, ["Brand", "Μάρκα", "Κατασκευαστής"]));
  const description = productDescription(html, visible, meta, title);
  const categoryPath = extractCategoryPath(html, visible);
  const attributes = extractAttributes(html, visible);
  const variantAttributes = selectedVariantAttributes(html, visible);
  const prices = extractPrices(html, visible, meta, canonical, score);
  const images = extractImages(html, meta, canonical, title);
  const sourceProductKey = cleanIdentity(sku) || cleanIdentity(gtin) || cleanIdentity(mpn) || cleanIdentity(model) || canonical;
  const fieldEvidence: Record<string, ProductFieldEvidence | readonly ProductFieldEvidence[]> = {
    title: h1 ? htmlEvidence("h1", 0.91) : htmlEvidence("meta:title", 0.84)
  };
  if (description) fieldEvidence.description = htmlEvidence("meta/visible-description", 0.82);
  if (sku) fieldEvidence.sku = /itemprop=["']sku/i.test(html) ? microdataEvidence("[itemprop=sku]") : htmlEvidence("sku/code", 0.88);
  if (gtin) fieldEvidence.gtin = /itemprop=["']gtin/i.test(html) ? microdataEvidence("[itemprop^=gtin]") : htmlEvidence("gtin/ean/upc", 0.9);
  if (mpn) fieldEvidence.mpn = htmlEvidence("mpn", 0.87);
  if (model) fieldEvidence.model = htmlEvidence("model", 0.84);
  if (brand) fieldEvidence.brand = htmlEvidence("brand", 0.82);
  if (categoryPath?.length) fieldEvidence.categoryPath = htmlEvidence("breadcrumb/categories", 0.85);
  if (prices.length) fieldEvidence.prices = htmlEvidence("price", prices.some((price) => price.kind === "rrp") ? 0.88 : 0.82);
  if (images.length) fieldEvidence.images = htmlEvidence("product images", 0.8);
  for (const key of Object.keys(attributes)) fieldEvidence[key] = htmlEvidence(`attribute:${key}`, 0.76);

  return {
    sourceProductKey,
    sourceUrl: canonical,
    title,
    description,
    brand,
    model,
    mpn,
    gtin,
    sku,
    categoryPath,
    attributes,
    variantAttributes: Object.keys(variantAttributes).length ? variantAttributes : undefined,
    prices: prices.length ? prices : undefined,
    images: images.length ? images : undefined,
    fieldEvidence,
    rawPayload: { extractionStrategy: "html_multi_signal", score, signals }
  };
}

function extractEmbeddedJsonCandidates(html: string, sourceUrl: string): ExtractedProductCandidate[] {
  const result: ExtractedProductCandidate[] = [];
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    const attrs = parseAttributes(match[1] ?? "");
    const type = (attrs.type ?? "").toLowerCase();
    const id = (attrs.id ?? "").toLowerCase();
    if (type === "application/ld+json") continue;
    if (!(type.includes("json") || id === "__next_data__" || id.includes("product-json") || id.includes("productjson"))) continue;
    const body = decodeEntities((match[2] ?? "").trim());
    if (!body || body.length > 2_000_000 || !/^[\[{]/.test(body)) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { continue; }
    walkJson(parsed, (record) => {
      if (result.length >= 100) return;
      const candidate = candidateFromEmbeddedRecord(record, sourceUrl);
      if (candidate) result.push(candidate);
    });
  }
  return dedupeCandidates(result);
}

function candidateFromEmbeddedRecord(record: Record<string, unknown>, pageUrl: string): ExtractedProductCandidate | undefined {
  const title = scalar(record.title) ?? scalar(record.name) ?? scalar(record.productName) ?? scalar(record.product_name);
  if (!title || title.length < 2 || title.length > 500) return undefined;
  const sku = scalar(record.sku) ?? scalar(record.SKU) ?? scalar(record.code) ?? scalar(record.productCode);
  const gtin = digitsOnly(scalar(record.gtin13) ?? scalar(record.gtin) ?? scalar(record.ean) ?? scalar(record.upc) ?? scalar(record.barcode));
  const mpn = scalar(record.mpn) ?? scalar(record.manufacturerPartNumber);
  const id = scalar(record.productId) ?? scalar(record.product_id) ?? scalar(record.id);
  const hasCommerce = Boolean(sku || gtin || mpn || record.price != null || record.variants || record.images || record.image);
  if (!hasCommerce || !(sku || gtin || mpn || (id && (record.price != null || record.variants)))) return undefined;
  const canonical = resolveHttpUrl(scalar(record.url) ?? scalar(record.handle) ?? "", pageUrl) ?? pageUrl;
  const brand = scalar(record.brand) ?? scalar(record.vendor) ?? objectName(record.manufacturer);
  const model = scalar(record.model);
  const description = trimDescription(scalar(record.description) ?? scalar(record.shortDescription) ?? scalar(record.short_description));
  const attributes: Record<string, string> = {};
  const variantAttributes: Record<string, string> = {};
  for (const key of ["color", "colour", "size", "material", "capacity"] as const) {
    const value = scalar(record[key]);
    if (!value) continue;
    const target = key === "colour" ? "color" : key;
    attributes[target] = value;
    if (target === "color" || target === "size") variantAttributes[target] = value;
  }
  const evidence = (sourcePath: string, confidence = 0.86): ProductFieldEvidence => ({ origin: "api", sourceUrl: canonical, confidence, sourcePath });
  const fieldEvidence: Record<string, ProductFieldEvidence> = { title: evidence("embedded.title/name") };
  if (sku) fieldEvidence.sku = evidence("embedded.sku", 0.9);
  if (gtin) fieldEvidence.gtin = evidence("embedded.gtin/ean/upc", 0.93);
  if (mpn) fieldEvidence.mpn = evidence("embedded.mpn", 0.9);
  if (brand) fieldEvidence.brand = evidence("embedded.brand/vendor", 0.84);
  if (description) fieldEvidence.description = evidence("embedded.description", 0.82);
  const images = embeddedImages(record, canonical);
  const prices = embeddedPrices(record, canonical);
  if (images.length) fieldEvidence.images = evidence("embedded.images", 0.84);
  if (prices.length) fieldEvidence.prices = evidence("embedded.price", 0.8);
  return {
    sourceProductKey: cleanIdentity(sku) || cleanIdentity(gtin) || cleanIdentity(mpn) || cleanIdentity(id) || canonical,
    sourceUrl: canonical,
    title: cleanTitle(title) ?? title,
    description,
    brand,
    model,
    mpn,
    gtin,
    sku,
    attributes,
    variantAttributes: Object.keys(variantAttributes).length ? variantAttributes : undefined,
    prices: prices.length ? prices : undefined,
    images: images.length ? images : undefined,
    fieldEvidence,
    rawPayload: { extractionStrategy: "embedded_json", record }
  };
}

function extractPrices(html: string, visible: string, meta: MetaMap, sourceUrl: string, score: number): ExtractedPrice[] {
  const result: ExtractedPrice[] = [];
  const evidence = (selector: string, confidence: number): ProductFieldEvidence => ({ origin: "html", sourceUrl, confidence, selector });
  const metaAmount = firstMeta(meta, ["product:price:amount", "og:price:amount", "price"]);
  const metaCurrency = normalizeCurrency(firstMeta(meta, ["product:price:currency", "og:price:currency", "pricecurrency"]));
  if (metaAmount && metaCurrency) {
    const minor = decimalToMinor(metaAmount);
    if (minor !== undefined) result.push({ amountMinor: minor, currency: metaCurrency, kind: "selling", evidence: evidence("meta:price", 0.94) });
  }
  const labelPattern = /\b(R\.?R\.?P\.?|MSRP|Recommended Retail Price|Προτεινόμενη(?:\s+Λιανική)?\s+Τιμή|Sale Price|Offer Price|Τιμή Προσφοράς|Price|Τιμή)\b\s*[:\-]?\s*(€|EUR|\$|USD|£|GBP)?\s*([0-9]{1,7}(?:[.,][0-9]{1,2})?)/gi;
  for (const match of visible.matchAll(labelPattern)) {
    const minor = decimalToMinor(match[3]);
    const currency = normalizeCurrency(match[2]) ?? currencyNear(visible, match.index ?? 0) ?? "EUR";
    if (minor === undefined || !currency) continue;
    const label = match[1].toLowerCase();
    const kind: PriceKind = /r\.?r\.?p|msrp|recommended|προτεινόμενη/.test(label) ? "rrp" : /sale|offer|προσφορά/.test(label) ? "promotion" : "selling";
    result.push({ amountMinor: minor, currency, kind, evidence: evidence(`text:${match[1]}`, 0.88) });
  }
  if (!result.length && score >= 9) {
    const currencyPattern = /(€|EUR|\$|USD|£|GBP)\s*([0-9]{1,7}(?:[.,][0-9]{1,2})?)/gi;
    const match = currencyPattern.exec(visible);
    if (match) {
      const minor = decimalToMinor(match[2]);
      const currency = normalizeCurrency(match[1]);
      if (minor !== undefined && currency) result.push({ amountMinor: minor, currency, kind: "unknown", evidence: evidence("visible currency price", 0.72) });
    }
  }
  return dedupePrices(result).slice(0, 4);
}

function embeddedPrices(record: Record<string, unknown>, sourceUrl: string): ExtractedPrice[] {
  const evidence: ProductFieldEvidence = { origin: "api", sourceUrl, confidence: 0.78, sourcePath: "embedded.price" };
  const currency = normalizeCurrency(scalar(record.currency) ?? scalar(record.currencyCode) ?? scalar(record.priceCurrency));
  const values: Array<[unknown, PriceKind]> = [[record.salePrice, "promotion"], [record.currentPrice, "selling"], [record.price, "selling"], [record.rrp, "rrp"], [record.msrp, "rrp"]];
  const result: ExtractedPrice[] = [];
  for (const [raw, kind] of values) {
    if (typeof raw !== "string") continue;
    const minor = decimalToMinor(raw);
    if (minor !== undefined && currency) result.push({ amountMinor: minor, currency, kind, evidence });
  }
  return dedupePrices(result);
}

function extractImages(html: string, meta: MetaMap, sourceUrl: string, title: string): ExtractedImage[] {
  const result: ExtractedImage[] = [];
  const add = (raw: string | undefined, alt: string | undefined, confidence: number, selector: string) => {
    const url = raw ? resolveHttpUrl(raw, sourceUrl) : undefined;
    if (!url || /(?:logo|icon|sprite|avatar|payment|badge)/i.test(url)) return;
    result.push({ url, alt: cleanText(alt), evidence: { origin: "html", sourceUrl, confidence, selector } });
  };
  for (const value of allMeta(meta, ["og:image", "twitter:image", "product:image"])) add(value, title, 0.92, "meta:image");
  const imgPattern = /<img\b([^>]*)>/gi;
  for (const match of html.matchAll(imgPattern)) {
    if (result.length >= MAX_IMAGES * 2) break;
    const attrs = parseAttributes(match[1] ?? "");
    const classText = `${attrs.class ?? ""} ${attrs.id ?? ""}`;
    const alt = attrs.alt ?? attrs.title;
    const likely = /product|gallery|woocommerce|zoom|main-image|featured/i.test(classText) || (alt && normalizedContains(alt, title));
    if (!likely) continue;
    const raw = attrs["data-large_image"] ?? attrs["data-zoom-image"] ?? attrs["data-src"] ?? attrs.src ?? firstSrcset(attrs.srcset);
    add(raw, alt, 0.78, "img:product");
  }
  return dedupeImages(result).slice(0, MAX_IMAGES);
}

function embeddedImages(record: Record<string, unknown>, sourceUrl: string): ExtractedImage[] {
  const raw = record.images ?? record.image ?? record.featuredImage ?? record.featured_image;
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const result: ExtractedImage[] = [];
  for (const item of values) {
    const value = typeof item === "string" ? item : item && typeof item === "object" ? scalar((item as Record<string, unknown>).url) ?? scalar((item as Record<string, unknown>).src) : undefined;
    const url = value ? resolveHttpUrl(value, sourceUrl) : undefined;
    if (url) result.push({ url, evidence: { origin: "api", sourceUrl, confidence: 0.84, sourcePath: "embedded.images" } });
  }
  return dedupeImages(result).slice(0, MAX_IMAGES);
}

function extractAttributes(html: string, visible: string): Record<string, string> {
  const result: Record<string, string> = {};
  const tablePattern = /<tr\b[^>]*>[\s\S]*?<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>[\s\S]*?<td\b[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi;
  for (const match of html.matchAll(tablePattern)) addAttribute(result, cleanText(stripTags(match[1])), cleanText(stripTags(match[2])));
  const dlPattern = /<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi;
  for (const match of html.matchAll(dlPattern)) addAttribute(result, cleanText(stripTags(match[1])), cleanText(stripTags(match[2])));
  const common: Array<[string, RegExp]> = [
    ["capacity", /(?:^|\n)(?:Capacity|Χωρητικότητα)\s*:\s*([^\n]{1,100})/i],
    ["weight", /(?:^|\n)(?:Weight|Βάρος)\s*:\s*([^\n]{1,100})/i],
    ["dimensions", /(?:^|\n)(?:Dimensions|Διαστάσεις)\s*:\s*([^\n]{1,160})/i],
    ["material", /(?:^|\n)(?:Material|Υλικό)\s*:\s*([^\n]{1,120})/i],
    ["color", /(?:^|\n)(?:Color|Colour|Χρώμα)\s*:\s*([^\n]{1,120})/i],
    ["size", /(?:^|\n)(?:Size|Μέγεθος)\s*:\s*([^\n]{1,120})/i]
  ];
  for (const [key, pattern] of common) {
    const match = pattern.exec(visible);
    if (match) addAttribute(result, key, match[1]);
  }
  const dimensionLine = /\bH\.?\s*([0-9.,]+\s*cm)\s*[|x×]\s*L\.?\s*([0-9.,]+\s*cm)\s*[|x×]\s*W\.?\s*([0-9.,]+\s*cm)/i.exec(visible);
  if (dimensionLine) result.dimensions = `H ${dimensionLine[1]} | L ${dimensionLine[2]} | W ${dimensionLine[3]}`;
  return result;
}

function selectedVariantAttributes(html: string, visible: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of ["color", "size"] as const) {
    const selected = new RegExp(`<select\\b[^>]*(?:name|id)=["'][^"']*${key}[^"']*["'][^>]*>[\\s\\S]*?<option\\b[^>]*selected[^>]*>([\\s\\S]*?)<\\/option>`, "i").exec(html);
    if (selected) result[key] = cleanText(stripTags(selected[1])) ?? "";
    if (!result[key]) {
      const label = labeledValue(visible, [key === "color" ? "Color" : "Size", key === "color" ? "Χρώμα" : "Μέγεθος"]);
      if (label) result[key] = label;
    }
  }
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value));
}

function extractCategoryPath(html: string, visible: string): string[] | undefined {
  const line = /(?:^|\n)(?:Categories|Κατηγορίες)\s*:\s*([^\n]{2,500})/i.exec(visible)?.[1];
  if (line) {
    const first = line.split(/\s*,\s*/)[0];
    const path = first.split(/\s*(?:>|›|→)\s*/).map(cleanText).filter((value): value is string => Boolean(value));
    if (path.length) return path;
  }
  const crumb = /<(?:nav|div|ol|ul)\b[^>]*(?:class|id)=["'][^"']*breadcrumb[^"']*["'][^>]*>([\s\S]*?)<\/(?:nav|div|ol|ul)>/i.exec(html)?.[1];
  if (!crumb) return undefined;
  const text = cleanText(stripTags(crumb).replace(/\s*(?:›|»|→)\s*/g, " > "));
  if (!text) return undefined;
  const path = text.split(/\s*>\s*/).map(cleanText).filter((value): value is string => Boolean(value));
  return path.length ? path.slice(-8) : undefined;
}

function productDescription(html: string, visible: string, meta: MetaMap, title: string): string | undefined {
  const metaDescription = trimDescription(firstMeta(meta, ["og:description", "twitter:description", "description"]));
  if (metaDescription && metaDescription.length >= 30 && !isGenericDescription(metaDescription, title)) return metaDescription;
  const classMatch = /<(?:div|section|p)\b[^>]*(?:class|id)=["'][^"']*(?:short-description|product-description|product__description|product-summary|entry-summary)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section|p)>/i.exec(html)?.[1];
  const classText = trimDescription(classMatch ? cleanText(stripTags(classMatch)) : undefined);
  if (classText && classText.length >= 30) return classText;
  const lines = visible.split("\n").map((line) => line.trim()).filter(Boolean);
  const titleIndex = lines.findIndex((line) => normalizedContains(line, title));
  if (titleIndex >= 0) {
    const collected: string[] = [];
    for (let index = titleIndex + 1; index < Math.min(lines.length, titleIndex + 24); index += 1) {
      const line = lines[index];
      if (/^(?:Categories|Κατηγορίες|Dimensions|Διαστάσεις|Technical Details|Specifications|Τεχνικά Χαρακτηριστικά)\b/i.test(line)) break;
      if (/^(?:SKU|EAN|GTIN|MPN|R\.?R\.?P\.?|MSRP|Price|Τιμή)\b/i.test(line) || /^\d{4,12}-\d{2,12}\s*\[?\s*(?:R\.?R\.?P|MSRP)/i.test(line)) continue;
      if (line.length >= 20) collected.push(line);
      if (collected.join(" ").length >= 1200) break;
    }
    const result = trimDescription(collected.join("\n"));
    if (result && result.length >= 30) return result;
  }
  return undefined;
}

function collectMeta(html: string): MetaMap {
  const map: MetaMap = new Map();
  for (const match of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs = parseAttributes(match[1] ?? "");
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop ?? "").trim().toLowerCase();
    const value = decodeEntities((attrs.content ?? attrs.value ?? "").trim());
    if (!key || !value) continue;
    const list = map.get(key) ?? [];
    list.push(value);
    map.set(key, list);
  }
  return map;
}

function firstMeta(meta: MetaMap, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = meta.get(key.toLowerCase())?.find(Boolean);
    if (value) return value;
  }
  return undefined;
}
function allMeta(meta: MetaMap, keys: readonly string[]): string[] { return keys.flatMap((key) => meta.get(key.toLowerCase()) ?? []); }
function hasMeta(meta: MetaMap, keys: readonly string[]): boolean { return Boolean(firstMeta(meta, keys)); }
function metaItem(meta: MetaMap, keys: readonly string[]): string | undefined { return firstMeta(meta, keys); }

function canonicalUrl(html: string, sourceUrl: string): string {
  const match = /<link\b([^>]*)>/gi;
  for (const item of html.matchAll(match)) {
    const attrs = parseAttributes(item[1] ?? "");
    if ((attrs.rel ?? "").toLowerCase().split(/\s+/).includes("canonical")) return resolveHttpUrl(attrs.href ?? "", sourceUrl) ?? sourceUrl;
  }
  return sourceUrl;
}

function extractH1(html: string): string | undefined {
  const match = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  return match ? cleanText(stripTags(match[1])) : undefined;
}
function documentTitle(html: string): string | undefined { const match=/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html); return match ? cleanText(match[1]) : undefined; }

function headerIdentityNearPrice(visible: string): string | undefined {
  const lines = visible.split("\n").slice(0, 80);
  for (const line of lines) {
    if (!/(?:R\.?R\.?P\.?|MSRP|€|EUR|Price|Τιμή)/i.test(line)) continue;
    const match = /\b([A-Z0-9]{3,12}-[A-Z0-9]{2,12})\b/i.exec(line);
    if (match && !/^\d{4}-\d{2}-\d{2}$/.test(match[1])) return match[1];
  }
  return undefined;
}

function labeledValue(visible: string, labels: readonly string[]): string | undefined {
  for (const label of labels) {
    const escaped = escapeRegex(label);
    const match = new RegExp(`(?:^|\\n|\\b)${escaped}\\s*[:#\\-]?\\s*([^\\n|]{2,120})`, "i").exec(visible);
    if (match) {
      const value = cleanText(match[1]);
      if (value) return value.replace(/^[:#\-\s]+/, "").trim();
    }
  }
  return undefined;
}

function attributeValue(html: string, names: readonly string[]): string | undefined {
  for (const name of names) {
    const match = new RegExp(`${escapeRegex(name)}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|([^\\s>]+))`, "i").exec(html);
    const value = cleanText(match?.[1] ?? match?.[2] ?? match?.[3]);
    if (value) return value;
  }
  return undefined;
}

function visibleText(html: string): string {
  return decodeEntities(html
    .replace(/<(?:script|style|template|svg|noscript)\b[\s\S]*?<\/(?:script|style|template|svg|noscript)>/gi, " ")
    .replace(/<(?:br|p|div|section|article|li|tr|h[1-6]|dt|dd)\b[^>]*>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|li|tr|h[1-6]|dt|dd)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, ""))
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function productUrlLikelihood(rawUrl: string): number {
  const url = new URL(rawUrl);
  const path = url.pathname.toLowerCase();
  if (/\/(?:product|products|p|item|sku)\//.test(path) || /(?:product-|\/p-)/.test(path)) return 0.82;
  if (/\/(?:product-category|collections?|category|search)(?:\/|$)/.test(path)) return 0.05;
  const segments = path.split("/").filter(Boolean);
  const tail = segments.at(-1) ?? "";
  if (segments.length >= 3 && /(?:^|[-_])\d{3,12}(?:[-_]|$)/.test(tail)) return 0.68;
  if (segments.length >= 4 && /\b(?:bag|backpack|shoe|shirt|dress|tool|phone|laptop|watch|camera)s?\b/.test(path)) return 0.5;
  return 0.12;
}

function looksLikeJavascriptShell(html: string, visible: string): boolean {
  if (/checking your browser|please wait while your request is being verified|enable javascript and cookies|cf-chl-/i.test(html)) return true;
  const appShell = /id=["'](?:__next|root|app|__nuxt)["']/i.test(html) || /__NEXT_DATA__|__NUXT__|webpackChunk/i.test(html);
  return appShell && visible.length < 600;
}

function walkJson(value: unknown, visit: (record: Record<string, unknown>) => void): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let seen = 0;
  while (stack.length && seen < MAX_EMBEDDED_JSON_NODES) {
    const current = stack.pop()!;
    if (current.depth > 9 || current.value == null) continue;
    seen += 1;
    if (Array.isArray(current.value)) {
      for (let index = current.value.length - 1; index >= 0; index -= 1) stack.push({ value: current.value[index], depth: current.depth + 1 });
      continue;
    }
    if (typeof current.value !== "object") continue;
    const record = current.value as Record<string, unknown>;
    visit(record);
    for (const child of Object.values(record)) if (child && typeof child === "object") stack.push({ value: child, depth: current.depth + 1 });
  }
}

function parseAttributes(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of raw.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    result[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return result;
}

function addAttribute(target: Record<string, string>, rawKey: string | undefined, rawValue: string | undefined): void {
  const key = cleanText(rawKey)?.replace(/\s+/g, " ").slice(0, 100);
  const value = cleanText(rawValue)?.replace(/\s+/g, " ").slice(0, 500);
  if (!key || !value || key.length < 2 || value.length < 1) return;
  const normalized = key.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "").slice(0, 80);
  if (normalized && !(normalized in target)) target[normalized] = value;
}

function decimalToMinor(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(normalized)) return undefined;
  const value = Number(normalized);
  const minor = Math.round(value * 100);
  return Number.isFinite(value) && value >= 0 && Number.isSafeInteger(minor) ? minor : undefined;
}
function normalizeCurrency(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toUpperCase();
  if (value === "€" || value === "EUR") return "EUR";
  if (value === "$" || value === "USD") return "USD";
  if (value === "£" || value === "GBP") return "GBP";
  return /^[A-Z]{3}$/.test(value) ? value : undefined;
}
function currencyNear(text: string, index: number): string | undefined { const sample=text.slice(Math.max(0,index-30),index+100); return normalizeCurrency(/(€|EUR|\$|USD|£|GBP)/i.exec(sample)?.[1]); }
function digitsOnly(value: string | undefined): string | undefined { const digits=value?.replace(/[^0-9]/g, ""); return digits && [8,12,13,14].includes(digits.length) ? digits : undefined; }
function cleanIdentity(value: string | undefined): string | undefined { const cleaned=cleanText(value)?.replace(/^[#:\s]+|[\s,;]+$/g, ""); return cleaned && cleaned.length <= 160 ? cleaned : undefined; }
function cleanTitle(value: string | undefined): string | undefined { const cleaned=cleanText(value)?.replace(/\s+(?:[-–—|•]{1,2})\s+(?:NEW-)?[^-–—|•]{2,80}$/i, "").trim(); return cleaned || undefined; }
function trimDescription(value: string | undefined): string | undefined { const cleaned=cleanText(value); return cleaned ? cleaned.slice(0, MAX_DESCRIPTION) : undefined; }
function isGenericDescription(description: string, title: string): boolean { return description.length < 30 || (/home|welcome|online shop|e-shop/i.test(description) && !normalizedContains(description,title)); }
function normalizedContains(value: string, needle: string): boolean { const normalize=(text:string)=>text.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim(); const n=normalize(needle); return Boolean(n) && normalize(value).includes(n.slice(0, Math.min(n.length,60))); }
function scalar(value: unknown): string | undefined { if (typeof value === "string" || typeof value === "number") { const text=String(value).trim(); return text || undefined; } return undefined; }
function objectName(value: unknown): string | undefined { return value && typeof value === "object" && !Array.isArray(value) ? scalar((value as Record<string, unknown>).name) : undefined; }
function firstDefined(...values: Array<string | undefined>): string | undefined { return values.find((value) => Boolean(value)); }
function firstSrcset(value: string | undefined): string | undefined { if (!value) return undefined; return value.split(",").map((part)=>part.trim().split(/\s+/)[0]).filter(Boolean).at(-1); }
function resolveHttpUrl(raw: string, baseUrl: string): string | undefined { if (!raw || /^(?:data|javascript|mailto|tel):/i.test(raw)) return undefined; try { const url=new URL(raw,baseUrl); if (!/^https?:$/.test(url.protocol)) return undefined; url.hash=""; return url.toString(); } catch { return undefined; } }
function stripTags(value: string): string { return value.replace(/<[^>]*>/g, " "); }
function cleanText(value: string | undefined): string | undefined { if (!value) return undefined; const text=decodeEntities(value).replace(/\s+/g," ").trim(); return text || undefined; }
function decodeEntities(value: string): string { return value.replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(\d+);/g,(_,digits:string)=>String.fromCodePoint(Number(digits))).replace(/&#x([0-9a-f]+);/gi,(_,digits:string)=>String.fromCodePoint(Number.parseInt(digits,16))); }
function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function dedupeCandidates(values: readonly ExtractedProductCandidate[]): ExtractedProductCandidate[] { const seen=new Set<string>(); return values.filter((value)=>{ const key=`${value.sourceProductKey}\u0000${value.title}`.toLowerCase(); if(seen.has(key)) return false; seen.add(key); return true; }); }
function dedupeImages(values: readonly ExtractedImage[]): ExtractedImage[] { const seen=new Set<string>(); return values.filter((value)=>{ if(seen.has(value.url)) return false; seen.add(value.url); return true; }); }
function dedupePrices(values: readonly ExtractedPrice[]): ExtractedPrice[] { const seen=new Set<string>(); return values.filter((value)=>{ const key=`${value.kind}:${value.currency}:${value.amountMinor}`; if(seen.has(key)) return false; seen.add(key); return true; }); }
