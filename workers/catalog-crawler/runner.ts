import {
  analyzeHtmlProductPage,
  discoverHtmlUrls,
  extractJsonLdProductCandidates,
  parseRobotsTxt,
  parseSitemapXml,
  robotsAllowsUrl,
  validateCrawlUrl,
  type CrawlFetchPolicy,
  type ExtractedProductCandidate,
  type ExtractedPrice,
  type ExtractedImage,
  type ProductFieldEvidence,
  type RobotsPolicy
} from "../../packages/core/src/index.ts";
import type { ClaimedCrawlJob } from "./store.ts";
import { CatalogCrawlerStore } from "./store.ts";
import { secureCrawlFetch, type SecureCrawlFetchInput, type SecureCrawlFetchResult } from "./transport.ts";

export type CrawlPolicySnapshot = Readonly<{
  rootUrl: string;
  allowedHosts: readonly string[];
  allowSubdomains: boolean;
  allowHttp: boolean;
  obeyRobots: boolean;
  fetchMode: "auto" | "http" | "browser";
  maxPages: number;
  maxDepth: number;
  maxConcurrency: number;
  requestsPerSecond: number;
  maxResponseBytes: number;
  maxRedirects: number;
  includeRules: readonly unknown[];
  excludeRules: readonly unknown[];
}>;

export type CrawlRunnerOptions = Readonly<{
  store: CatalogCrawlerStore;
  job: ClaimedCrawlJob;
  workerId: string;
  leaseSeconds: number;
  userAgent: string;
  requestTimeoutMs: number;
  maxSitemaps?: number;
  fetcher?: (input: SecureCrawlFetchInput) => Promise<SecureCrawlFetchResult>;
}>;

export class CrawlJobError extends Error {
  readonly terminal: boolean;
  constructor(message: string, terminal = false) { super(message); this.name = "CrawlJobError"; this.terminal = terminal; }
}

type DiscoveredUrl = { url: string; depth: number; fromPageId?: string };

export async function runCrawlJob(options: CrawlRunnerOptions): Promise<Readonly<{ pages: number; extractions: number }>> {
  const policy = parseCrawlPolicySnapshot(options.job.policySnapshot);
  const fetchPolicy: CrawlFetchPolicy = {
    allowedHosts: expandWwwHosts(policy.allowedHosts),
    allowSubdomains: policy.allowSubdomains,
    allowHttp: policy.allowHttp,
    maxRedirects: policy.maxRedirects,
    maxResponseBytes: policy.maxResponseBytes
  };
  const startUrl = options.job.seedUrl ?? policy.rootUrl;
  const startValidation = validateCrawlUrl(startUrl, fetchPolicy);
  if (startValidation.decision !== "allow" || !startValidation.normalizedUrl) throw new CrawlJobError(`Seed URL rejected: ${startValidation.reason ?? "invalid seed URL"}`, true);
  const normalizedSeed = startValidation.normalizedUrl;
  const fetcher = options.fetcher ?? secureCrawlFetch;
  const intervalMs = Math.ceil(1000 / policy.requestsPerSecond);
  let lastRequestAt = 0;
  const fetchRateLimited = async (url: string, accept?: string) => {
    const remaining = lastRequestAt + intervalMs - Date.now();
    if (remaining > 0) await delay(remaining);
    const result = await fetcher({ url, policy: fetchPolicy, userAgent: options.userAgent, timeoutMs: options.requestTimeoutMs, accept });
    lastRequestAt = Date.now();
    return result;
  };

  const robots = policy.obeyRobots
    ? await loadRobots(normalizedSeed, fetchRateLimited, options.userAgent)
    : { rules: [], sitemaps: [] } satisfies RobotsPolicy;
  if (policy.obeyRobots && !robotsAllowsUrl(robots, normalizedSeed)) {
    const page = await options.store.ensurePage({ jobId: options.job.jobId, url: normalizedSeed, normalizedUrl: normalizedSeed, depth: 0 });
    await options.store.markSkipped(page.id, "robots_disallow", false);
    await options.store.finish(options.job.jobId, options.workerId);
    return { pages: 1, extractions: 0 };
  }

  const remembered = await options.store.listPendingPages(options.job.jobId, policy.maxPages);
  const discovered: DiscoveredUrl[] = [{ url: normalizedSeed, depth: 0 }];
  const queued = new Set<string>([normalizedSeed]);
  for (const page of remembered) {
    if (queued.has(page.normalizedUrl)) continue;
    queued.add(page.normalizedUrl);
    discovered.push({ url: page.normalizedUrl, depth: page.depth, fromPageId: page.discoveredFromPageId });
  }

  if (options.job.crawlMode !== "single") {
    const sitemapUrls = await discoverFromSitemaps({
      startUrl: normalizedSeed,
      robots,
      policy,
      fetchPolicy,
      fetchRateLimited,
      maxSitemaps: options.maxSitemaps ?? 32
    });
    const before = discovered.length;
    for (const url of sitemapUrls) enqueueUrl(url, 0, undefined, discovered, queued, policy, fetchPolicy, normalizedSeed);
    await rememberDiscovered(options.store, options.job.jobId, discovered.slice(before));
    await options.store.syncCounters(options.job.jobId);
  }

  const maxDepth = options.job.crawlMode === "discovery" ? Math.min(policy.maxDepth, 1) : policy.maxDepth;
  let processed = 0;
  let extractions = 0;
  for (let cursor = 0; cursor < discovered.length && processed < policy.maxPages; cursor += 1) {
    const item = discovered[cursor];
    if (item.depth > maxDepth) continue;
    if (policy.obeyRobots && !robotsAllowsUrl(robots, item.url)) {
      const page = await options.store.ensurePage({ jobId: options.job.jobId, url: item.url, normalizedUrl: item.url, depth: item.depth, discoveredFromPageId: item.fromPageId });
      await options.store.markSkipped(page.id, "robots_disallow", false);
      processed += 1;
      if (processed % 10 === 0) await options.store.syncCounters(options.job.jobId);
      continue;
    }
    const page = await options.store.ensurePage({ jobId: options.job.jobId, url: item.url, normalizedUrl: item.url, depth: item.depth, discoveredFromPageId: item.fromPageId });
    if (page.status === "fetched" || page.status === "skipped") continue;
    await options.store.markFetching(page.id, policy.obeyRobots ? true : null);

    let response: SecureCrawlFetchResult;
    try {
      response = await fetchRateLimited(item.url);
    } catch (error) {
      const message = errorMessage(error);
      await options.store.markFailed(page.id, "fetch_error", message);
      if (item.url === normalizedSeed) throw new CrawlJobError(`Seed fetch failed: ${message}`);
      processed += 1;
      if (processed % 10 === 0) await options.store.syncCounters(options.job.jobId);
      await options.store.renew(options.job.jobId, options.workerId, options.leaseSeconds);
      continue;
    }

    if ((response.status === 429 || response.status >= 500) && item.url === normalizedSeed) {
      await options.store.markFailed(page.id, `http_${response.status}`, `Seed returned retryable HTTP ${response.status}`);
      throw new CrawlJobError(`Seed returned retryable HTTP ${response.status}`);
    }

    const html = isHtml(response) ? response.body.toString("utf8") : undefined;
    const structured = html ? extractJsonLdProductCandidates(html, response.finalUrl) : [];
    const analysis = html ? analyzeHtmlProductPage(html, response.finalUrl) : undefined;
    const explicitPrices = html ? extractExplicitCommercialPrices(html, response.finalUrl) : [];
    const rawCandidates = [...structured, ...(analysis?.candidates ?? [])].map((candidate) => sanitizeCandidate(candidate, explicitPrices));
    const candidates = dedupeCandidates(rawCandidates);
    let reviewCount = 0;
    for (let ordinal = 0; ordinal < candidates.length; ordinal += 1) {
      const status = await options.store.saveExtraction({ pageId: page.id, extractorVersion: options.job.extractorVersion, ordinal, candidate: candidates[ordinal] });
      if (status === "review_required") reviewCount += 1;
      extractions += 1;
    }
    const likelyNeedsReview = Boolean(!candidates.length && analysis && (analysis.requiresRendering || analysis.productLikelihood >= 0.65));
    await options.store.markFetched({
      pageId: page.id,
      result: response,
      productLikelihood: candidates.length ? 1 : analysis?.productLikelihood ?? productLikelihood(response.finalUrl),
      extractionStatus: candidates.length ? (reviewCount ? "review_required" : "extracted") : likelyNeedsReview ? "review_required" : "not_applicable"
    });
    processed += 1;

    if (html && options.job.crawlMode !== "single" && item.depth < maxDepth) {
      const links = [...discoverHtmlUrls(html, response.finalUrl, Math.min(policy.maxPages * 4, 50_000))];
      links.sort((left, right) => productLikelihood(right) - productLikelihood(left));
      const before = discovered.length;
      for (const url of links) {
        if (discovered.length >= policy.maxPages * 4) break;
        enqueueUrl(url, item.depth + 1, page.id, discovered, queued, policy, fetchPolicy, normalizedSeed);
      }
      await rememberDiscovered(options.store, options.job.jobId, discovered.slice(before));
    }
    if (processed % 10 === 0) await options.store.syncCounters(options.job.jobId);
    await options.store.renew(options.job.jobId, options.workerId, options.leaseSeconds);
  }

  await options.store.syncCounters(options.job.jobId);
  await options.store.finish(options.job.jobId, options.workerId);
  return { pages: processed, extractions };
}

async function rememberDiscovered(store: CatalogCrawlerStore, jobId: string, pages: readonly DiscoveredUrl[]): Promise<void> {
  if (!pages.length) return;
  await store.rememberPages(jobId, pages.map((page) => ({
    url: page.url,
    normalizedUrl: page.url,
    depth: page.depth,
    discoveredFromPageId: page.fromPageId
  })));
}

export function parseCrawlPolicySnapshot(value: unknown): CrawlPolicySnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CrawlJobError("Crawl job policy snapshot is invalid", true);
  const record = value as Record<string, unknown>;
  const rootUrl = requiredString(record.rootUrl, "rootUrl");
  const allowedHosts = stringArray(record.allowedHosts, "allowedHosts");
  if (!allowedHosts.length) throw new CrawlJobError("Crawl policy allowedHosts cannot be empty", true);
  const fetchModeRaw = optionalString(record.fetchMode) ?? "auto";
  if (!(["auto", "http", "browser"] as const).includes(fetchModeRaw as "auto" | "http" | "browser")) throw new CrawlJobError(`Unsupported fetchMode ${fetchModeRaw}`, true);
  return {
    rootUrl,
    allowedHosts,
    allowSubdomains: booleanValue(record.allowSubdomains, false),
    allowHttp: booleanValue(record.allowHttp, false),
    obeyRobots: booleanValue(record.obeyRobots, true),
    fetchMode: fetchModeRaw as CrawlPolicySnapshot["fetchMode"],
    maxPages: boundedInteger(record.maxPages, 10_000, 1, 250_000, "maxPages"),
    maxDepth: boundedInteger(record.maxDepth, 12, 0, 64, "maxDepth"),
    maxConcurrency: boundedInteger(record.maxConcurrency, 4, 1, 32, "maxConcurrency"),
    requestsPerSecond: boundedNumber(record.requestsPerSecond, 1, 0.01, 20, "requestsPerSecond"),
    maxResponseBytes: boundedInteger(record.maxResponseBytes, 10 * 1024 * 1024, 1, 50 * 1024 * 1024, "maxResponseBytes"),
    maxRedirects: boundedInteger(record.maxRedirects, 5, 0, 10, "maxRedirects"),
    includeRules: Array.isArray(record.includeRules) ? record.includeRules : [],
    excludeRules: Array.isArray(record.excludeRules) ? record.excludeRules : []
  };
}

async function loadRobots(
  startUrl: string,
  fetcher: (url: string, accept?: string) => Promise<SecureCrawlFetchResult>,
  userAgent: string
): Promise<RobotsPolicy> {
  const robotsUrl = new URL("/robots.txt", startUrl).toString();
  let result: SecureCrawlFetchResult;
  try { result = await fetcher(robotsUrl, "text/plain,*/*;q=0.1"); }
  catch (error) { throw new CrawlJobError(`robots.txt fetch failed: ${errorMessage(error)}`); }
  if (result.status >= 400 && result.status < 500 && result.status !== 429) return { rules: [], sitemaps: [] };
  if (result.status === 429 || result.status >= 500) throw new CrawlJobError(`robots.txt temporarily unavailable (HTTP ${result.status})`);
  if (result.status < 200 || result.status >= 300) return { rules: [], sitemaps: [] };
  return parseRobotsTxt(result.body.toString("utf8"), userAgent);
}

async function discoverFromSitemaps(input: {
  startUrl: string;
  robots: RobotsPolicy;
  policy: CrawlPolicySnapshot;
  fetchPolicy: CrawlFetchPolicy;
  fetchRateLimited: (url: string, accept?: string) => Promise<SecureCrawlFetchResult>;
  maxSitemaps: number;
}): Promise<readonly string[]> {
  const pending = [...new Set([...input.robots.sitemaps, new URL("/sitemap.xml", input.startUrl).toString()])];
  pending.sort((left, right) => sitemapPriority(right) - sitemapPriority(left));
  const seen = new Set<string>();
  const pages: string[] = [];
  while (pending.length && seen.size < input.maxSitemaps && pages.length < input.policy.maxPages) {
    const raw = pending.shift()!;
    const validation = validateCrawlUrl(raw, input.fetchPolicy);
    if (validation.decision !== "allow" || !validation.normalizedUrl || seen.has(validation.normalizedUrl)) continue;
    seen.add(validation.normalizedUrl);
    let response: SecureCrawlFetchResult;
    try { response = await input.fetchRateLimited(validation.normalizedUrl, "application/xml,text/xml,text/plain;q=0.8,*/*;q=0.1"); }
    catch { continue; }
    if (response.status < 200 || response.status >= 300) continue;
    const xml = response.body.toString("utf8");
    const locations = parseSitemapXml(xml, response.finalUrl, input.policy.maxPages - pages.length);
    if (/<sitemapindex\b/i.test(xml)) {
      const ordered = [...locations].sort((left, right) => sitemapPriority(right) - sitemapPriority(left));
      for (const location of ordered) if (pending.length + seen.size < input.maxSitemaps * 2) pending.push(location);
      pending.sort((left, right) => sitemapPriority(right) - sitemapPriority(left));
    } else {
      pages.push(...locations);
    }
  }
  return [...new Set(pages)]
    .sort((left, right) => productLikelihood(right) - productLikelihood(left))
    .slice(0, input.policy.maxPages);
}

function enqueueUrl(
  rawUrl: string,
  depth: number,
  fromPageId: string | undefined,
  queue: DiscoveredUrl[],
  queued: Set<string>,
  policy: CrawlPolicySnapshot,
  fetchPolicy: CrawlFetchPolicy,
  seedUrl: string
): void {
  const validation = validateCrawlUrl(rawUrl, fetchPolicy);
  if (validation.decision !== "allow" || !validation.normalizedUrl) return;
  const url = validation.normalizedUrl;
  if (queued.has(url) || !isLikelyPageUrl(url) || !matchesConfiguredScope(url, policy)) return;
  if (policy.maxPages <= queue.length) return;
  if (depth > policy.maxDepth) return;
  if (url !== seedUrl && policy.maxPages > 1 && !sameAllowedOriginClass(url, seedUrl, policy)) return;
  queued.add(url);
  queue.push({ url, depth, fromPageId });
}

function matchesConfiguredScope(url: string, policy: CrawlPolicySnapshot): boolean {
  const includes = policy.includeRules.map(rulePattern).filter((value): value is string => Boolean(value));
  const excludes = policy.excludeRules.map(rulePattern).filter((value): value is string => Boolean(value));
  if (excludes.some((pattern) => globMatches(pattern, url))) return false;
  return !includes.length || includes.some((pattern) => globMatches(pattern, url));
}
function rulePattern(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (value && typeof value === "object" && !Array.isArray(value)) return optionalString((value as Record<string, unknown>).pattern);
  return undefined;
}
function globMatches(pattern: string, value: string): boolean {
  const source = pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  try { return new RegExp(`^${source}$`, "i").test(value); } catch { return false; }
}
function sameAllowedOriginClass(url: string, seedUrl: string, policy: CrawlPolicySnapshot): boolean {
  const candidate = new URL(url);
  const seed = new URL(seedUrl);
  if (sameWwwSite(candidate.hostname, seed.hostname)) return true;
  return policy.allowSubdomains && policy.allowedHosts.some((host) => candidate.hostname === host || candidate.hostname.endsWith(`.${host}`));
}
function expandWwwHosts(hosts: readonly string[]): readonly string[] {
  const expanded = new Set<string>();
  for (const rawHost of hosts) {
    const host = rawHost.trim().toLowerCase();
    if (!host) continue;
    expanded.add(host);
    expanded.add(host.startsWith("www.") ? host.slice(4) : `www.${host}`);
  }
  return [...expanded];
}
function sameWwwSite(left: string, right: string): boolean {
  return normalizedWwwHost(left) === normalizedWwwHost(right);
}
function normalizedWwwHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "");
}
function isLikelyPageUrl(rawUrl: string): boolean {
  const pathname = new URL(rawUrl).pathname.toLowerCase();
  return !/\.(?:avif|bmp|css|csv|docx?|eot|gif|ico|jpe?g|js|json|mp3|mp4|pdf|png|pptx?|rar|svg|tiff?|ttf|webm|webp|woff2?|xlsx?|xml|zip)$/i.test(pathname);
}
function isHtml(result: SecureCrawlFetchResult): boolean {
  const contentType = result.headers["content-type"]?.toLowerCase() ?? "";
  if (contentType.includes("text/html") || contentType.includes("application/xhtml+xml")) return true;
  const prefix = result.body.subarray(0, 512).toString("utf8").toLowerCase();
  return prefix.includes("<!doctype html") || prefix.includes("<html");
}
function productLikelihood(rawUrl: string): number {
  const path = new URL(rawUrl).pathname.toLowerCase();
  if (/\/(?:product|products|p|item|sku)\//.test(path) || /(?:product-|\/p-)/.test(path)) return 0.9;
  if (/\/(?:product-category|collections?|category|search)(?:\/|$)/.test(path)) return 0.05;
  const segments = path.split("/").filter(Boolean);
  const tail = segments.at(-1) ?? "";
  if (segments.length >= 3 && /(?:^|[-_])\d{3,12}(?:[-_]|$)/.test(tail)) return 0.72;
  if (segments.length >= 4 && /(?:bag|backpack|shoe|shirt|dress|tool|phone|laptop|watch|camera)s?/.test(path)) return 0.5;
  return 0.1;
}
function sitemapPriority(rawUrl: string): number {
  const value = rawUrl.toLowerCase();
  if (/product(?:s)?[-_]?sitemap|sitemap[-_]?product/.test(value)) return 10;
  if (/shop|catalog|catalogue|item/.test(value)) return 6;
  if (/category|taxonomy|post|page|author|tag|news|blog/.test(value)) return 1;
  return 3;
}
function sanitizeCandidate(candidate: ExtractedProductCandidate, explicitPrices: readonly ExtractedPrice[]): ExtractedProductCandidate {
  const sku = plausibleCode(candidate.sku) ? candidate.sku : undefined;
  const mpn = plausibleCode(candidate.mpn) ? candidate.mpn : undefined;
  const model = plausibleModel(candidate.model) ? candidate.model : undefined;
  const brand = plausibleBrand(candidate.brand) ? candidate.brand : undefined;
  const rejectedIdentity = [candidate.sku !== sku ? candidate.sku : undefined, candidate.mpn !== mpn ? candidate.mpn : undefined, candidate.model !== model ? candidate.model : undefined]
    .filter((value): value is string => Boolean(value));
  const sourceKeyRejected = rejectedIdentity.some((value) => normalizeIdentity(value) === normalizeIdentity(candidate.sourceProductKey)) || looksLikeProseIdentity(candidate.sourceProductKey);
  const sourceProductKey = sourceKeyRejected ? (sku ?? candidate.gtin ?? mpn ?? model ?? candidate.sourceUrl) : candidate.sourceProductKey;
  const fieldEvidence: Record<string, ProductFieldEvidence | readonly ProductFieldEvidence[]> = { ...candidate.fieldEvidence };
  if (!sku) delete fieldEvidence.sku;
  if (!mpn) delete fieldEvidence.mpn;
  if (!model) delete fieldEvidence.model;
  if (!brand) delete fieldEvidence.brand;
  const prices = mergePrices([...(candidate.prices ?? []), ...explicitPrices]);
  if (explicitPrices.length) fieldEvidence.prices = explicitPrices.map((price) => price.evidence);
  return { ...candidate, sourceProductKey, sku, mpn, model, brand, prices: prices.length ? prices : undefined, fieldEvidence };
}
function plausibleCode(value: string | undefined): value is string {
  if (!value) return false;
  const text = value.trim();
  if (!text || text.length > 100 || /[.!?]\s*$/.test(text) || text.split(/\s+/).length > 5) return false;
  if (/\b(?:is|are|was|were|recommended|available|click|read|choose|select)\b/i.test(text)) return false;
  return /\d|[-_\/]/.test(text) || /^[A-Z0-9.]+$/.test(text);
}
function plausibleModel(value: string | undefined): value is string {
  if (!value) return false;
  const text = value.trim();
  return Boolean(text && text.length <= 100 && text.split(/\s+/).length <= 8 && !/[!?]\s*$/.test(text) && !/\b(?:is|are|was|were|recommended|available|click|read|choose|select|should|may|will)\b/i.test(text));
}
function plausibleBrand(value: string | undefined): value is string {
  if (!value) return false;
  const text = value.trim();
  return Boolean(text && text.length <= 100 && text.split(/\s+/).length <= 8 && !/^[.,:;!?]/.test(text) && !/\b(?:click here|read (?:the|more)|announcement|privacy|cookie|terms|learn more|view all)\b/i.test(text));
}
function looksLikeProseIdentity(value: string): boolean {
  const text = value.trim();
  return text.length > 120 || text.split(/\s+/).length > 8 || /\b(?:is|are|was|were|recommended|available|click|read|choose|should|may|will)\b/i.test(text) || /[!?]\s*$/.test(text);
}
function extractExplicitCommercialPrices(html: string, sourceUrl: string): ExtractedPrice[] {
  const text = decodeBasicEntities(html.replace(/<(?:script|style|template|svg)\b[\s\S]*?<\/(?:script|style|template|svg)>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  const result: ExtractedPrice[] = [];
  const patterns: Array<{ kind: ExtractedPrice["kind"]; pattern: RegExp; label: string }> = [
    { kind: "rrp", label: "rrp/msrp", pattern: /(?:R\s*\.?\s*R\s*\.?\s*P\s*\.?|MSRP|Recommended\s+Retail\s+Price|Προτεινόμενη(?:\s+Λιανική)?\s+Τιμή)\s*[:\-]?\s*(€|EUR|\$|USD|£|GBP)?\s*([0-9]{1,7}(?:[.,][0-9]{1,2})?)/gi },
    { kind: "promotion", label: "sale/offer", pattern: /(?:Sale\s+Price|Offer\s+Price|Τιμή\s+Προσφοράς|Προσφορά)\s*[:\-]?\s*(€|EUR|\$|USD|£|GBP)?\s*([0-9]{1,7}(?:[.,][0-9]{1,2})?)/gi }
  ];
  for (const definition of patterns) {
    for (const match of text.matchAll(definition.pattern)) {
      const amountMinor = decimalPriceToMinor(match[2]);
      const currency = normalizeCurrency(match[1]);
      if (amountMinor === undefined || !currency) continue;
      result.push({ amountMinor, currency, kind: definition.kind, evidence: { origin: "html", sourceUrl, confidence: 0.94, selector: `explicit:${definition.label}` } });
    }
  }
  return mergePrices(result);
}
function decimalPriceToMinor(raw: string | undefined): number | undefined {
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
function decodeBasicEntities(value: string): string {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&euro;/gi, "€").replace(/&#8364;/g, "€").replace(/&#x20ac;/gi, "€");
}
function dedupeCandidates(values: readonly ExtractedProductCandidate[]): ExtractedProductCandidate[] {
  const merged: ExtractedProductCandidate[] = [];
  for (const candidate of values) {
    const index = merged.findIndex((current) => sameProductCandidate(current, candidate));
    if (index < 0) merged.push(candidate);
    else merged[index] = mergeProductCandidates(merged[index], candidate);
  }
  return merged;
}
function sameProductCandidate(left: ExtractedProductCandidate, right: ExtractedProductCandidate): boolean {
  if (left.gtin && right.gtin && left.gtin === right.gtin) return true;
  if (left.sku && right.sku && normalizeIdentity(left.sku) === normalizeIdentity(right.sku)) return true;
  if (left.mpn && right.mpn && normalizeIdentity(left.mpn) === normalizeIdentity(right.mpn)) return true;
  const leftUrl = normalizeComparableUrl(left.sourceUrl);
  const rightUrl = normalizeComparableUrl(right.sourceUrl);
  return leftUrl === rightUrl && titlesOverlap(left.title, right.title);
}
function mergeProductCandidates(left: ExtractedProductCandidate, right: ExtractedProductCandidate): ExtractedProductCandidate {
  const title = chooseTitle(left.title, right.title, fieldConfidence(left.fieldEvidence.title), fieldConfidence(right.fieldEvidence.title));
  const description = chooseDescription(left.description, right.description);
  const sku = left.sku ?? right.sku;
  const gtin = left.gtin ?? right.gtin;
  const mpn = left.mpn ?? right.mpn;
  const model = left.model ?? right.model;
  const brand = left.brand ?? right.brand;
  const sourceProductKey = sku ?? gtin ?? mpn ?? model ?? preferSourceKey(left.sourceProductKey, right.sourceProductKey, left.sourceUrl);
  const categoryPath = (right.categoryPath?.length ?? 0) > (left.categoryPath?.length ?? 0) ? right.categoryPath : left.categoryPath;
  const fieldEvidence = { ...left.fieldEvidence, ...right.fieldEvidence };
  if (title === left.title && left.fieldEvidence.title) fieldEvidence.title = left.fieldEvidence.title;
  if (description === left.description && left.fieldEvidence.description) fieldEvidence.description = left.fieldEvidence.description;
  if (sku === left.sku && left.fieldEvidence.sku) fieldEvidence.sku = left.fieldEvidence.sku;
  if (gtin === left.gtin && left.fieldEvidence.gtin) fieldEvidence.gtin = left.fieldEvidence.gtin;
  if (mpn === left.mpn && left.fieldEvidence.mpn) fieldEvidence.mpn = left.fieldEvidence.mpn;
  if (model === left.model && left.fieldEvidence.model) fieldEvidence.model = left.fieldEvidence.model;
  if (brand === left.brand && left.fieldEvidence.brand) fieldEvidence.brand = left.fieldEvidence.brand;
  return {
    sourceProductKey,
    sourceUrl: preferCanonicalUrl(left.sourceUrl, right.sourceUrl),
    title,
    description,
    brand,
    model,
    mpn,
    gtin,
    sku,
    categoryPath,
    attributes: { ...left.attributes, ...right.attributes },
    variantAttributes: Object.keys({ ...(left.variantAttributes ?? {}), ...(right.variantAttributes ?? {}) }).length
      ? { ...(left.variantAttributes ?? {}), ...(right.variantAttributes ?? {}) }
      : undefined,
    prices: mergePrices([...(left.prices ?? []), ...(right.prices ?? [])]),
    images: mergeImages([...(left.images ?? []), ...(right.images ?? [])]),
    fieldEvidence,
    rawPayload: { extractionStrategy: "merged_multi_signal", sources: [left.rawPayload ?? null, right.rawPayload ?? null] }
  };
}
function chooseTitle(left: string, right: string, leftConfidence: number, rightConfidence: number): string {
  const a = normalizedTitle(left);
  const b = normalizedTitle(right);
  if (a && b && (a.includes(b) || b.includes(a))) return left.length <= right.length ? left : right;
  return rightConfidence > leftConfidence ? right : left;
}
function chooseDescription(left: string | undefined, right: string | undefined): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return right.length > left.length * 1.15 ? right : left;
}
function fieldConfidence(value: ProductFieldEvidence | readonly ProductFieldEvidence[] | undefined): number {
  if (!value) return 0;
  const entries = Array.isArray(value) ? value : [value];
  return Math.max(...entries.map((entry) => entry.confidence));
}
function preferSourceKey(left: string, right: string, pageUrl: string): string {
  const leftIsUrl = /^https?:\/\//i.test(left);
  const rightIsUrl = /^https?:\/\//i.test(right);
  if (leftIsUrl !== rightIsUrl) return leftIsUrl ? right : left;
  if (left === pageUrl && right !== pageUrl) return right;
  return left;
}
function preferCanonicalUrl(left: string, right: string): string {
  if (left === right) return left;
  try {
    const a = new URL(left);
    const b = new URL(right);
    if (a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "") && a.pathname === b.pathname) return left.length <= right.length ? left : right;
  } catch {}
  return left;
}
function mergePrices(values: readonly ExtractedPrice[]): ExtractedPrice[] {
  const seen = new Set<string>();
  const result: ExtractedPrice[] = [];
  for (const value of values) {
    const key = `${value.kind}:${value.currency}:${value.amountMinor}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}
function mergeImages(values: readonly ExtractedImage[]): ExtractedImage[] {
  const seen = new Set<string>();
  const result: ExtractedImage[] = [];
  for (const value of values) {
    if (seen.has(value.url)) continue;
    seen.add(value.url);
    result.push(value);
  }
  return result;
}
function titlesOverlap(left: string, right: string): boolean {
  const a = normalizedTitle(left);
  const b = normalizedTitle(right);
  return Boolean(a && b && (a.includes(b) || b.includes(a) || tokenSimilarity(a, b) >= 0.72));
}
function normalizedTitle(value: string): string {
  return value.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function tokenSimilarity(left: string, right: string): number {
  const a = new Set(left.split(/\s+/).filter((token) => token.length > 1));
  const b = new Set(right.split(/\s+/).filter((token) => token.length > 1));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / Math.min(a.size, b.size);
}
function normalizeIdentity(value: string): string { return value.trim().toUpperCase().replace(/\s+/g, ""); }
function normalizeComparableUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch { return value; }
}
function requiredString(value: unknown, name: string): string { const text=optionalString(value); if (!text) throw new CrawlJobError(`Crawl policy ${name} is required`, true); return text; }
function optionalString(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function stringArray(value: unknown, name: string): string[] { if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) throw new CrawlJobError(`Crawl policy ${name} must be a string array`, true); return value.map((item) => String(item).trim()); }
function booleanValue(value: unknown, fallback: boolean): boolean { return typeof value === "boolean" ? value : fallback; }
function boundedInteger(value: unknown, fallback: number, min: number, max: number, name: string): number { const n=value == null ? fallback : Number(value); if (!Number.isSafeInteger(n) || n<min || n>max) throw new CrawlJobError(`Crawl policy ${name} is out of range`, true); return n; }
function boundedNumber(value: unknown, fallback: number, min: number, max: number, name: string): number { const n=value == null ? fallback : Number(value); if (!Number.isFinite(n) || n<min || n>max) throw new CrawlJobError(`Crawl policy ${name} is out of range`, true); return n; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
