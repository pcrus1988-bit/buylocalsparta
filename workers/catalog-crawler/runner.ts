import {
  discoverHtmlUrls,
  extractJsonLdProductCandidates,
  parseRobotsTxt,
  parseSitemapXml,
  robotsAllowsUrl,
  validateCrawlUrl,
  type CrawlFetchPolicy,
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

export async function runCrawlJob(options: CrawlRunnerOptions): Promise<Readonly<{ pages: number; extractions: number }>> {
  const policy = parseCrawlPolicySnapshot(options.job.policySnapshot);
  if (policy.fetchMode === "browser") throw new CrawlJobError("Browser-only crawl profiles are not supported by the HTTP crawler worker yet", true);
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

  const discovered: Array<{ url: string; depth: number; fromPageId?: string }> = [{ url: normalizedSeed, depth: 0 }];
  const queued = new Set<string>([normalizedSeed]);
  if (options.job.crawlMode !== "single") {
    const sitemapUrls = await discoverFromSitemaps({
      startUrl: normalizedSeed,
      robots,
      policy,
      fetchPolicy,
      fetchRateLimited,
      maxSitemaps: options.maxSitemaps ?? 32
    });
    for (const url of sitemapUrls) enqueueUrl(url, 0, undefined, discovered, queued, policy, fetchPolicy, normalizedSeed);
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
      await options.store.renew(options.job.jobId, options.workerId, options.leaseSeconds);
      continue;
    }

    if ((response.status === 429 || response.status >= 500) && item.url === normalizedSeed) {
      await options.store.markFailed(page.id, `http_${response.status}`, `Seed returned HTTP ${response.status}`);
      throw new CrawlJobError(`Seed returned retryable HTTP ${response.status}`);
    }

    const html = isHtml(response) ? response.body.toString("utf8") : undefined;
    const candidates = html ? extractJsonLdProductCandidates(html, response.finalUrl) : [];
    let reviewCount = 0;
    for (let ordinal = 0; ordinal < candidates.length; ordinal += 1) {
      const status = await options.store.saveExtraction({ pageId: page.id, extractorVersion: options.job.extractorVersion, ordinal, candidate: candidates[ordinal] });
      if (status === "review_required") reviewCount += 1;
      extractions += 1;
    }
    await options.store.markFetched({
      pageId: page.id,
      result: response,
      productLikelihood: candidates.length ? 1 : productLikelihood(response.finalUrl),
      extractionStatus: candidates.length ? (reviewCount ? "review_required" : "extracted") : "not_applicable"
    });
    processed += 1;

    if (html && options.job.crawlMode !== "single" && item.depth < maxDepth) {
      for (const url of discoverHtmlUrls(html, response.finalUrl, Math.min(policy.maxPages * 4, 50_000))) {
        if (discovered.length >= policy.maxPages * 4) break;
        enqueueUrl(url, item.depth + 1, page.id, discovered, queued, policy, fetchPolicy, normalizedSeed);
      }
    }
    await options.store.renew(options.job.jobId, options.workerId, options.leaseSeconds);
  }

  await options.store.finish(options.job.jobId, options.workerId);
  return { pages: processed, extractions };
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
  if (result.status === 404 || result.status === 410) return { rules: [], sitemaps: [] };
  if (result.status === 401 || result.status === 403) return { rules: [{ allow: false, path: "/" }], sitemaps: [] };
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
  const pending = [...input.robots.sitemaps, new URL("/sitemap.xml", input.startUrl).toString()];
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
      for (const location of locations) if (pending.length + seen.size < input.maxSitemaps * 2) pending.push(location);
    } else {
      pages.push(...locations);
    }
  }
  return [...new Set(pages)].slice(0, input.policy.maxPages);
}

function enqueueUrl(
  rawUrl: string,
  depth: number,
  fromPageId: string | undefined,
  queue: Array<{ url: string; depth: number; fromPageId?: string }>,
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
  return /(?:\/product\/|\/products\/|\/p\/|product-|sku)/.test(path) ? 0.6 : 0.1;
}
function requiredString(value: unknown, name: string): string { const text=optionalString(value); if (!text) throw new CrawlJobError(`Crawl policy ${name} is required`, true); return text; }
function optionalString(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function stringArray(value: unknown, name: string): string[] { if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) throw new CrawlJobError(`Crawl policy ${name} must be a string array`, true); return value.map((item) => String(item).trim()); }
function booleanValue(value: unknown, fallback: boolean): boolean { return typeof value === "boolean" ? value : fallback; }
function boundedInteger(value: unknown, fallback: number, min: number, max: number, name: string): number { const n=value == null ? fallback : Number(value); if (!Number.isSafeInteger(n) || n<min || n>max) throw new CrawlJobError(`Crawl policy ${name} is out of range`, true); return n; }
function boundedNumber(value: unknown, fallback: number, min: number, max: number, name: string): number { const n=value == null ? fallback : Number(value); if (!Number.isFinite(n) || n<min || n>max) throw new CrawlJobError(`Crawl policy ${name} is out of range`, true); return n; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
