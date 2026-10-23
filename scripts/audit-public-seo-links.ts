/**
 * Bounded read-only audit of public internal links on kontamou.site.
 * Manual: npm run audit:seo-links
 * Options: --max-pages=4 --max-links=20 (caps: 8 seed pages, 40 links).
 * No database access, credentials, writes, external hosts or private routes.
 */
const ORIGIN = "https://kontamou.site";
const SEED_PATHS = ["/", "/brands", "/shops", "/research", "/hubs/sparti", "/shop", "/category/beauty", "/about"] as const;
const TIMEOUT_MS = 4_000;
const MAX_REDIRECTS = 3;

type Observation = Readonly<{
  source: string;
  path: string;
  status?: number;
  finalUrl?: string;
  error?: string;
}>;

function option(name: string, fallback: number, maximum: number): number {
  const prefix = "--" + name + "=";
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error("Invalid " + prefix + raw + "; allowed range 1–" + maximum);
  }
  return value;
}

function canonicalPublicUrl(value: string, parent = ORIGIN): URL | undefined {
  try {
    const url = new URL(value.replaceAll("&amp;", "&"), parent);
    if (url.origin !== ORIGIN || url.username || url.password || url.search) return undefined;
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    if (/^\/(?:api|admin|account|checkout|vendor\/(?:finance|settings|orders|analytics|reports)|daily|driver)(?:\/|$)/i.test(url.pathname)) return undefined;
    if (/^\/(?:login|register|reset-password|forgot-password)(?:\/|$)/i.test(url.pathname)) return undefined;
    url.hash = "";
    return url;
  } catch {
    return undefined;
  }
}

function internalAnchors(html: string, pageUrl: URL): readonly string[] {
  const paths = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const hrefMatch = match[0].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const href = hrefMatch?.[1] ?? hrefMatch?.[2];
    if (!href || href.startsWith("#")) continue;
    const url = canonicalPublicUrl(href, pageUrl.toString());
    if (url) paths.add(url.pathname);
  }
  return [...paths];
}

async function fetchPublic(path: string, method: "HEAD" | "GET"): Promise<{
  status?: number;
  finalUrl?: string;
  body?: string;
  error?: string;
}> {
  let url = new URL(path, ORIGIN);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (url.origin !== ORIGIN) return { error: "off_origin_redirect", finalUrl: url.toString() };
    try {
      const response = await fetch(url, {
        method,
        redirect: "manual",
        cache: "no-store",
        headers: { "user-agent": "KontaMou-SEO-LinkAudit/1.0", accept: "text/html" },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) return { status: response.status, error: "redirect_without_location" };
        const next = canonicalPublicUrl(location, url.toString());
        if (!next) return { status: response.status, error: "unsafe_or_filtered_redirect", finalUrl: location };
        url = next;
        continue;
      }
      const body = method === "GET" && response.headers.get("content-type")?.includes("text/html")
        ? await response.text()
        : undefined;
      if (!body) await response.body?.cancel();
      return { status: response.status, finalUrl: url.toString(), body };
    } catch (error) {
      return { error: error instanceof Error ? error.name : "network_error", finalUrl: url.toString() };
    }
  }
  return { error: "too_many_redirects", finalUrl: url.toString() };
}

async function main(): Promise<void> {
  const pageLimit = option("max-pages", 4, 8);
  const linkLimit = option("max-links", 20, 40);
  const sources = new Map<string, string>();
  const observations: Observation[] = [];
  for (const seed of SEED_PATHS.slice(0, pageLimit)) {
    const result = await fetchPublic(seed, "GET");
    if (result.status !== 200 || !result.body) {
      observations.push({ source: "(seed)", path: seed, status: result.status, error: result.error ?? "html_unavailable" });
      continue;
    }
    for (const path of internalAnchors(result.body, new URL(seed, ORIGIN))) {
      if (!sources.has(path) && !SEED_PATHS.some((seedPath) => seedPath === path)) sources.set(path, seed);
    }
  }
  const selected = [...sources.entries()].slice(0, linkLimit);
  for (const [path, source] of selected) {
    let result = await fetchPublic(path, "HEAD");
    // Fallback only when a legitimate handler rejects HEAD; never write.
    if (result.status === 405 || result.status === 501) result = await fetchPublic(path, "GET");
    observations.push({ source, path, status: result.status, finalUrl: result.finalUrl, error: result.error });
  }
  const broken = observations.filter((item) => item.status === 404 || item.status === 410);
  const uncertain = observations.filter((item) => item.error || !item.status || item.status >= 500);
  console.log(JSON.stringify({
    origin: ORIGIN,
    checkedAt: new Date().toISOString(),
    seedPages: pageLimit,
    linksSampled: selected.length,
    sampledOnly: true,
    broken,
    uncertain,
    checks: observations
  }, null, 2));
  if (broken.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error("SEO link audit failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
