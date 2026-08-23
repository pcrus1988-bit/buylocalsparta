import "server-only";

import { createSign } from "node:crypto";

const READONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const WRITE_SCOPE = "https://www.googleapis.com/auth/webmasters";
const TOKEN_AUDIENCE = "https://oauth2.googleapis.com/token";
const SEARCH_ANALYTICS_BASE = "https://www.googleapis.com/webmasters/v3";
const URL_INSPECTION_ENDPOINT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BREAKDOWN_ROWS = 250;

type OAuthScope = typeof READONLY_SCOPE | typeof WRITE_SCOPE;
type TokenCache = Readonly<{ accessToken: string; expiresAt: number }>;
const tokenCacheKey = "__buyLocalSpartaSearchConsoleTokens" as const;
type Globals = typeof globalThis & { [tokenCacheKey]?: Partial<Record<OAuthScope, TokenCache>> };
const globals = globalThis as Globals;

export type SearchConsoleReadiness = Readonly<{
  enabled: boolean;
  siteUrl?: string;
  credentialsConfigured: boolean;
  ready: boolean;
  issues: readonly string[];
}>;

export type SearchConsolePerformance = Readonly<{
  startDate: string;
  endDate: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}>;

export type SearchConsoleOverview = Readonly<{
  readiness: SearchConsoleReadiness;
  performance?: SearchConsolePerformance;
  error?: string;
}>;

export type SearchConsolePerformanceRow = Readonly<{
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}>;

export type SearchConsoleBreakdown = Readonly<{
  startDate: string;
  endDate: string;
  queries: readonly SearchConsolePerformanceRow[];
  pages: readonly SearchConsolePerformanceRow[];
  error?: string;
}>;

export type SearchConsoleUrlInspection = Readonly<{
  inspectionUrl: string;
  verdict?: string;
  coverageState?: string;
  robotsTxtState?: string;
  indexingState?: string;
  lastCrawlTime?: string;
  pageFetchState?: string;
  crawledAs?: string;
  googleCanonical?: string;
  userCanonical?: string;
  sitemaps: readonly string[];
  referringUrls: readonly string[];
}>;

export type SearchConsoleSitemapStatus = Readonly<{
  sitemapUrl: string;
  submitted: boolean;
  path?: string;
  lastSubmitted?: string;
  lastDownloaded?: string;
  isPending: boolean;
  isSitemapsIndex: boolean;
  type?: string;
  warnings: number;
  errors: number;
}>;

type SearchAnalyticsResponse = Readonly<{
  rows?: readonly Readonly<{
    keys?: readonly string[];
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
  }>[];
}>;

type UrlInspectionResponse = Readonly<{
  inspectionResult?: Readonly<{
    indexStatusResult?: Readonly<{
      verdict?: string;
      coverageState?: string;
      robotsTxtState?: string;
      indexingState?: string;
      lastCrawlTime?: string;
      pageFetchState?: string;
      crawledAs?: string;
      googleCanonical?: string;
      userCanonical?: string;
      sitemap?: readonly string[];
      referringUrls?: readonly string[];
    }>;
  }>;
}>;

type SitemapResource = Readonly<{
  path?: string;
  lastSubmitted?: string;
  lastDownloaded?: string;
  isPending?: boolean;
  isSitemapsIndex?: boolean;
  type?: string;
  warnings?: number | string;
  errors?: number | string;
}>;

function envText(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function configuredSiteUrl(): string | undefined {
  const value = envText("BLS_GOOGLE_SEARCH_CONSOLE_SITE_URL");
  if (!value) return undefined;
  if (value.startsWith("sc-domain:") && /^sc-domain:[A-Za-z0-9.-]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function privateKey(): string | undefined {
  const value = envText("GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY");
  return value?.replace(/\\n/g, "\n");
}

export function searchConsoleReadiness(): SearchConsoleReadiness {
  const enabled = process.env.BLS_GOOGLE_SEARCH_CONSOLE_ENABLED === "true";
  const siteUrl = configuredSiteUrl();
  const clientEmail = envText("GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL");
  const key = privateKey();
  const issues: string[] = [];
  if (!enabled) issues.push("Integration is disabled.");
  if (!siteUrl) issues.push("Search Console property is not configured or invalid.");
  if (!clientEmail || !key) issues.push("Service-account credentials are incomplete.");
  return {
    enabled,
    siteUrl,
    credentialsConfigured: Boolean(clientEmail && key),
    ready: enabled && Boolean(siteUrl && clientEmail && key),
    issues
  };
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function serviceAccountAssertion(now: number, scope: OAuthScope): string {
  const clientEmail = envText("GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL");
  const key = privateKey();
  if (!clientEmail || !key) throw new Error("Search Console service-account credentials are not configured.");
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const issuedAt = Math.floor(now / 1000);
  const claims = base64Url(JSON.stringify({
    iss: clientEmail,
    scope,
    aud: TOKEN_AUDIENCE,
    iat: issuedAt,
    exp: issuedAt + 3600
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${base64Url(signer.sign(key))}`;
}

async function accessToken(scope: OAuthScope): Promise<string> {
  const now = Date.now();
  const cache = globals[tokenCacheKey] ?? {};
  const cached = cache[scope];
  if (cached && cached.expiresAt - 60_000 > now) return cached.accessToken;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(TOKEN_AUDIENCE, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: serviceAccountAssertion(now, scope)
      }),
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Google OAuth token request failed (${response.status}).`);
    const payload = await response.json() as { access_token?: string; expires_in?: number };
    if (!payload.access_token) throw new Error("Google OAuth token response did not contain an access token.");
    const expiresIn = Number.isFinite(payload.expires_in) ? Math.max(60, Number(payload.expires_in)) : 3600;
    globals[tokenCacheKey] = { ...cache, [scope]: { accessToken: payload.access_token, expiresAt: now + expiresIn * 1000 } };
    return payload.access_token;
  } finally {
    clearTimeout(timeout);
  }
}

type GoogleRequestOptions = Readonly<{
  method: "GET" | "POST" | "PUT";
  scope?: OAuthScope;
  body?: unknown;
  allowNotFound?: boolean;
}>;

async function googleRequest<T>(url: string, options: GoogleRequestOptions): Promise<T | undefined> {
  const token = await accessToken(options.scope ?? READONLY_SCOPE);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    const init: RequestInit = { method: options.method, headers, cache: "no-store", signal: controller.signal };
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    const response = await fetch(url, init);
    if (options.allowNotFound && response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Search Console API request failed (${response.status}).`);
    if (response.status === 204) return undefined;
    const text = await response.text();
    return text ? JSON.parse(text) as T : undefined;
  } finally {
    clearTimeout(timeout);
  }
}

async function googlePost<T>(url: string, body: unknown): Promise<T> {
  const response = await googleRequest<T>(url, { method: "POST", body, scope: READONLY_SCOPE });
  if (response === undefined) throw new Error("Search Console API returned an empty response.");
  return response;
}

function pacificDate(daysAgo: number): string {
  const date = new Date(Date.now() - daysAgo * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

async function searchAnalytics(siteUrl: string, body: Record<string, unknown>): Promise<SearchAnalyticsResponse> {
  return googlePost<SearchAnalyticsResponse>(`${SEARCH_ANALYTICS_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, body);
}

function toPerformanceRows(response: SearchAnalyticsResponse): SearchConsolePerformanceRow[] {
  return (response.rows ?? []).map((row) => ({
    key: String(row.keys?.[0] ?? ""),
    clicks: Number(row.clicks ?? 0),
    impressions: Number(row.impressions ?? 0),
    ctr: Number(row.ctr ?? 0),
    position: Number(row.position ?? 0)
  })).filter((row) => Boolean(row.key));
}

export async function getSearchConsoleOverview(): Promise<SearchConsoleOverview> {
  const readiness = searchConsoleReadiness();
  if (!readiness.ready || !readiness.siteUrl) return { readiness };
  const startDate = pacificDate(30);
  const endDate = pacificDate(2);
  try {
    const response = await searchAnalytics(readiness.siteUrl, {
      startDate,
      endDate,
      rowLimit: 1,
      aggregationType: "auto"
    });
    const row = response.rows?.[0];
    return {
      readiness,
      performance: {
        startDate,
        endDate,
        clicks: Number(row?.clicks ?? 0),
        impressions: Number(row?.impressions ?? 0),
        ctr: Number(row?.ctr ?? 0),
        position: Number(row?.position ?? 0)
      }
    };
  } catch (error) {
    return { readiness, error: error instanceof Error ? error.message : "Search Console request failed." };
  }
}

export async function getSearchConsoleBreakdown(rowLimit = 25): Promise<SearchConsoleBreakdown> {
  const readiness = searchConsoleReadiness();
  const startDate = pacificDate(30);
  const endDate = pacificDate(2);
  if (!readiness.ready || !readiness.siteUrl) return { startDate, endDate, queries: [], pages: [] };
  const boundedLimit = Math.max(1, Math.min(MAX_BREAKDOWN_ROWS, Math.floor(rowLimit)));
  try {
    const [queries, pages] = await Promise.all([
      searchAnalytics(readiness.siteUrl, { startDate, endDate, dimensions: ["query"], rowLimit: boundedLimit, dataState: "final" }),
      searchAnalytics(readiness.siteUrl, { startDate, endDate, dimensions: ["page"], rowLimit: boundedLimit, dataState: "final" })
    ]);
    return { startDate, endDate, queries: toPerformanceRows(queries), pages: toPerformanceRows(pages) };
  } catch (error) {
    return {
      startDate,
      endDate,
      queries: [],
      pages: [],
      error: error instanceof Error ? error.message : "Search Console breakdown request failed."
    };
  }
}

function urlBelongsToProperty(url: URL, siteUrl: string): boolean {
  if (siteUrl.startsWith("sc-domain:")) {
    const domain = siteUrl.slice("sc-domain:".length).toLowerCase();
    const hostname = url.hostname.toLowerCase();
    return hostname === domain || hostname.endsWith(`.${domain}`);
  }
  try {
    const property = new URL(siteUrl);
    return url.origin === property.origin && url.pathname.startsWith(property.pathname);
  } catch {
    return false;
  }
}

function validatedPropertyUrl(value: string, siteUrl: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} URL is invalid.`);
  }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error(`${label} URL must be a public HTTPS URL.`);
  if (!urlBelongsToProperty(url, siteUrl)) throw new Error(`${label} URL does not belong to the configured Search Console property.`);
  return url;
}

export async function inspectSearchConsoleUrl(inspectionUrl: string): Promise<SearchConsoleUrlInspection> {
  const readiness = searchConsoleReadiness();
  if (!readiness.ready || !readiness.siteUrl) throw new Error("Search Console integration is not ready.");
  const url = validatedPropertyUrl(inspectionUrl, readiness.siteUrl, "Inspection");
  const response = await googlePost<UrlInspectionResponse>(URL_INSPECTION_ENDPOINT, {
    inspectionUrl: url.toString(),
    siteUrl: readiness.siteUrl,
    languageCode: "el-GR"
  });
  const status = response.inspectionResult?.indexStatusResult;
  return {
    inspectionUrl: url.toString(),
    verdict: status?.verdict,
    coverageState: status?.coverageState,
    robotsTxtState: status?.robotsTxtState,
    indexingState: status?.indexingState,
    lastCrawlTime: status?.lastCrawlTime,
    pageFetchState: status?.pageFetchState,
    crawledAs: status?.crawledAs,
    googleCanonical: status?.googleCanonical,
    userCanonical: status?.userCanonical,
    sitemaps: [...(status?.sitemap ?? [])],
    referringUrls: [...(status?.referringUrls ?? [])]
  };
}

function sitemapStatus(sitemapUrl: string, resource?: SitemapResource): SearchConsoleSitemapStatus {
  return {
    sitemapUrl,
    submitted: Boolean(resource),
    path: resource?.path,
    lastSubmitted: resource?.lastSubmitted,
    lastDownloaded: resource?.lastDownloaded,
    isPending: Boolean(resource?.isPending),
    isSitemapsIndex: Boolean(resource?.isSitemapsIndex),
    type: resource?.type,
    warnings: Math.max(0, Number(resource?.warnings ?? 0) || 0),
    errors: Math.max(0, Number(resource?.errors ?? 0) || 0)
  };
}

function sitemapApiUrl(siteUrl: string, sitemapUrl: string): string {
  return `${SEARCH_ANALYTICS_BASE}/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
}

export async function getSearchConsoleSitemapStatus(sitemapUrl: string): Promise<SearchConsoleSitemapStatus> {
  const readiness = searchConsoleReadiness();
  if (!readiness.ready || !readiness.siteUrl) throw new Error("Search Console integration is not ready.");
  const url = validatedPropertyUrl(sitemapUrl, readiness.siteUrl, "Sitemap");
  const resource = await googleRequest<SitemapResource>(sitemapApiUrl(readiness.siteUrl, url.toString()), {
    method: "GET",
    scope: READONLY_SCOPE,
    allowNotFound: true
  });
  return sitemapStatus(url.toString(), resource);
}

export async function submitSearchConsoleSitemap(sitemapUrl: string): Promise<Readonly<{ sitemapUrl: string; submittedAt: string }>> {
  const readiness = searchConsoleReadiness();
  if (!readiness.ready || !readiness.siteUrl) throw new Error("Search Console integration is not ready.");
  const url = validatedPropertyUrl(sitemapUrl, readiness.siteUrl, "Sitemap");
  await googleRequest<void>(sitemapApiUrl(readiness.siteUrl, url.toString()), {
    method: "PUT",
    scope: WRITE_SCOPE
  });
  return { sitemapUrl: url.toString(), submittedAt: new Date().toISOString() };
}
