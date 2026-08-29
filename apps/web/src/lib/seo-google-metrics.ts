import "server-only";

import { createSign } from "node:crypto";

const TOKEN_AUDIENCE = "https://oauth2.googleapis.com/token";
const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const SEARCH_ANALYTICS_BASE = "https://www.googleapis.com/webmasters/v3";
const ANALYTICS_DATA_BASE = "https://analyticsdata.googleapis.com/v1beta";
const REQUEST_TIMEOUT_MS = 15_000;
const SEARCH_CONSOLE_PAGE_SIZE = 25_000;
const ANALYTICS_PAGE_SIZE = 100_000;
const MAX_REPORT_ROWS = 100_000;

type GoogleCredentials = Readonly<{ clientEmail: string; privateKey: string }>;
type TokenCache = Readonly<{ accessToken: string; expiresAt: number }>;
type GoogleScope = typeof SEARCH_CONSOLE_SCOPE | typeof ANALYTICS_SCOPE;
const tokenCacheKey = "__buyLocalSpartaSeoGoogleMetricTokens" as const;
type Globals = typeof globalThis & { [tokenCacheKey]?: Record<string, TokenCache> };
const globals = globalThis as Globals;

export type GoogleMetricReadiness = Readonly<{
  enabled: boolean;
  ready: boolean;
  issues: readonly string[];
}>;

export type SearchConsoleDailyPageMetric = Readonly<{
  day: string;
  url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}>;

export type AnalyticsOrganicLandingMetric = Readonly<{
  day: string;
  route: string;
  organicSessions: number;
  engagedSessions: number;
  engagementRate: number;
  keyEvents: number;
  ecommercePurchases: number;
}>;

export type GoogleMetricReport<T> = Readonly<{
  readiness: GoogleMetricReadiness;
  rows: readonly T[];
  error?: string;
}>;

type SearchConsoleResponse = Readonly<{
  rows?: readonly Readonly<{
    keys?: readonly string[];
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
  }>[];
}>;

type AnalyticsResponse = Readonly<{
  rows?: readonly Readonly<{
    dimensionValues?: readonly Readonly<{ value?: string }>[];
    metricValues?: readonly Readonly<{ value?: string }>[];
  }>[];
  rowCount?: number;
}>;

function envText(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function normalizePrivateKey(value?: string): string | undefined {
  return value?.replace(/\\n/g, "\n");
}

function searchConsoleCredentials(): GoogleCredentials | undefined {
  const clientEmail = envText("GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL");
  const privateKey = normalizePrivateKey(envText("GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY"));
  return clientEmail && privateKey ? { clientEmail, privateKey } : undefined;
}

function analyticsCredentials(): GoogleCredentials | undefined {
  const clientEmail = envText("GOOGLE_ANALYTICS_CLIENT_EMAIL") ?? envText("GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL");
  const privateKey = normalizePrivateKey(envText("GOOGLE_ANALYTICS_PRIVATE_KEY") ?? envText("GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY"));
  return clientEmail && privateKey ? { clientEmail, privateKey } : undefined;
}

function searchConsoleSiteUrl(): string | undefined {
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

function analyticsPropertyId(): string | undefined {
  const value = envText("BLS_GOOGLE_ANALYTICS_PROPERTY_ID");
  return value && /^\d+$/.test(value) ? value : undefined;
}

export function searchConsoleMetricsReadiness(): GoogleMetricReadiness {
  const enabled = process.env.BLS_GOOGLE_SEARCH_CONSOLE_ENABLED === "true";
  const issues: string[] = [];
  if (!enabled) issues.push("Search Console integration is disabled.");
  if (!searchConsoleSiteUrl()) issues.push("Search Console property is not configured or invalid.");
  if (!searchConsoleCredentials()) issues.push("Search Console service-account credentials are incomplete.");
  return { enabled, ready: enabled && issues.length === 0, issues };
}

export function analyticsMetricsReadiness(): GoogleMetricReadiness {
  const enabled = process.env.BLS_GOOGLE_ANALYTICS_ENABLED === "true";
  const issues: string[] = [];
  if (!enabled) issues.push("Google Analytics integration is disabled.");
  if (!analyticsPropertyId()) issues.push("GA4 property ID is not configured or invalid.");
  if (!analyticsCredentials()) issues.push("GA4 service-account credentials are incomplete.");
  return { enabled, ready: enabled && issues.length === 0, issues };
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function serviceAccountAssertion(now: number, scope: GoogleScope, credentials: GoogleCredentials): string {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const issuedAt = Math.floor(now / 1000);
  const claims = base64Url(JSON.stringify({
    iss: credentials.clientEmail,
    scope,
    aud: TOKEN_AUDIENCE,
    iat: issuedAt,
    exp: issuedAt + 3600
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${base64Url(signer.sign(credentials.privateKey))}`;
}

async function accessToken(scope: GoogleScope, credentials: GoogleCredentials): Promise<string> {
  const now = Date.now();
  const cacheKey = `${scope}:${credentials.clientEmail}`;
  const cached = globals[tokenCacheKey]?.[cacheKey];
  if (cached && cached.expiresAt - 60_000 > now) return cached.accessToken;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(TOKEN_AUDIENCE, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: serviceAccountAssertion(now, scope, credentials)
      }),
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Google OAuth token request failed (${response.status}).`);
    const payload = await response.json() as { access_token?: string; expires_in?: number };
    if (!payload.access_token) throw new Error("Google OAuth token response did not contain an access token.");
    const expiresIn = Number.isFinite(payload.expires_in) ? Math.max(60, Number(payload.expires_in)) : 3600;
    globals[tokenCacheKey] = {
      ...(globals[tokenCacheKey] ?? {}),
      [cacheKey]: { accessToken: payload.access_token, expiresAt: now + expiresIn * 1000 }
    };
    return payload.access_token;
  } finally {
    clearTimeout(timeout);
  }
}

async function googlePost<T>(url: string, scope: GoogleScope, credentials: GoogleCredentials, body: unknown): Promise<T> {
  const token = await accessToken(scope, credentials);
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
    if (!response.ok) {
      const detail = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 300);
      throw new Error(`Google reporting API request failed (${response.status})${detail ? `: ${detail}` : "."}`);
    }
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

function finiteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function count(value: unknown): number {
  return Math.max(0, Math.round(finiteNumber(value)));
}

function decimal(value: unknown): number {
  return Math.max(0, finiteNumber(value));
}

function isoDateFromGa4(value: string): string | undefined {
  if (!/^\d{8}$/.test(value)) return undefined;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function validDateRange(startDate: string, endDate: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && startDate <= endDate;
}

export async function fetchSearchConsoleDailyPageMetrics(startDate: string, endDate: string): Promise<GoogleMetricReport<SearchConsoleDailyPageMetric>> {
  const readiness = searchConsoleMetricsReadiness();
  if (!readiness.ready) return { readiness, rows: [] };
  if (!validDateRange(startDate, endDate)) return { readiness, rows: [], error: "Invalid Search Console date range." };
  const siteUrl = searchConsoleSiteUrl();
  const credentials = searchConsoleCredentials();
  if (!siteUrl || !credentials) return { readiness, rows: [] };

  try {
    const rows: SearchConsoleDailyPageMetric[] = [];
    for (let startRow = 0; startRow < MAX_REPORT_ROWS; startRow += SEARCH_CONSOLE_PAGE_SIZE) {
      const response = await googlePost<SearchConsoleResponse>(
        `${SEARCH_ANALYTICS_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        SEARCH_CONSOLE_SCOPE,
        credentials,
        {
          startDate,
          endDate,
          dimensions: ["date", "page"],
          rowLimit: SEARCH_CONSOLE_PAGE_SIZE,
          startRow,
          dataState: "final"
        }
      );
      const page = response.rows ?? [];
      for (const row of page) {
        const day = String(row.keys?.[0] ?? "");
        const url = String(row.keys?.[1] ?? "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !url) continue;
        rows.push({
          day,
          url,
          clicks: count(row.clicks),
          impressions: count(row.impressions),
          ctr: Math.min(1, decimal(row.ctr)),
          position: decimal(row.position)
        });
      }
      if (page.length < SEARCH_CONSOLE_PAGE_SIZE) break;
    }
    return { readiness, rows };
  } catch (error) {
    return { readiness, rows: [], error: error instanceof Error ? error.message : "Search Console reporting request failed." };
  }
}

export async function fetchAnalyticsOrganicLandingMetrics(startDate: string, endDate: string): Promise<GoogleMetricReport<AnalyticsOrganicLandingMetric>> {
  const readiness = analyticsMetricsReadiness();
  if (!readiness.ready) return { readiness, rows: [] };
  if (!validDateRange(startDate, endDate)) return { readiness, rows: [], error: "Invalid GA4 date range." };
  const propertyId = analyticsPropertyId();
  const credentials = analyticsCredentials();
  if (!propertyId || !credentials) return { readiness, rows: [] };

  try {
    const rows: AnalyticsOrganicLandingMetric[] = [];
    for (let offset = 0; offset < MAX_REPORT_ROWS; offset += ANALYTICS_PAGE_SIZE) {
      const response = await googlePost<AnalyticsResponse>(
        `${ANALYTICS_DATA_BASE}/properties/${propertyId}:runReport`,
        ANALYTICS_SCOPE,
        credentials,
        {
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: "date" }, { name: "landingPage" }],
          metrics: [
            { name: "sessions" },
            { name: "engagedSessions" },
            { name: "engagementRate" },
            { name: "keyEvents" },
            { name: "ecommercePurchases" }
          ],
          dimensionFilter: {
            filter: {
              fieldName: "sessionDefaultChannelGroup",
              stringFilter: { matchType: "EXACT", value: "Organic Search", caseSensitive: true }
            }
          },
          limit: ANALYTICS_PAGE_SIZE,
          offset
        }
      );
      const page = response.rows ?? [];
      for (const row of page) {
        const day = isoDateFromGa4(String(row.dimensionValues?.[0]?.value ?? ""));
        const route = String(row.dimensionValues?.[1]?.value ?? "").trim();
        if (!day || !route.startsWith("/")) continue;
        rows.push({
          day,
          route,
          organicSessions: count(row.metricValues?.[0]?.value),
          engagedSessions: count(row.metricValues?.[1]?.value),
          engagementRate: Math.min(1, decimal(row.metricValues?.[2]?.value)),
          keyEvents: decimal(row.metricValues?.[3]?.value),
          ecommercePurchases: decimal(row.metricValues?.[4]?.value)
        });
      }
      if (page.length < ANALYTICS_PAGE_SIZE || Number(response.rowCount ?? 0) <= offset + page.length) break;
    }
    return { readiness, rows };
  } catch (error) {
    return { readiness, rows: [], error: error instanceof Error ? error.message : "GA4 reporting request failed." };
  }
}
