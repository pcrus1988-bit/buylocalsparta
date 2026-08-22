import "server-only";

import { createSign } from "node:crypto";

const READONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_AUDIENCE = "https://oauth2.googleapis.com/token";
const SEARCH_ANALYTICS_BASE = "https://www.googleapis.com/webmasters/v3";
const URL_INSPECTION_ENDPOINT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const REQUEST_TIMEOUT_MS = 10_000;

type TokenCache = Readonly<{ accessToken: string; expiresAt: number }>;
const tokenCacheKey = "__buyLocalSpartaSearchConsoleToken" as const;
type Globals = typeof globalThis & { [tokenCacheKey]?: TokenCache };
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

export type SearchConsoleUrlInspection = Readonly<{
  inspectionUrl: string;
  verdict?: string;
  coverageState?: string;
  robotsTxtState?: string;
  indexingState?: string;
  lastCrawlTime?: string;
  pageFetchState?: string;
  googleCanonical?: string;
  userCanonical?: string;
}>;

type SearchAnalyticsResponse = Readonly<{
  rows?: readonly Readonly<{ clicks?: number; impressions?: number; ctr?: number; position?: number }>[];
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
      googleCanonical?: string;
      userCanonical?: string;
    }>;
  }>;
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

function serviceAccountAssertion(now: number): string {
  const clientEmail = envText("GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL");
  const key = privateKey();
  if (!clientEmail || !key) throw new Error("Search Console service-account credentials are not configured.");
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const issuedAt = Math.floor(now / 1000);
  const claims = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: READONLY_SCOPE,
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

async function accessToken(): Promise<string> {
  const now = Date.now();
  const cached = globals[tokenCacheKey];
  if (cached && cached.expiresAt - 60_000 > now) return cached.accessToken;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(TOKEN_AUDIENCE, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: serviceAccountAssertion(now)
      }),
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Google OAuth token request failed (${response.status}).`);
    const payload = await response.json() as { access_token?: string; expires_in?: number };
    if (!payload.access_token) throw new Error("Google OAuth token response did not contain an access token.");
    const expiresIn = Number.isFinite(payload.expires_in) ? Math.max(60, Number(payload.expires_in)) : 3600;
    globals[tokenCacheKey] = { accessToken: payload.access_token, expiresAt: now + expiresIn * 1000 };
    return payload.access_token;
  } finally {
    clearTimeout(timeout);
  }
}

async function googlePost<T>(url: string, body: unknown): Promise<T> {
  const token = await accessToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Search Console API request failed (${response.status}).`);
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
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

export async function getSearchConsoleOverview(): Promise<SearchConsoleOverview> {
  const readiness = searchConsoleReadiness();
  if (!readiness.ready || !readiness.siteUrl) return { readiness };
  const startDate = pacificDate(30);
  const endDate = pacificDate(2);
  try {
    const encodedSite = encodeURIComponent(readiness.siteUrl);
    const response = await googlePost<SearchAnalyticsResponse>(`${SEARCH_ANALYTICS_BASE}/sites/${encodedSite}/searchAnalytics/query`, {
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

export async function inspectSearchConsoleUrl(inspectionUrl: string): Promise<SearchConsoleUrlInspection> {
  const readiness = searchConsoleReadiness();
  if (!readiness.ready || !readiness.siteUrl) throw new Error("Search Console integration is not ready.");
  let url: URL;
  try {
    url = new URL(inspectionUrl);
  } catch {
    throw new Error("Inspection URL is invalid.");
  }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Inspection URL must be a public HTTPS URL.");
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
    googleCanonical: status?.googleCanonical,
    userCanonical: status?.userCanonical
  };
}
