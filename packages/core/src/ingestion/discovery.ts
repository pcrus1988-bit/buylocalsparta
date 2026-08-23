import type { ExtractedImage, ExtractedPrice, ExtractedProductCandidate, ProductFieldEvidence } from "./types.ts";

export type RobotsRule = Readonly<{ allow: boolean; path: string }>;
export type RobotsPolicy = Readonly<{
  rules: readonly RobotsRule[];
  sitemaps: readonly string[];
}>;

export function parseRobotsTxt(text: string, userAgent: string): RobotsPolicy {
  const requestedAgent = userAgent.trim().toLowerCase();
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  const sitemaps: string[] = [];
  let current: { agents: string[]; rules: RobotsRule[] } | undefined;
  let seenRule = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (!current || seenRule) {
        current = { agents: [], rules: [] };
        groups.push(current);
        seenRule = false;
      }
      if (value) current.agents.push(value.toLowerCase());
      continue;
    }
    if ((key === "allow" || key === "disallow") && current) {
      seenRule = true;
      if (value) current.rules.push({ allow: key === "allow", path: value });
    }
  }

  const exact = groups.filter((group) => group.agents.some((agent) => requestedAgent.includes(agent) || agent === requestedAgent));
  const selected = exact.length ? exact : groups.filter((group) => group.agents.includes("*"));
  return {
    rules: selected.flatMap((group) => group.rules),
    sitemaps: unique(sitemaps)
  };
}

export function robotsAllowsUrl(policy: RobotsPolicy, rawUrl: string): boolean {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return false; }
  const target = `${url.pathname}${url.search}`;
  let winner: RobotsRule | undefined;
  let winnerLength = -1;
  for (const rule of policy.rules) {
    const matchLength = robotsMatchLength(rule.path, target);
    if (matchLength < 0) continue;
    if (matchLength > winnerLength || (matchLength === winnerLength && rule.allow)) {
      winner = rule;
      winnerLength = matchLength;
    }
  }
  return winner?.allow ?? true;
}

export function parseSitemapXml(xml: string, baseUrl: string, limit = 250_000): readonly string[] {
  const urls: string[] = [];
  const locPattern = /<loc(?:\s[^>]*)?>([\s\S]*?)<\/loc\s*>/gi;
  for (const match of xml.matchAll(locPattern)) {
    if (urls.length >= limit) break;
    const raw = decodeXmlEntities(stripTags(match[1])).trim();
    const resolved = resolveHttpUrl(raw, baseUrl);
    if (resolved) urls.push(resolved);
  }
  return unique(urls);
}

export function discoverHtmlUrls(html: string, baseUrl: string, limit = 20_000): readonly string[] {
  const urls: string[] = [];
  const anchorPattern = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    if (urls.length >= limit) break;
    const raw = decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? "").trim();
    const resolved = resolveHttpUrl(raw, baseUrl);
    if (resolved) urls.push(resolved);
  }
  return unique(urls);
}

export function extractJsonLdProductCandidates(html: string, sourceUrl: string): readonly ExtractedProductCandidate[] {
  const candidates: ExtractedProductCandidate[] = [];
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let scriptOrdinal = 0;
  for (const match of html.matchAll(scriptPattern)) {
    const attributes = match[1] ?? "";
    if (!/\btype\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)/i.test(attributes)) continue;
    const rawJson = (match[2] ?? "").trim().replace(/^<!--\s*/, "").replace(/\s*-->$/, "");
    if (!rawJson) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(rawJson); } catch { continue; }
    const nodes = flattenJsonLd(parsed);
    let nodeOrdinal = 0;
    for (const node of nodes) {
      if (!isProductNode(node)) continue;
      const candidate = productCandidateFromJsonLd(node, sourceUrl, scriptOrdinal, nodeOrdinal);
      nodeOrdinal += 1;
      if (candidate) candidates.push(candidate);
    }
    scriptOrdinal += 1;
  }
  return candidates;
}

function productCandidateFromJsonLd(
  node: Record<string, unknown>,
  sourceUrl: string,
  scriptOrdinal: number,
  nodeOrdinal: number
): ExtractedProductCandidate | undefined {
  const title = stringValue(node.name)?.trim();
  if (!title) return undefined;
  const sku = stringValue(node.sku)?.trim();
  const mpn = stringValue(node.mpn)?.trim();
  const gtin = firstString(node.gtin14, node.gtin13, node.gtin12, node.gtin8, node.gtin)?.trim();
  const model = modelValue(node.model);
  const brand = brandValue(node.brand);
  const description = stringValue(node.description)?.trim();
  const canonicalUrl = resolveHttpUrl(stringValue(node.url) ?? "", sourceUrl) ?? sourceUrl;
  const sourceProductKey = sku || gtin || mpn || model || canonicalUrl || `${sourceUrl}#jsonld-${scriptOrdinal}-${nodeOrdinal}`;
  const evidence = (sourcePath: string, confidence = 0.99): ProductFieldEvidence => ({
    origin: "json_ld",
    sourceUrl,
    confidence,
    sourcePath
  });
  const fieldEvidence: Record<string, ProductFieldEvidence> = {
    title: evidence("name")
  };
  if (sku) fieldEvidence.sku = evidence("sku");
  if (mpn) fieldEvidence.mpn = evidence("mpn");
  if (gtin) fieldEvidence.gtin = evidence("gtin");
  if (model) fieldEvidence.model = evidence("model");
  if (brand) fieldEvidence.brand = evidence("brand.name");
  if (description) fieldEvidence.description = evidence("description");

  const attributes: Record<string, string> = {};
  const variantAttributes: Record<string, string> = {};
  for (const [sourceKey, targetKey] of [["color", "color"], ["size", "size"], ["material", "material"], ["pattern", "pattern"]] as const) {
    const value = stringValue(node[sourceKey])?.trim();
    if (!value) continue;
    attributes[targetKey] = value;
    if (sourceKey === "color" || sourceKey === "size") variantAttributes[targetKey] = value;
    fieldEvidence[targetKey] = evidence(sourceKey);
  }

  const prices = pricesFromOffers(node.offers, sourceUrl);
  const images = imagesFromJsonLd(node.image, sourceUrl);
  const category = stringValue(node.category)?.trim();
  if (category) fieldEvidence.categoryPath = evidence("category");
  if (prices.length) fieldEvidence.prices = evidence("offers", 0.98);
  if (images.length) fieldEvidence.images = evidence("image", 0.98);

  return {
    sourceProductKey,
    sourceUrl: canonicalUrl,
    title,
    description,
    brand,
    model,
    mpn,
    gtin,
    sku,
    categoryPath: category ? category.split(/\s*(?:>|\/|→)\s*/).filter(Boolean) : undefined,
    attributes,
    variantAttributes: Object.keys(variantAttributes).length ? variantAttributes : undefined,
    prices: prices.length ? prices : undefined,
    images: images.length ? images : undefined,
    fieldEvidence,
    rawPayload: node
  };
}

function pricesFromOffers(value: unknown, sourceUrl: string): ExtractedPrice[] {
  const offers = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  const result: ExtractedPrice[] = [];
  for (let index = 0; index < offers.length; index += 1) {
    const offer = offers[index];
    if (!offer || typeof offer !== "object" || Array.isArray(offer)) continue;
    const record = offer as Record<string, unknown>;
    const rawPrice = firstString(record.price, record.lowPrice, record.highPrice);
    const currency = stringValue(record.priceCurrency)?.trim().toUpperCase();
    const amountMinor = decimalToMinor(rawPrice);
    if (amountMinor === undefined || !currency || !/^[A-Z]{3}$/.test(currency)) continue;
    result.push({
      amountMinor,
      currency,
      kind: "selling",
      evidence: { origin: "json_ld", sourceUrl, confidence: 0.98, sourcePath: `offers[${index}].price` }
    });
  }
  return result;
}

function imagesFromJsonLd(value: unknown, sourceUrl: string): ExtractedImage[] {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  const result: ExtractedImage[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    const raw = typeof item === "string"
      ? item
      : item && typeof item === "object" && !Array.isArray(item)
        ? firstString((item as Record<string, unknown>).url, (item as Record<string, unknown>).contentUrl)
        : undefined;
    const url = raw ? resolveHttpUrl(raw, sourceUrl) : undefined;
    if (!url) continue;
    result.push({
      url,
      evidence: { origin: "json_ld", sourceUrl, confidence: 0.98, sourcePath: `image[${index}]` }
    });
  }
  return dedupeBy(result, (item) => item.url);
}

function flattenJsonLd(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 8 || value == null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => flattenJsonLd(item, depth + 1));
  if (typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const nested = record["@graph"] === undefined ? [] : flattenJsonLd(record["@graph"], depth + 1);
  return [record, ...nested];
}

function isProductNode(node: Record<string, unknown>): boolean {
  const value = node["@type"];
  const types = Array.isArray(value) ? value : [value];
  return types.some((item) => typeof item === "string" && item.toLowerCase() === "product");
}

function brandValue(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (value && typeof value === "object" && !Array.isArray(value)) return stringValue((value as Record<string, unknown>).name)?.trim() || undefined;
  return undefined;
}

function modelValue(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") return String(value).trim() || undefined;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return firstString(record.name, record.model, record.value)?.trim() || undefined;
  }
  return undefined;
}

function decimalToMinor(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,4})?$/.test(normalized)) return undefined;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  const minor = Math.round(amount * 100);
  return Number.isSafeInteger(minor) ? minor : undefined;
}

function robotsMatchLength(rule: string, target: string): number {
  if (!rule) return -1;
  const anchored = rule.endsWith("$");
  const source = anchored ? rule.slice(0, -1) : rule;
  const escaped = source.split("*").map(escapeRegex).join(".*");
  const expression = new RegExp(`^${escaped}${anchored ? "$" : ""}`);
  const match = expression.exec(target);
  return match ? match[0].length : -1;
}

function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function stripTags(value: string): string { return value.replace(/<[^>]*>/g, ""); }
function stringValue(value: unknown): string | undefined { return typeof value === "string" || typeof value === "number" ? String(value) : undefined; }
function firstString(...values: unknown[]): string | undefined { for (const value of values) { const result = stringValue(value); if (result?.trim()) return result; } return undefined; }
function unique(values: readonly string[]): string[] { return [...new Set(values)]; }
function dedupeBy<T>(values: readonly T[], key: (value: T) => string): T[] { const seen = new Set<string>(); return values.filter((value) => { const identity = key(value); if (seen.has(identity)) return false; seen.add(identity); return true; }); }
function resolveHttpUrl(raw: string, baseUrl: string): string | undefined {
  if (!raw || raw.startsWith("#") || /^(?:mailto|tel|javascript|data):/i.test(raw)) return undefined;
  try {
    const url = new URL(raw, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.hash = "";
    return url.toString();
  } catch { return undefined; }
}
function decodeXmlEntities(value: string): string { return decodeEntities(value); }
function decodeHtmlEntities(value: string): string { return decodeEntities(value); }
function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, digits: string) => String.fromCodePoint(Number.parseInt(digits, 16)));
}
