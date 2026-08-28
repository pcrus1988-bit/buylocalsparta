import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_ORIGIN = "https://kontamou.site";
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_TIMEOUT_MS = 18_000;
const DEFAULT_MAX_URLS = 5_000;
const USER_AGENT = "KONTA-MOU-SEO-Monitor/1.0 (+https://kontamou.site)";
const REPORT_DIR = resolve(process.cwd(), "artifacts/seo-production-crawl");

function decodeXml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function extractSitemapLocations(xml) {
  return [...String(xml).matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)]
    .map((match) => decodeXml(match[1].trim()))
    .filter(Boolean);
}

function parseAttributes(tag) {
  const attrs = new Map();
  for (const match of String(tag).matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function metaContent(html, name) {
  for (const match of String(html).matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    if ((attrs.get("name") ?? "").toLowerCase() === name.toLowerCase()) return attrs.get("content")?.trim() ?? "";
  }
  return "";
}

function canonicalHref(html) {
  for (const match of String(html).matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    const rel = (attrs.get("rel") ?? "").toLowerCase().split(/\s+/);
    if (rel.includes("canonical")) return attrs.get("href")?.trim() ?? "";
  }
  return "";
}

function tagText(html, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...String(html).matchAll(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "gi"))];
  return matches.map((match) => stripHtml(match[1]).trim()).filter(Boolean);
}

function stripHtml(html) {
  return String(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function schemaTypes(html) {
  const types = new Set();
  for (const block of String(html).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const match of block[1].matchAll(/["']@type["']\s*:\s*(?:["']([^"']+)["']|\[([^\]]+)\])/gi)) {
      if (match[1]) types.add(match[1]);
      if (match[2]) {
        for (const nested of match[2].matchAll(/["']([^"']+)["']/g)) types.add(nested[1]);
      }
    }
  }
  return [...types].sort();
}

function normalizePath(pathname) {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

export function canonicalKey(value, base = DEFAULT_ORIGIN) {
  try {
    const url = new URL(value, base);
    const port = (url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80") ? "" : url.port;
    return `${url.protocol.toLowerCase()}//${url.hostname.toLowerCase()}${port ? `:${port}` : ""}${normalizePath(url.pathname)}${url.search}`;
  } catch {
    return "";
  }
}

function classifyPage(url) {
  const path = new URL(url).pathname;
  if (path.startsWith("/product/")) return "product";
  if (path.startsWith("/category/")) return "category";
  if (path.startsWith("/vendor/")) return "vendor";
  if (path === "/shop" || path.startsWith("/shop/")) return "shop";
  if (path === "/shops" || path.startsWith("/shops/")) return "shops";
  return "static";
}

export function analyzeDocument({ url, status, headers, html, elapsedMs = 0 }) {
  const critical = [];
  const warnings = [];
  const pageType = classifyPage(url);
  const robotsMeta = metaContent(html, "robots").toLowerCase();
  const xRobots = String(headers?.get?.("x-robots-tag") ?? "").toLowerCase();
  const canonical = canonicalHref(html);
  const title = tagText(html, "title")[0] ?? "";
  const description = metaContent(html, "description");
  const h1 = tagText(html, "h1");
  const bodyTextLength = stripHtml(html).length;
  const schemas = schemaTypes(html);

  if (status >= 300 && status < 400) critical.push(`redirect status ${status}`);
  else if (status !== 200) critical.push(`HTTP ${status}`);

  if (robotsMeta.includes("noindex") || xRobots.includes("noindex")) {
    critical.push(`sitemap URL is noindex${xRobots.includes("noindex") ? " via X-Robots-Tag" : ""}${robotsMeta.includes("noindex") ? " via meta robots" : ""}`);
  }

  if (!canonical) {
    critical.push("missing canonical");
  } else {
    const canonicalUrl = new URL(canonical, url);
    if (canonicalUrl.search || canonicalUrl.hash) critical.push(`canonical contains query/hash: ${canonical}`);
    if (canonicalKey(canonical, url) !== canonicalKey(url)) critical.push(`canonical mismatch: ${canonical}`);
  }

  if (!title) warnings.push("missing title");
  else if (title.length < 18) warnings.push(`short title (${title.length} chars)`);
  else if (title.length > 70) warnings.push(`long title (${title.length} chars)`);

  if (!description) warnings.push("missing meta description");
  else if (description.length < 70) warnings.push(`short meta description (${description.length} chars)`);
  else if (description.length > 180) warnings.push(`long meta description (${description.length} chars)`);

  if (h1.length === 0) warnings.push("missing H1");
  else if (h1.length > 1) warnings.push(`multiple H1s (${h1.length})`);

  if (bodyTextLength < 350) warnings.push(`thin rendered text (${bodyTextLength} chars)`);
  if (elapsedMs > 4_000) warnings.push(`slow response (${elapsedMs} ms)`);

  if (pageType === "vendor" && !schemas.includes("LocalBusiness")) warnings.push("vendor page missing LocalBusiness JSON-LD");
  if (pageType === "product" && !schemas.includes("Product") && !schemas.includes("ProductGroup")) warnings.push("indexable product page missing Product/ProductGroup JSON-LD");

  return {
    url,
    pageType,
    status,
    elapsedMs,
    canonical,
    robotsMeta,
    xRobots,
    title,
    descriptionLength: description.length,
    h1Count: h1.length,
    bodyTextLength,
    schemaTypes: schemas,
    critical,
    warnings
  };
}

async function fetchWithTimeout(fetchImpl, url, { timeoutMs, headers, redirect = "manual" } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetchImpl(url, {
      redirect,
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xml;q=0.9,*/*;q=0.8", ...headers }
    });
    return { response, elapsedMs: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}

async function collectSitemapUrls({ origin, fetchImpl, timeoutMs, maxUrls }) {
  const sitemapUrl = new URL("/sitemap.xml", origin).toString();
  const queue = [sitemapUrl];
  const seenSitemaps = new Set();
  const pageUrls = [];
  const critical = [];

  while (queue.length) {
    const current = queue.shift();
    if (seenSitemaps.has(current)) continue;
    seenSitemaps.add(current);

    let response;
    let elapsedMs;
    try {
      ({ response, elapsedMs } = await fetchWithTimeout(fetchImpl, current, { timeoutMs }));
    } catch (error) {
      critical.push(`${current}: sitemap fetch failed: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    if (response.status !== 200) {
      critical.push(`${current}: sitemap returned HTTP ${response.status}`);
      continue;
    }
    const xml = await response.text();
    const locations = extractSitemapLocations(xml);
    if (!locations.length) critical.push(`${current}: sitemap contained no <loc> entries`);

    if (/<sitemapindex\b/i.test(xml)) {
      for (const location of locations) {
        if (queue.length + seenSitemaps.size > 100) {
          critical.push("sitemap index exceeds 100 child sitemaps; crawl aborted for safety");
          break;
        }
        queue.push(new URL(location, current).toString());
      }
      continue;
    }

    for (const location of locations) pageUrls.push(new URL(location, current).toString());
    if (pageUrls.length > maxUrls) {
      critical.push(`sitemap exposes ${pageUrls.length}+ URLs, above safety limit ${maxUrls}`);
      break;
    }

    if (elapsedMs > 4_000) critical.push(`${current}: sitemap response slow (${elapsedMs} ms)`);
  }

  return { sitemapUrl, pageUrls, critical };
}

function validateSitemapUrlSet(urls, origin) {
  const critical = [];
  const normalizedOrigin = new URL(origin).origin;
  const seen = new Map();

  for (const urlValue of urls) {
    let url;
    try {
      url = new URL(urlValue);
    } catch {
      critical.push(`invalid sitemap URL: ${urlValue}`);
      continue;
    }
    if (url.origin !== normalizedOrigin) critical.push(`foreign origin in sitemap: ${urlValue}`);
    if (url.search) critical.push(`query string in sitemap URL: ${urlValue}`);
    if (url.hash) critical.push(`fragment in sitemap URL: ${urlValue}`);

    const key = canonicalKey(urlValue);
    if (seen.has(key)) critical.push(`duplicate sitemap URL: ${urlValue} (also ${seen.get(key)})`);
    else seen.set(key, urlValue);
  }
  return critical;
}

async function crawlOne(fetchImpl, url, timeoutMs) {
  try {
    const { response, elapsedMs } = await fetchWithTimeout(fetchImpl, url, { timeoutMs });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400) {
      return {
        url,
        pageType: classifyPage(url),
        status: response.status,
        elapsedMs,
        canonical: "",
        robotsMeta: "",
        xRobots: response.headers.get("x-robots-tag") ?? "",
        title: "",
        descriptionLength: 0,
        h1Count: 0,
        bodyTextLength: 0,
        schemaTypes: [],
        critical: [`redirect status ${response.status}${location ? ` → ${location}` : ""}`],
        warnings: []
      };
    }
    const contentType = response.headers.get("content-type") ?? "";
    const html = await response.text();
    const result = analyzeDocument({ url, status: response.status, headers: response.headers, html, elapsedMs });
    if (!contentType.toLowerCase().includes("text/html")) result.warnings.push(`unexpected content-type ${contentType || "missing"}`);
    return result;
  } catch (error) {
    return {
      url,
      pageType: classifyPage(url),
      status: 0,
      elapsedMs: timeoutMs,
      canonical: "",
      robotsMeta: "",
      xRobots: "",
      title: "",
      descriptionLength: 0,
      h1Count: 0,
      bodyTextLength: 0,
      schemaTypes: [],
      critical: [`request failed: ${error instanceof Error ? error.message : String(error)}`],
      warnings: []
    };
  }
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

function buildSummary(results, globalCritical) {
  const criticalPages = results.filter((result) => result.critical.length);
  const warningPages = results.filter((result) => result.warnings.length);
  const byType = {};
  for (const result of results) {
    byType[result.pageType] ??= { checked: 0, critical: 0, warnings: 0 };
    byType[result.pageType].checked += 1;
    if (result.critical.length) byType[result.pageType].critical += 1;
    if (result.warnings.length) byType[result.pageType].warnings += 1;
  }
  const durations = results.map((result) => result.elapsedMs).filter(Number.isFinite);
  return {
    checked: results.length,
    criticalPages: criticalPages.length,
    warningPages: warningPages.length,
    globalCritical: globalCritical.length,
    criticalFindings: globalCritical.length + results.reduce((sum, result) => sum + result.critical.length, 0),
    warningFindings: results.reduce((sum, result) => sum + result.warnings.length, 0),
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    byType
  };
}

function markdownReport(report) {
  const { summary } = report;
  const lines = [
    "# KONTA MOU production SEO crawl",
    "",
    `- Run: ${report.generatedAt}`,
    `- Origin: ${report.origin}`,
    `- Sitemap URLs checked: ${summary.checked}`,
    `- Critical findings: ${summary.criticalFindings}`,
    `- Warning findings: ${summary.warningFindings}`,
    `- Response p50 / p95: ${summary.p50Ms} ms / ${summary.p95Ms} ms`,
    "",
    "## Page-type summary",
    "",
    "| Type | Checked | Critical pages | Warning pages |",
    "| --- | ---: | ---: | ---: |",
    ...Object.entries(summary.byType).sort().map(([type, row]) => `| ${type} | ${row.checked} | ${row.critical} | ${row.warnings} |`),
    ""
  ];

  if (report.globalCritical.length) {
    lines.push("## Sitemap / crawl contract failures", "", ...report.globalCritical.slice(0, 50).map((item) => `- ${item}`), "");
  }

  const criticalPages = report.results.filter((result) => result.critical.length);
  if (criticalPages.length) {
    lines.push("## Critical page failures", "");
    for (const result of criticalPages.slice(0, 75)) {
      lines.push(`### ${result.url}`, ...result.critical.map((item) => `- ${item}`), "");
    }
    if (criticalPages.length > 75) lines.push(`_${criticalPages.length - 75} additional critical pages are available in report.json._`, "");
  }

  const warningPages = report.results.filter((result) => result.warnings.length);
  if (warningPages.length) {
    lines.push("## Quality warnings", "");
    for (const result of warningPages.slice(0, 60)) lines.push(`- ${result.url}: ${result.warnings.join("; ")}`);
    if (warningPages.length > 60) lines.push(`- … ${warningPages.length - 60} additional warning pages are available in report.json.`);
    lines.push("");
  }

  if (!summary.criticalFindings) lines.push("## Status", "", "✅ No critical production crawl/indexability defects were detected.", "");
  return `${lines.join("\n")}\n`;
}

export async function crawlProductionSeo({
  origin = process.env.SEO_ORIGIN || DEFAULT_ORIGIN,
  fetchImpl = globalThis.fetch,
  concurrency = Number(process.env.SEO_CRAWL_CONCURRENCY || DEFAULT_CONCURRENCY),
  timeoutMs = Number(process.env.SEO_CRAWL_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  maxUrls = Number(process.env.SEO_CRAWL_MAX_URLS || DEFAULT_MAX_URLS)
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch implementation is required");
  const normalizedOrigin = new URL(origin).origin;
  const globalCritical = [];

  try {
    const { response } = await fetchWithTimeout(fetchImpl, new URL("/robots.txt", normalizedOrigin).toString(), { timeoutMs });
    if (response.status !== 200) globalCritical.push(`robots.txt returned HTTP ${response.status}`);
    else {
      const robots = await response.text();
      if (/^\s*Disallow:\s*\/\s*$/im.test(robots)) globalCritical.push("robots.txt contains a root Disallow: /");
      if (!robots.toLowerCase().includes("sitemap:")) globalCritical.push("robots.txt does not advertise a Sitemap directive");
    }
  } catch (error) {
    globalCritical.push(`robots.txt fetch failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const sitemap = await collectSitemapUrls({ origin: normalizedOrigin, fetchImpl, timeoutMs, maxUrls });
  globalCritical.push(...sitemap.critical, ...validateSitemapUrlSet(sitemap.pageUrls, normalizedOrigin));

  const uniqueUrls = [...new Map(sitemap.pageUrls.map((url) => [canonicalKey(url), url])).values()].slice(0, maxUrls);
  const results = await mapConcurrent(uniqueUrls, Math.max(1, Math.min(20, concurrency)), (url) => crawlOne(fetchImpl, url, timeoutMs));
  const summary = buildSummary(results, globalCritical);

  return {
    generatedAt: new Date().toISOString(),
    origin: normalizedOrigin,
    sitemapUrl: sitemap.sitemapUrl,
    summary,
    globalCritical,
    results
  };
}

export async function writeSeoCrawlReport(report, directory = REPORT_DIR) {
  await mkdir(directory, { recursive: true });
  const jsonPath = resolve(directory, "report.json");
  const markdownPath = resolve(directory, "report.md");
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, markdownReport(report), "utf8")
  ]);
  return { jsonPath, markdownPath };
}

async function main() {
  const report = await crawlProductionSeo();
  const paths = await writeSeoCrawlReport(report);
  console.log(markdownReport(report));
  console.log(`JSON report: ${paths.jsonPath}`);
  console.log(`Markdown report: ${paths.markdownPath}`);
  if (report.summary.criticalFindings > 0) process.exitCode = 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().catch(async (error) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    const fallback = {
      generatedAt: new Date().toISOString(),
      origin: process.env.SEO_ORIGIN || DEFAULT_ORIGIN,
      sitemapUrl: new URL("/sitemap.xml", process.env.SEO_ORIGIN || DEFAULT_ORIGIN).toString(),
      summary: { checked: 0, criticalPages: 0, warningPages: 0, globalCritical: 1, criticalFindings: 1, warningFindings: 0, p50Ms: 0, p95Ms: 0, byType: {} },
      globalCritical: [`crawler crashed: ${message}`],
      results: []
    };
    await mkdir(dirname(resolve(REPORT_DIR, "report.json")), { recursive: true });
    await writeSeoCrawlReport(fallback);
    console.error(message);
    process.exitCode = 1;
  });
}
