import type { ExtractedImage, ExtractedProductCandidate, ProductFieldEvidence } from "./types.ts";

const FOURNARAKIS_HOST = "fournarakis.gr";
const PRODUCT_PATH = /^\/el\/product\/([^/]+)(?:\/|$)/i;
const CATALOG_PATH = /^\/el\/catalog(?:\/|$)/i;
const MAX_VARIANTS = 200;
const MAX_IMAGES = 12;

export function isFournarakisSourceUrl(rawUrl: string): boolean {
  try {
    return normalizedHost(new URL(rawUrl).hostname) === FOURNARAKIS_HOST;
  } catch {
    return false;
  }
}

export function isFournarakisProductUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return normalizedHost(url.hostname) === FOURNARAKIS_HOST && PRODUCT_PATH.test(url.pathname);
  } catch {
    return false;
  }
}

export function normalizeFournarakisDiscoveredUrl(rawUrl: string, seedUrl: string): string | undefined {
  if (!isFournarakisSourceUrl(seedUrl)) return rawUrl;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return undefined;
  }
  if (normalizedHost(url.hostname) !== FOURNARAKIS_HOST) return undefined;
  if (!(PRODUCT_PATH.test(url.pathname) || CATALOG_PATH.test(url.pathname))) return undefined;
  url.protocol = "https:";
  url.hostname = "www.fournarakis.gr";
  url.hash = "";
  url.search = "";
  return url.toString();
}

export function extractFournarakisProductCandidates(html: string, sourceUrl: string): readonly ExtractedProductCandidate[] {
  if (!isFournarakisProductUrl(sourceUrl)) return [];
  const url = new URL(sourceUrl);
  const familyCode = PRODUCT_PATH.exec(url.pathname)?.[1]?.trim();
  const title = cleanText(firstMatch(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i));
  if (!familyCode || !title) return [];

  const headers = extractVariantHeaders(html);
  const rows = extractVariantRows(html, headers.length);
  if (headers.length < 2 || !rows.length) return [];

  const canonical = canonicalUrl(html, sourceUrl);
  const brand = extractBrand(html);
  const categoryPath = extractCategoryPath(html);
  const description = extractSummaryDescription(html);
  const images = extractProductImages(html, canonical, familyCode, title);
  const badges = extractBadges(html);
  const now = new Date().toISOString();

  const evidence = (selector: string, confidence = 0.96, note?: string): ProductFieldEvidence => ({
    origin: "html",
    sourceUrl: canonical,
    confidence,
    selector,
    note
  });

  const candidates: ExtractedProductCandidate[] = [];
  for (const values of rows.slice(0, MAX_VARIANTS)) {
    const sku = cleanText(values[0]);
    if (!sku || !/^[0-9A-Za-z][0-9A-Za-z._/-]{1,80}$/.test(sku)) continue;

    const attributes: Record<string, string> = {};
    const variantAttributes: Record<string, string> = {};
    const rawVariant: Record<string, string> = {};

    for (let index = 1; index < Math.min(headers.length, values.length); index += 1) {
      const label = cleanText(headers[index]);
      const value = cleanText(values[index]);
      if (!label || !value) continue;
      rawVariant[label] = value;
      attributes[label] = value;
      if (!isPackagingOrCompatibilityLabel(label)) variantAttributes[label] = value;
    }

    attributes["Fournarakis family code"] = familyCode;
    if (badges.length) attributes["Fournarakis tags"] = badges.join(", ");

    const fieldEvidence: Record<string, ProductFieldEvidence | readonly ProductFieldEvidence[]> = {
      title: evidence("h1", 0.99),
      sku: evidence("#var_" + sku + " first column", 0.995, "Orderable Fournarakis variant code"),
      "Fournarakis family code": evidence("product URL", 0.995)
    };
    if (brand) fieldEvidence.brand = evidence("img[src*='Brand Logos']", 0.98);
    if (description) fieldEvidence.description = evidence("product summary bullets", 0.95);
    if (categoryPath.length) fieldEvidence.categoryPath = evidence("product breadcrumb", 0.98);
    if (images.length) fieldEvidence.images = evidence("Fournarakis product asset gallery", 0.995);
    for (const label of Object.keys(rawVariant)) fieldEvidence[label] = evidence("#var_" + sku + " variant grid", 0.985);

    candidates.push({
      sourceProductKey: sku,
      sourceUrl: canonical,
      title,
      description,
      brand,
      sku,
      categoryPath: categoryPath.length ? categoryPath : undefined,
      attributes,
      variantAttributes: Object.keys(variantAttributes).length ? variantAttributes : undefined,
      images: images.length ? images : undefined,
      fieldEvidence,
      rawPayload: {
        extractionStrategy: "fournarakis_variant_table",
        supplier: "Fournarakis",
        familyCode,
        familyUrl: canonical,
        variantHeaders: headers,
        variant: rawVariant,
        badges,
        requiresPricingPdfJoin: true,
        webPriceAuthoritative: false,
        icecatEnrichment: "disabled_for_source",
        extractedAt: now
      }
    });
  }
  return candidates;
}

function extractVariantHeaders(html: string): string[] {
  const headerMatch = /\bid\s*=\s*["']var_list["']/i.exec(html);
  if (!headerMatch || headerMatch.index == null) return [];
  const rowMatch = /\bid\s*=\s*["']var_[0-9A-Za-z._/-]+["']/i.exec(html.slice(headerMatch.index + headerMatch[0].length));
  const end = rowMatch?.index == null
    ? Math.min(html.length, headerMatch.index + 15000)
    : headerMatch.index + headerMatch[0].length + rowMatch.index;
  return extractSpanTexts(html.slice(headerMatch.index, end)).slice(0, 40);
}

function extractVariantRows(html: string, columnCount: number): string[][] {
  const matches = [...html.matchAll(/\bid\s*=\s*["']var_([0-9A-Za-z._/-]+)["']/gi)]
    .filter((match) => match[1].toLowerCase() !== "list");
  const rows: string[][] = [];
  for (let index = 0; index < matches.length && rows.length < MAX_VARIANTS; index += 1) {
    const match = matches[index];
    if (match.index == null) continue;
    const nextIndex = matches[index + 1]?.index ?? Math.min(html.length, match.index + 30000);
    const values = extractSpanTexts(html.slice(match.index, nextIndex)).slice(0, Math.max(columnCount, 1));
    if (!values.length) continue;
    if (!values[0] || values[0] !== match[1]) values.unshift(match[1]);
    rows.push(values.slice(0, Math.max(columnCount, values.length)));
  }
  return dedupeRows(rows);
}

function extractSpanTexts(fragment: string): string[] {
  const values: string[] = [];
  for (const match of fragment.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)) {
    const value = cleanText(match[1]);
    if (value) values.push(value);
  }
  return values;
}

function extractBrand(html: string): string | undefined {
  const mainStart = Math.max(0, html.search(/<main\b/i));
  const segment = html.slice(mainStart, Math.min(html.length, mainStart + 60000));
  for (const match of segment.matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = parseAttributes(match[1]);
    const src = decodeHtml(attrs.src ?? "");
    if (!/assets\.fournarakis\.gr\/mycontainer\/Brand(?:%20| )Logos\//i.test(src)) continue;
    const alt = cleanText(attrs.alt);
    if (alt) return alt;
    const file = decodeURIComponent(src.split("/").pop() ?? "").replace(/\.(?:svg|png|webp|jpe?g)$/i, "");
    if (file) return file;
  }
  return undefined;
}

function extractCategoryPath(html: string): string[] {
  const mainStart = Math.max(0, html.search(/<main\b/i));
  const mainContent = html.indexOf("mainContent", mainStart);
  const segment = html.slice(mainStart, mainContent > mainStart ? mainContent : Math.min(html.length, mainStart + 40000));
  const result: string[] = [];
  for (const match of segment.matchAll(/<a\b[^>]*href\s*=\s*["'][^"']*\/el\/catalog\/c\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const value = cleanText(match[1]);
    if (value && !result.includes(value)) result.push(value);
  }
  return result.slice(0, 12);
}

function extractSummaryDescription(html: string): string | undefined {
  const marker = html.search(/min-h-\[60px\]/i);
  if (marker < 0) return undefined;
  const fragment = html.slice(marker, Math.min(html.length, marker + 14000));
  const bullets: string[] = [];
  for (const match of fragment.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const value = cleanText(match[1]);
    if (value && value.length > 2 && !bullets.includes(value)) bullets.push(value);
    if (bullets.length >= 8) break;
  }
  return bullets.length ? bullets.join(". ") : undefined;
}

function extractProductImages(html: string, sourceUrl: string, familyCode: string, title: string): ExtractedImage[] {
  const urls: string[] = [];
  const pattern = /https:\/\/assets\.fournarakis\.gr\/mycontainer\/Photos\/[^"'\s<>()]+/gi;
  for (const match of html.matchAll(pattern)) {
    const decoded = decodeHtml(match[0]);
    const filename = decodeURIComponent(decoded.split("/").pop() ?? "");
    if (!filename.toLowerCase().startsWith(familyCode.toLowerCase())) continue;
    if (!/\.(?:webp|png|jpe?g)(?:\?|$)/i.test(decoded)) continue;
    if (!urls.includes(decoded)) urls.push(decoded);
  }
  urls.sort((left, right) => imageRank(right) - imageRank(left));
  return urls.slice(0, MAX_IMAGES).map((url, index) => ({
    url,
    alt: title,
    evidence: {
      origin: "html",
      sourceUrl,
      confidence: index === 0 ? 0.995 : 0.98,
      selector: "Fournarakis product asset gallery"
    }
  }));
}

function extractBadges(html: string): string[] {
  const mainStart = Math.max(0, html.search(/<main\b/i));
  const summary = html.search(/min-h-\[60px\]/i);
  const segment = html.slice(mainStart, summary > mainStart ? summary : Math.min(html.length, mainStart + 50000));
  const result: string[] = [];
  for (const match of segment.matchAll(/\/Icons\/(best_seller|must_have|new|nice_to_have|must_try)\.svg/gi)) {
    const value = match[1].toLowerCase();
    if (!result.includes(value)) result.push(value);
  }
  return result;
}

function canonicalUrl(html: string, fallback: string): string {
  const match = /<link\b[^>]*rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i.exec(html)
    ?? /<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*>/i.exec(html);
  if (!match?.[1]) return fallback;
  try {
    const url = new URL(decodeHtml(match[1]), fallback);
    url.hash = "";
    return url.toString();
  } catch {
    return fallback;
  }
}

function parseAttributes(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/g;
  for (const match of raw.matchAll(pattern)) result[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  return result;
}

function firstMatch(value: string, pattern: RegExp): string | undefined {
  return pattern.exec(value)?.[1];
}

function cleanText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = decodeHtml(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, digits: string) => String.fromCodePoint(Number.parseInt(digits, 16)));
}

function imageRank(url: string): number {
  const dimension = /\/(\d{3,4})x(\d{3,4})\//.exec(url);
  if (!dimension) return 0;
  return Number(dimension[1]) * Number(dimension[2]);
}

function isPackagingOrCompatibilityLabel(label: string): boolean {
  const normalized = label.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase();
  return /(?:κωδικ|code|sku|tmx|κουτι|box|pack|συνδυαζεται|compatible)/i.test(normalized);
}

function dedupeRows(rows: readonly string[][]): string[][] {
  const seen = new Set<string>();
  const result: string[][] = [];
  for (const row of rows) {
    const key = row.join("\u001f");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

function normalizedHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "");
}
