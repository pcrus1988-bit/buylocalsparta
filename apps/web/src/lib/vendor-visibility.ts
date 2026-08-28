import { createSign, randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type VendorVisibilityInteraction = "claim" | "phone" | "website" | "directions";

export type VendorVisibilitySummary = Readonly<{
  impressions: number;
  clicks: number;
  ctr: number;
  averagePosition: number;
  pageViews: number;
  activeUsers: number;
  claimClicks: number;
  phoneClicks: number;
  websiteClicks: number;
  directionsClicks: number;
  lastSyncedAt?: string;
}>;

export type AdminVendorVisibilityRow = VendorVisibilitySummary & Readonly<{
  vendorId: string;
  vendorName: string;
  status: string;
  claimed: boolean;
}>;

type VisibilityRow = SqlRow & {
  impressions: number | string | null;
  clicks: number | string | null;
  page_views: number | string | null;
  active_users: number | string | null;
  claim_clicks: number | string | null;
  phone_clicks: number | string | null;
  website_clicks: number | string | null;
  directions_clicks: number | string | null;
  average_position: number | string | null;
  last_synced_at: string | null;
};

type AdminVisibilityRow = VisibilityRow & {
  vendor_id: string;
  vendor_name: string;
  status: string;
};

type GoogleTokenResponse = { access_token?: string; expires_in?: number; token_type?: string; error?: string; error_description?: string };
type GscApiRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
type GscApiResponse = { rows?: GscApiRow[] };
type GaApiRow = { dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> };
type GaApiResponse = { rows?: GaApiRow[]; rowCount?: number };

function asNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function fromVisibilityRow(row?: VisibilityRow): VendorVisibilitySummary {
  const impressions = asNumber(row?.impressions);
  const clicks = asNumber(row?.clicks);
  return {
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : 0,
    averagePosition: asNumber(row?.average_position),
    pageViews: asNumber(row?.page_views),
    activeUsers: asNumber(row?.active_users),
    claimClicks: asNumber(row?.claim_clicks),
    phoneClicks: asNumber(row?.phone_clicks),
    websiteClicks: asNumber(row?.website_clicks),
    directionsClicks: asNumber(row?.directions_clicks),
    lastSyncedAt: typeof row?.last_synced_at === "string" ? row.last_synced_at : undefined
  };
}

function visibilityAggregateSql(extraSelect = "", extraGroup = ""): string {
  return `
    SELECT ${extraSelect}
           COALESCE(SUM(d.gsc_impressions),0)::bigint AS impressions,
           COALESCE(SUM(d.gsc_clicks),0)::bigint AS clicks,
           COALESCE(SUM(d.ga4_page_views),0)::bigint AS page_views,
           COALESCE(SUM(d.ga4_active_users),0)::bigint AS active_users,
           COALESCE(SUM(d.claim_clicks),0)::bigint AS claim_clicks,
           COALESCE(SUM(d.phone_clicks),0)::bigint AS phone_clicks,
           COALESCE(SUM(d.website_clicks),0)::bigint AS website_clicks,
           COALESCE(SUM(d.directions_clicks),0)::bigint AS directions_clicks,
           CASE WHEN COALESCE(SUM(d.gsc_impressions),0) > 0
             THEN SUM(d.gsc_avg_position * d.gsc_impressions) / SUM(d.gsc_impressions)
             ELSE 0 END AS average_position,
           GREATEST(MAX(d.gsc_synced_at), MAX(d.ga4_synced_at))::text AS last_synced_at
    FROM public.vendor_businesses v
    LEFT JOIN public.vendor_visibility_daily d
      ON d.vendor_id=v.id AND d.metric_date >= current_date - 29
    ${extraGroup}`;
}

export async function getVendorVisibilitySummary(vendorPublicId: string): Promise<VendorVisibilitySummary> {
  if (!vendorPublicId.trim() || !productionDatabaseConfigured()) return fromVisibilityRow();
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.sqlPool.query<VisibilityRow>(`${visibilityAggregateSql()} WHERE v.public_id=$1 GROUP BY v.id`, [vendorPublicId]);
  return fromVisibilityRow(result.rows[0]);
}

const interactionColumns: Record<VendorVisibilityInteraction, string> = {
  claim: "claim_clicks",
  phone: "phone_clicks",
  website: "website_clicks",
  directions: "directions_clicks"
};

export async function recordVendorVisibilityInteraction(vendorPublicId: string, event: VendorVisibilityInteraction): Promise<boolean> {
  if (!vendorPublicId.trim() || !interactionColumns[event] || !productionDatabaseConfigured()) return false;
  const runtime = getProductionPostgresRuntime();
  const column = interactionColumns[event];
  const result = await runtime.sqlPool.query(`
    INSERT INTO public.vendor_visibility_daily (vendor_id, metric_date, ${column})
    SELECT id, current_date, 1 FROM public.vendor_businesses WHERE public_id=$1
    ON CONFLICT (vendor_id, metric_date) DO UPDATE SET ${column}=public.vendor_visibility_daily.${column}+1
    RETURNING vendor_id
  `, [vendorPublicId]);
  return result.rowCount > 0;
}

export async function adminVendorVisibilityReport(): Promise<readonly AdminVendorVisibilityRow[]> {
  if (!productionDatabaseConfigured()) return [];
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.sqlPool.query<AdminVisibilityRow>(`
    ${visibilityAggregateSql("v.public_id AS vendor_id, v.trading_name AS vendor_name, v.status::text AS status,", "")}
    WHERE v.status IN ('active','invited')
      AND (v.status='active' OR v.public_id LIKE 'vendor_research_%')
    GROUP BY v.id, v.public_id, v.trading_name, v.status
    ORDER BY CASE WHEN v.status='invited' THEN 0 ELSE 1 END,
             COALESCE(SUM(d.gsc_impressions),0) DESC,
             COALESCE(SUM(d.ga4_page_views),0) DESC,
             v.trading_name
    LIMIT 500
  `);
  return result.rows.map((row) => ({
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    status: row.status,
    claimed: row.status === "active",
    ...fromVisibilityRow(row)
  }));
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function googleAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  if (!email || !rawKey) throw new Error("Google service-account credentials are not configured");
  const privateKey = rawKey.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${base64Url(signer.sign(privateKey))}`;
  const body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store"
  });
  const payload = await response.json() as GoogleTokenResponse;
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description ?? payload.error ?? `Google OAuth failed (${response.status})`);
  return payload.access_token;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function syncWindow(days = 14): { startDate: string; endDate: string } {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(1, days - 1));
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

function vendorIdFromPage(value: string): string | undefined {
  try {
    const path = value.startsWith("http://") || value.startsWith("https://") ? new URL(value).pathname : new URL(value, "https://kontamou.site").pathname;
    const match = path.match(/^\/vendor\/([^/?#]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : undefined;
  } catch {
    return undefined;
  }
}

async function fetchGscRows(token: string, siteUrl: string, startDate: string, endDate: string) {
  const output: Array<{ metricDate: string; pageUrl: string; vendorPublicId: string; impressions: number; clicks: number; ctr: number; averagePosition: number }> = [];
  let startRow = 0;
  for (;;) {
    const response = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ startDate, endDate, dimensions: ["date", "page"], type: "web", dataState: "final", rowLimit: 25000, startRow }),
      cache: "no-store"
    });
    const payload = await response.json() as GscApiResponse & { error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? `Search Console API failed (${response.status})`);
    const rows = payload.rows ?? [];
    for (const row of rows) {
      const metricDate = row.keys?.[0];
      const pageUrl = row.keys?.[1];
      const vendorPublicId = pageUrl ? vendorIdFromPage(pageUrl) : undefined;
      if (!metricDate || !pageUrl || !vendorPublicId) continue;
      output.push({ metricDate, pageUrl, vendorPublicId, impressions: asNumber(row.impressions), clicks: asNumber(row.clicks), ctr: Math.min(1, asNumber(row.ctr)), averagePosition: asNumber(row.position) });
    }
    if (rows.length < 25000) break;
    startRow += rows.length;
  }
  return output;
}

function gaDate(value?: string): string | undefined {
  return value && /^\d{8}$/.test(value) ? `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}` : undefined;
}

async function fetchGaRows(token: string, propertyId: string, startDate: string, endDate: string) {
  const output: Array<{ metricDate: string; vendorPublicId: string; pageViews: number; activeUsers: number }> = [];
  let offset = 0;
  const limit = 100000;
  for (;;) {
    const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "date" }, { name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
        dimensionFilter: { filter: { fieldName: "pagePath", stringFilter: { matchType: "BEGINS_WITH", value: "/vendor/", caseSensitive: false } } },
        limit: String(limit),
        offset: String(offset)
      }),
      cache: "no-store"
    });
    const payload = await response.json() as GaApiResponse & { error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? `Google Analytics Data API failed (${response.status})`);
    const rows = payload.rows ?? [];
    for (const row of rows) {
      const metricDate = gaDate(row.dimensionValues?.[0]?.value);
      const vendorPublicId = vendorIdFromPage(row.dimensionValues?.[1]?.value ?? "");
      if (!metricDate || !vendorPublicId) continue;
      output.push({ metricDate, vendorPublicId, pageViews: asNumber(row.metricValues?.[0]?.value), activeUsers: asNumber(row.metricValues?.[1]?.value) });
    }
    offset += rows.length;
    if (rows.length < limit || offset >= asNumber(payload.rowCount)) break;
  }
  return output;
}

async function persistGscRows(siteUrl: string, requestId: string, rows: Awaited<ReturnType<typeof fetchGscRows>>) {
  if (rows.length === 0) return;
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 30_000, lockTimeoutMs: 5_000 });
  await uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
    const payload = JSON.stringify(rows);
    await tx.query(`
      WITH x AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(
          "metricDate" date, "pageUrl" text, "vendorPublicId" text,
          impressions bigint, clicks bigint, ctr numeric, "averagePosition" numeric
        )
      )
      INSERT INTO public.seo_gsc_page_daily(property, metric_date, page_url, impressions, clicks, ctr, avg_position, source, request_id)
      SELECT $2, x."metricDate", x."pageUrl", x.impressions, x.clicks, x.ctr, x."averagePosition", 'gsc', $3::uuid FROM x
      ON CONFLICT(property, metric_date, page_url) DO UPDATE SET
        impressions=excluded.impressions, clicks=excluded.clicks, ctr=excluded.ctr, avg_position=excluded.avg_position,
        source=excluded.source, request_id=excluded.request_id
    `, [payload, siteUrl, requestId]);
    await tx.query(`
      WITH x AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(
          "metricDate" date, "vendorPublicId" text, impressions bigint, clicks bigint, ctr numeric, "averagePosition" numeric
        )
      )
      INSERT INTO public.vendor_visibility_daily(vendor_id, metric_date, gsc_impressions, gsc_clicks, gsc_ctr, gsc_avg_position, gsc_synced_at)
      SELECT v.id, x."metricDate", x.impressions, x.clicks, x.ctr, x."averagePosition", now()
      FROM x JOIN public.vendor_businesses v ON v.public_id=x."vendorPublicId"
      ON CONFLICT(vendor_id, metric_date) DO UPDATE SET
        gsc_impressions=excluded.gsc_impressions, gsc_clicks=excluded.gsc_clicks, gsc_ctr=excluded.gsc_ctr,
        gsc_avg_position=excluded.gsc_avg_position, gsc_synced_at=excluded.gsc_synced_at
    `, [payload]);
  });
}

async function persistGaRows(rows: Awaited<ReturnType<typeof fetchGaRows>>) {
  if (rows.length === 0) return;
  const runtime = getProductionPostgresRuntime();
  const payload = JSON.stringify(rows);
  await runtime.sqlPool.query(`
    WITH x AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(
        "metricDate" date, "vendorPublicId" text, "pageViews" bigint, "activeUsers" bigint
      )
    )
    INSERT INTO public.vendor_visibility_daily(vendor_id, metric_date, ga4_page_views, ga4_active_users, ga4_synced_at)
    SELECT v.id, x."metricDate", x."pageViews", x."activeUsers", now()
    FROM x JOIN public.vendor_businesses v ON v.public_id=x."vendorPublicId"
    ON CONFLICT(vendor_id, metric_date) DO UPDATE SET
      ga4_page_views=excluded.ga4_page_views, ga4_active_users=excluded.ga4_active_users, ga4_synced_at=excluded.ga4_synced_at
  `, [payload]);
}

export async function syncVendorVisibility(): Promise<Readonly<{ startDate: string; endDate: string; gscRows: number; ga4Rows: number; requestId: string }>> {
  if (!productionDatabaseConfigured()) throw new Error("Production database is not configured");
  const siteUrl = process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL?.trim();
  const propertyId = process.env.GOOGLE_ANALYTICS_PROPERTY_ID?.trim();
  if (!siteUrl || !propertyId) throw new Error("Google Search Console / Analytics property configuration is incomplete");
  const token = await googleAccessToken();
  const { startDate, endDate } = syncWindow(14);
  const requestId = randomUUID();
  const [gscRows, ga4Rows] = await Promise.all([
    fetchGscRows(token, siteUrl, startDate, endDate),
    fetchGaRows(token, propertyId.replace(/^properties\//, ""), startDate, endDate)
  ]);
  await persistGscRows(siteUrl, requestId, gscRows);
  await persistGaRows(ga4Rows);
  return { startDate, endDate, gscRows: gscRows.length, ga4Rows: ga4Rows.length, requestId };
}
