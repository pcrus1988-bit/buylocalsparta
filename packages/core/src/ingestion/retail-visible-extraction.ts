import type { ExtractedImage, ExtractedPrice, ExtractedProductCandidate, ProductFieldEvidence } from "./types.ts";

const MAX_ATTRIBUTES = 160;
const MAX_IMAGES = 24;

/** Generic fallback for server-rendered retailer pages whose product data is
 * visible to humans but not exposed as Product JSON-LD/microdata. */
export function extractRetailVisibleProductCandidate(html: string, sourceUrl: string): ExtractedProductCandidate | undefined {
  const visible = visibleText(html);
  const lines = visible.split("\n").map((line) => line.trim()).filter(Boolean);
  const canonical = canonicalUrl(html, sourceUrl);
  if (isListingPage(canonical, visible, html)) return undefined;

  const title = cleanText(h1(html) ?? metaContent(html, ["og:title", "twitter:title"]) ?? documentTitle(html));
  if (!title || title.length < 3 || title.length > 500) return undefined;

  const sku = retailerCode(visible);
  const gtin = gtinValue(visible);
  const description = descriptionText(lines, title);
  const attributes = specificationPairs(html, lines);
  const prices = visiblePrices(html, lines, canonical, title);
  const images = productImages(html, canonical, title);
  const categoryPath = categoryPathFrom(html, canonical);
  const urlScore = productUrlScore(canonical);

  let score = Math.round(urlScore * 5);
  const signals: string[] = [];
  if (urlScore >= 0.65) signals.push("product_url");
  if (sku) { score += 4; signals.push("retailer_code"); }
  if (gtin) { score += 4; signals.push("gtin"); }
  if (prices.length) { score += 3; signals.push("visible_price"); }
  if (description) { score += 2; signals.push("description_section"); }
  if (Object.keys(attributes).length >= 2) { score += 3; signals.push("specification_pairs"); }
  if (images.length) { score += 1; signals.push("product_images"); }
  if (/(?:add to cart|add to basket|buy now|προσθήκη|αγορά)/i.test(visible.slice(0, 5000))) { score += 1; signals.push("purchase_action"); }
  if (score < 8 || (!sku && !gtin && urlScore < 0.8)) return undefined;

  const evidence = (selector: string, confidence: number): ProductFieldEvidence => ({ origin: "html", sourceUrl: canonical, confidence, selector });
  const fieldEvidence: Record<string, ProductFieldEvidence | readonly ProductFieldEvidence[]> = { title: evidence("h1/meta:title", 0.91) };
  if (sku) fieldEvidence.sku = evidence("retailer product code", 0.93);
  if (gtin) fieldEvidence.gtin = evidence("gtin/ean/upc", 0.94);
  if (description) fieldEvidence.description = evidence("description section", 0.88);
  if (prices.length) fieldEvidence.prices = prices.map((price) => price.evidence);
  if (images.length) fieldEvidence.images = images.map((image) => image.evidence);
  if (categoryPath?.length) fieldEvidence.categoryPath = evidence("breadcrumb/url categories", 0.78);
  for (const key of Object.keys(attributes)) fieldEvidence[key] = evidence(`visible spec:${key}`, 0.82);

  const brand = inferBrand(title, attributes);
  if (brand) fieldEvidence.brand = evidence("brand from specs/title", 0.72);

  return {
    sourceProductKey: sku ?? gtin ?? canonical,
    sourceUrl: canonical,
    title,
    description,
    brand,
    gtin,
    sku,
    categoryPath,
    attributes,
    variantAttributes: variantAttributes(attributes),
    prices: prices.length ? prices : undefined,
    images: images.length ? images : undefined,
    fieldEvidence,
    rawPayload: { extractionStrategy: "retail_visible_text", score, signals, specificationCount: Object.keys(attributes).length }
  };
}

function retailerCode(text: string): string | undefined {
  const patterns = [
    /(?:^|\n)\s*(?:Κωδικός|Κωδ\.?|Code)\s+(?:Πλαίσιο|Καταστήματος|Προϊόντος|Product|Item|Retailer)\s*[:#-]?\s*([A-Z0-9._\/-]{3,60})(?=\s|$)/im,
    /(?:^|\n)\s*(?:SKU|Product\s*Code|Item\s*Code|Retailer\s*Code|Reference|Ref\.)\s*[:#-]?\s*([A-Z0-9._\/-]{3,60})(?=\s|$)/im,
    /(?:^|\n)\s*(?:Κωδικός|Κωδ\.)\s*[:#-]?\s*([A-Z0-9._\/-]{3,60})(?=\s|$)/im
  ];
  for (const pattern of patterns) {
    const value = plausibleCode(pattern.exec(text)?.[1]);
    if (value) return value;
  }
  return undefined;
}

function gtinValue(text: string): string | undefined {
  const raw = /(?:^|\n)\s*(?:GTIN(?:-?13)?|EAN(?:-?13)?|UPC|Barcode|ISBN)\s*[:#-]?\s*([0-9][0-9\s-]{6,20})(?=\s|$)/im.exec(text)?.[1];
  const digits = raw?.replace(/\D/g, "");
  return digits && [8, 12, 13, 14].includes(digits.length) ? digits : undefined;
}

function descriptionText(lines: readonly string[], title: string): string | undefined {
  const heading = lines.findIndex((line) => /^(?:Περιγραφή|Description|Product Description|Σύντομη Περιγραφή)\s*:?$/i.test(line));
  if (heading >= 0) {
    const collected: string[] = [];
    for (let i = heading + 1; i < Math.min(lines.length, heading + 24); i += 1) {
      const line = lines[i];
      if (majorHeading(line)) break;
      if (noise(line) || priceIn(line) || codeLabel(line)) continue;
      if (line.length >= 20) collected.push(line);
      if (collected.join(" ").length >= 4000) break;
    }
    const result = cleanText(collected.join("\n"));
    if (result && result.length >= 30) return result.slice(0, 4000);
  }
  const titleIndex = lines.findIndex((line) => normalizedContains(line, title));
  if (titleIndex < 0) return undefined;
  const collected: string[] = [];
  for (let i = titleIndex + 1; i < Math.min(lines.length, titleIndex + 40); i += 1) {
    const line = lines[i];
    if (/^(?:Χαρακτηριστικά|Specifications|Technical Details)\s*:?$/i.test(line)) break;
    if (noise(line) || priceIn(line) || codeLabel(line)) continue;
    if (line.length >= 40) collected.push(line);
    if (collected.join(" ").length >= 1200) break;
  }
  const result = cleanText(collected.join("\n"));
  return result && result.length >= 60 ? result.slice(0, 4000) : undefined;
}

function specificationPairs(html: string, lines: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of html.matchAll(/<tr\b[^>]*>[\s\S]*?<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>[\s\S]*?<td\b[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi)) addAttribute(result, cleanText(stripTags(match[1])), cleanText(stripTags(match[2])));
  for (const match of html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)) addAttribute(result, cleanText(stripTags(match[1])), cleanText(stripTags(match[2])));

  for (const line of lines) {
    const inline = /^([^:]{2,80}):\s*(.{1,180})$/.exec(line);
    if (inline && specLabel(inline[1])) addAttribute(result, inline[1], inline[2]);
    if (Object.keys(result).length >= MAX_ATTRIBUTES) return result;
  }

  const starts = lines.map((line, index) => /^(?:Χαρακτηριστικά|Specifications|Technical Details|Τεχνικά Χαρακτηριστικά)\s*:?$/i.test(line) ? index : -1).filter((index) => index >= 0);
  for (const start of starts) {
    for (let i = start + 1; i + 1 < Math.min(lines.length, start + 320); i += 1) {
      const label = cleanText(lines[i]?.replace(/[—–-]+$/, ""));
      const value = cleanText(lines[i + 1]?.replace(/[—–-]+$/, ""));
      if (!label || !value || majorHeading(label) || noise(label) || noise(value) || priceIn(label) || priceIn(value) || codeLabel(label)) continue;
      if (!specLabel(label) || !specValue(value)) continue;
      addAttribute(result, label, value);
      if (Object.keys(result).length >= MAX_ATTRIBUTES) return result;
    }
  }
  return result;
}

function visiblePrices(html: string, lines: readonly string[], sourceUrl: string, title: string): ExtractedPrice[] {
  const result: ExtractedPrice[] = [];
  const add = (pair: PricePair | undefined, kind: ExtractedPrice["kind"], selector: string, confidence: number) => {
    if (!pair) return;
    const amountMinor = toMinor(pair.amount);
    const currency = currencyCode(pair.currency);
    if (amountMinor === undefined || amountMinor <= 0 || !currency) return;
    result.push({ amountMinor, currency, kind, evidence: { origin: "html", sourceUrl, confidence, selector } });
  };

  for (const match of html.matchAll(/<del\b[^>]*>([\s\S]*?)<\/del>[\s\S]{0,1200}?<ins\b[^>]*>([\s\S]*?)<\/ins>/gi)) {
    add(parsePrice(cleanText(stripTags(match[1])) ?? ""), "rrp", "del:old-price", 0.94);
    add(parsePrice(cleanText(stripTags(match[2])) ?? ""), "promotion", "ins:current-price", 0.96);
  }

  const titleIndex = lines.findIndex((line) => normalizedContains(line, title));
  const start = Math.max(0, titleIndex >= 0 ? titleIndex - 8 : 0);
  const end = Math.min(lines.length, (titleIndex >= 0 ? titleIndex : 0) + 55);
  const pairs: PricePair[] = [];
  for (let i = start; i < end; i += 1) {
    if (/μήνα|month|δόσ|installment/i.test(lines[i])) continue;
    const pair = parsePrice(lines[i]);
    if (pair) pairs.push(pair);
  }
  const unique = uniquePrices(pairs);
  if (unique.length === 1) add(unique[0], "selling", "visible:primary-price", 0.9);
  else if (unique.length >= 2) {
    const valued = unique.map((pair) => ({ pair, minor: toMinor(pair.amount) ?? 0 })).filter((item) => item.minor > 0);
    if (valued.length) {
      const high = valued.reduce((a, b) => a.minor >= b.minor ? a : b);
      const low = valued.reduce((a, b) => a.minor <= b.minor ? a : b);
      if (high.minor !== low.minor) { add(high.pair, "rrp", "visible:old/list-price", 0.82); add(low.pair, "promotion", "visible:current-price", 0.88); }
      else add(low.pair, "selling", "visible:primary-price", 0.88);
    }
  }
  return dedupePrices(result).slice(0, 4);
}

type PricePair = { amount: string; currency: string };
function parsePrice(line: string): PricePair | undefined {
  const after = /([0-9]{1,3}(?:[.\s][0-9]{3})*(?:,[0-9]{1,2})?|[0-9]{1,7}(?:\.[0-9]{1,2})?)\s*(€|EUR|\$|USD|£|GBP)/i.exec(line);
  if (after) return { amount: after[1], currency: after[2] };
  const before = /(€|EUR|\$|USD|£|GBP)\s*([0-9]{1,3}(?:[.\s][0-9]{3})*(?:,[0-9]{1,2})?|[0-9]{1,7}(?:\.[0-9]{1,2})?)/i.exec(line);
  return before ? { amount: before[2], currency: before[1] } : undefined;
}
function uniquePrices(values: readonly PricePair[]): PricePair[] { const seen = new Set<string>(); return values.filter((value) => { const key = `${currencyCode(value.currency)}:${toMinor(value.amount)}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function toMinor(raw: string): number | undefined {
  let value = raw.trim().replace(/\s/g, "");
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(value)) value = value.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(value)) value = value.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(value)) value = value.replace(",", ".");
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(value)) return undefined;
  const number = Number(value); const minor = Math.round(number * 100);
  return Number.isFinite(number) && Number.isSafeInteger(minor) ? minor : undefined;
}
function currencyCode(raw: string): string | undefined { const value = raw.trim().toUpperCase(); if (value === "€" || value === "EUR") return "EUR"; if (value === "$" || value === "USD") return "USD"; if (value === "£" || value === "GBP") return "GBP"; return undefined; }

function productImages(html: string, sourceUrl: string, title: string): ExtractedImage[] {
  const result: ExtractedImage[] = [];
  for (const match of html.matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = attrsFrom(match[1] ?? "");
    const alt = cleanText(attrs.alt ?? attrs.title);
    const classes = `${attrs.class ?? ""} ${attrs.id ?? ""}`;
    const raw = attrs["data-large_image"] ?? attrs["data-zoom-image"] ?? attrs["data-original"] ?? attrs["data-src"] ?? attrs.src ?? largestSrcset(attrs.srcset);
    const url = raw ? httpUrl(raw, sourceUrl) : undefined;
    if (!url || /(?:logo|icon|sprite|avatar|payment|badge|loader|placeholder)/i.test(url)) continue;
    const sameTitle = Boolean(alt && normalizedContains(alt, title));
    if (!sameTitle && !/(?:product|gallery|carousel|zoom|main-image|detail)/i.test(classes) && !/(?:product|large|zoom)/i.test(url)) continue;
    result.push({ url, alt, evidence: { origin: "html", sourceUrl, confidence: sameTitle ? 0.88 : 0.76, selector: "img:retail-product" } });
    if (result.length >= MAX_IMAGES * 2) break;
  }
  return dedupeImages(result).slice(0, MAX_IMAGES);
}

function categoryPathFrom(html: string, sourceUrl: string): string[] | undefined {
  const crumb = /<(?:nav|ol|ul|div)\b[^>]*(?:class|id)=["'][^"']*(?:breadcrumb|breadcrumbs)[^"']*["'][^>]*>([\s\S]*?)<\/(?:nav|ol|ul|div)>/i.exec(html)?.[1];
  if (crumb) {
    const path = cleanText(stripTags(crumb).replace(/\s*(?:›|»|→|>)\s*/g, " > "))?.split(/\s*>\s*/).map(cleanText).filter((value): value is string => Boolean(value));
    if (path && path.length >= 2) return path.slice(-8);
  }
  try {
    const segments = new URL(sourceUrl).pathname.split("/").filter(Boolean);
    const index = segments.findIndex((segment) => /^(?:product|products|item|p)$/i.test(segment));
    if (index >= 0 && segments.length > index + 2) return segments.slice(index + 1, -1).map((segment) => decodeURIComponent(segment).replace(/[-_]+/g, " ").trim()).filter(Boolean).slice(-8);
  } catch {}
  return undefined;
}

function inferBrand(title: string, attributes: Readonly<Record<string, string>>): string | undefined {
  for (const [key, value] of Object.entries(attributes)) if (/^(?:brand|μάρκα|κατασκευαστής|manufacturer)$/i.test(key.replace(/_/g, " ")) && value.length <= 60) return value;
  const first = title.split(/\s+/)[0]?.replace(/[^\p{L}\p{N}.&+-]/gu, "");
  return first && first.length >= 2 && first.length <= 30 && !/^\d+$/.test(first) ? first : undefined;
}
function variantAttributes(attributes: Readonly<Record<string, string>>): Record<string, string> | undefined { const result: Record<string, string> = {}; for (const [key, value] of Object.entries(attributes)) { if (/(?:^|_)(?:color|colour|χρώμα)(?:_|$)/i.test(key)) result.color = value; if (/(?:^|_)(?:size|μέγεθος)(?:_|$)/i.test(key)) result.size = value; } return Object.keys(result).length ? result : undefined; }

function isListingPage(sourceUrl: string, visible: string, html: string): boolean { let path = ""; try { path = new URL(sourceUrl).pathname.toLowerCase(); } catch {} if (/\/(?:collection|collections|list|search|category)(?:\/|$)/.test(path)) return true; if (/(?:collection-template|category-page|search-results|product-listing|product-grid)/i.test(html) && !/\/(?:product|products|item|p)\//.test(path)) return true; return /\d{1,5}\s*(?:προϊόντα|products)/i.test(visible) && !/\/(?:product|products|item|p)\//.test(path); }
function productUrlScore(sourceUrl: string): number { try { const path = new URL(sourceUrl).pathname.toLowerCase(); if (/\/(?:product|products|item|sku|p)\//.test(path)) return 0.95; if (/\/(?:collection|collections|list|search|category)(?:\/|$)/.test(path)) return 0.05; const tail = path.split("/").filter(Boolean).at(-1) ?? ""; if (/(?:^|[-_])\d{4,12}$/.test(tail)) return 0.82; } catch {} return 0.2; }
function majorHeading(line: string): boolean { return /^(?:Χαρακτηριστικά|Specifications|Technical Details|Τεχνικά Χαρακτηριστικά|Με μία ματιά!?|Overview|Reviews?|Αξιολογήσεις|Σχετικά προϊόντα|Related Products|Περιγραφή|Description)\s*:?$/i.test(line); }
function specLabel(line: string): boolean { const value = line.replace(/[—–-]+$/, "").trim(); return value.length >= 2 && value.length <= 90 && value.split(/\s+/).length <= 9 && !priceIn(value) && !codeLabel(value) && !noise(value) && !/[.!?]$/.test(value) && /\p{L}/u.test(value); }
function specValue(line: string): boolean { return line.length >= 1 && line.length <= 180 && !noise(line) && !majorHeading(line) && !/^(?:\+|—|-)$/.test(line) && /[\p{L}\p{N}]/u.test(line); }
function addAttribute(target: Record<string, string>, rawKey: string | undefined, rawValue: string | undefined): void { if (Object.keys(target).length >= MAX_ATTRIBUTES) return; const key = cleanText(rawKey)?.replace(/[—–-]+$/, "").slice(0, 100); const value = cleanText(rawValue)?.slice(0, 500); if (!key || !value || key.length < 2 || normalizedEqual(key, value)) return; const normalized = key.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "").slice(0, 80); if (normalized && !(normalized in target)) target[normalized] = value; }
function priceIn(line: string): boolean { return Boolean(parsePrice(line)); }
function codeLabel(line: string): boolean { return /(?:SKU|GTIN|EAN|UPC|Κωδ(?:ικός|\.)?|Product\s*Code|Item\s*Code)/i.test(line); }
function noise(line: string): boolean { return /^(?:Προσθήκη|Προσθήκη στα Αγαπημένα|Αγαπημένα|Εκτύπωσέ το|Παράδοση|Παραλαβή|Μη διαθέσιμο|Διαθέσιμο|Add to cart|Add|Buy now|Wishlist|Print|Share|Προστάτεψε την αγορά σου|Υπηρεσίες υποστήριξης)$/i.test(line.trim()); }
function plausibleCode(raw: string | undefined): string | undefined { const value = cleanText(raw)?.replace(/^[#:\s-]+|[.,;:\s]+$/g, ""); return value && value.length >= 3 && value.length <= 60 && value.split(/\s+/).length <= 2 && /^[A-Z0-9][A-Z0-9._\/-]*$/i.test(value) ? value : undefined; }

function canonicalUrl(html: string, sourceUrl: string): string { for (const match of html.matchAll(/<link\b([^>]*)>/gi)) { const attrs = attrsFrom(match[1] ?? ""); if ((attrs.rel ?? "").toLowerCase().split(/\s+/).includes("canonical")) return httpUrl(attrs.href ?? "", sourceUrl) ?? sourceUrl; } return sourceUrl; }
function h1(html: string): string | undefined { return cleanText(stripTags(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? "")); }
function documentTitle(html: string): string | undefined { return cleanText(stripTags(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "")); }
function metaContent(html: string, names: readonly string[]): string | undefined { for (const match of html.matchAll(/<meta\b([^>]*)>/gi)) { const attrs = attrsFrom(match[1] ?? ""); const key = (attrs.property ?? attrs.name ?? "").toLowerCase(); if (names.some((name) => key === name.toLowerCase())) return cleanText(attrs.content); } return undefined; }
function visibleText(html: string): string { return decodeEntities(html.replace(/<(?:script|style|template|svg|noscript)\b[\s\S]*?<\/(?:script|style|template|svg|noscript)>/gi, " ").replace(/<(?:br|p|div|section|article|li|tr|h[1-6]|dt|dd|th|td)\b[^>]*>/gi, "\n").replace(/<\/(?:p|div|section|article|li|tr|h[1-6]|dt|dd|th|td)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/\r/g, "")).split("\n").map((line) => line.replace(/[\t ]+/g, " ").trim()).filter(Boolean).join("\n"); }
function attrsFrom(raw: string): Record<string, string> { const result: Record<string, string> = {}; for (const match of raw.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) result[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? ""); return result; }
function largestSrcset(value: string | undefined): string | undefined { return value?.split(",").map((part) => part.trim().split(/\s+/)[0]).filter(Boolean).at(-1); }
function httpUrl(raw: string, baseUrl: string): string | undefined { if (!raw || /^(?:data|javascript|mailto|tel):/i.test(raw)) return undefined; try { const url = new URL(raw, baseUrl); if (!/^https?:$/.test(url.protocol)) return undefined; url.hash = ""; return url.toString(); } catch { return undefined; } }
function normalizedContains(value: string, needle: string): boolean { const normalize = (text: string) => text.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(); const target = normalize(needle); return Boolean(target) && normalize(value).includes(target.slice(0, Math.min(target.length, 70))); }
function normalizedEqual(left: string, right: string): boolean { const n = (value: string) => value.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""); return n(left) === n(right); }
function cleanText(value: string | undefined): string | undefined { const text = value ? decodeEntities(value).replace(/\s+/g, " ").trim() : ""; return text || undefined; }
function stripTags(value: string): string { return value.replace(/<[^>]*>/g, " "); }
function decodeEntities(value: string): string { return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&euro;/gi, "€").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&#8364;|&#x20ac;/gi, "€").replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits))).replace(/&#x([0-9a-f]+);/gi, (_, digits: string) => String.fromCodePoint(Number.parseInt(digits, 16))); }
function dedupeImages(values: readonly ExtractedImage[]): ExtractedImage[] { const seen = new Set<string>(); return values.filter((value) => { if (seen.has(value.url)) return false; seen.add(value.url); return true; }); }
function dedupePrices(values: readonly ExtractedPrice[]): ExtractedPrice[] { const seen = new Set<string>(); return values.filter((value) => { const key = `${value.kind}:${value.currency}:${value.amountMinor}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
