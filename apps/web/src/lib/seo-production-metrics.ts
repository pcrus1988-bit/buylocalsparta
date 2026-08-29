import "server-only";

import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import {
  fetchAnalyticsOrganicLandingMetrics,
  fetchSearchConsoleDailyPageMetrics,
  type AnalyticsOrganicLandingMetric,
  type SearchConsoleDailyPageMetric
} from "./seo-google-metrics";
import { getSeoGlobalSettingsSnapshot } from "./seo-settings";

const DAY_MS = 86_400_000;
const RETENTION_MONTHS = 16;
const RECENT_DAYS = 3;
const GSC_FINAL_LAG_DAYS = 2;
const GA4_FINAL_LAG_DAYS = 1;
const BACKFILL_CHUNK_DAYS = 28;
const BACKFILL_CHUNKS_PER_RUN = 2;
const WRITE_BATCH_SIZE = 1_000;

type Provider = "gsc" | "ga4";
type SyncStateRow = SqlRow & {
  backfill_cursor?: Date | string | null;
  backfill_complete_at?: Date | string | null;
};

type NormalizedGscRow = Readonly<{
  day: string;
  route: string;
  url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}>;

type NormalizedGa4Row = Readonly<{
  day: string;
  route: string;
  organicSessions: number;
  engagedSessions: number;
  engagementRate: number;
  keyEvents: number;
  ecommercePurchases: number;
}>;

export type SeoProductionProviderSync = Readonly<{
  provider: Provider;
  status: "synced" | "skipped" | "error";
  recentStart?: string;
  recentEnd?: string;
  recentRows: number;
  backfillRows: number;
  backfillChunks: number;
  backfillComplete: boolean;
  reason?: string;
  error?: string;
}>;

export type SeoProductionMetricsSync = Readonly<{
  status: "synced" | "skipped" | "partial" | "error";
  retentionStart?: string;
  providers: readonly SeoProductionProviderSync[];
}>;

function marketCode(): string {
  return process.env.DEFAULT_MARKET?.trim() || "sparta";
}

function dateOnly(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
}

function shiftDate(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function zonedDate(daysAgo: number, timeZone: string): string {
  const date = new Date(Date.now() - daysAgo * DAY_MS);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

function retentionStart(referenceDay: string): string {
  const date = new Date(`${referenceDay}T12:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() - RETENTION_MONTHS);
  return date.toISOString().slice(0, 10);
}

function recentRange(provider: Provider): Readonly<{ start: string; end: string }> {
  const end = provider === "gsc"
    ? zonedDate(GSC_FINAL_LAG_DAYS, "America/Los_Angeles")
    : zonedDate(GA4_FINAL_LAG_DAYS, "Europe/Athens");
  return { start: shiftDate(end, -(RECENT_DAYS - 1)), end };
}

function normalizeRoute(pathname: string): string {
  const value = pathname || "/";
  if (value === "/") return value;
  return value.replace(/\/+$/, "") || "/";
}

function comparableHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function routeForUrl(value: string, canonicalOrigin: string): string | undefined {
  try {
    const url = new URL(value);
    const canonical = new URL(canonicalOrigin);
    if (url.protocol !== "https:" || comparableHostname(url.hostname) !== comparableHostname(canonical.hostname)) return undefined;
    return normalizeRoute(url.pathname);
  } catch {
    return undefined;
  }
}

function normalizeGa4Route(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return undefined;
  const withoutQuery = trimmed.split(/[?#]/, 1)[0] || "/";
  return normalizeRoute(withoutQuery);
}

function normalizeGscRows(rows: readonly SearchConsoleDailyPageMetric[], canonicalOrigin: string): NormalizedGscRow[] {
  type Aggregate = { day: string; route: string; url: string; clicks: number; impressions: number; weightedPosition: number };
  const aggregate = new Map<string, Aggregate>();
  for (const row of rows) {
    const route = routeForUrl(row.url, canonicalOrigin);
    if (!route) continue;
    const key = `${row.day}\u0000${route}`;
    const current = aggregate.get(key) ?? { day: row.day, route, url: row.url, clicks: 0, impressions: 0, weightedPosition: 0 };
    current.clicks += Math.max(0, Math.round(row.clicks));
    current.impressions += Math.max(0, Math.round(row.impressions));
    current.weightedPosition += Math.max(0, row.position) * Math.max(0, row.impressions);
    aggregate.set(key, current);
  }
  return [...aggregate.values()].map((row) => ({
    day: row.day,
    route: row.route,
    url: row.url,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.impressions ? Math.min(1, row.clicks / row.impressions) : 0,
    position: row.impressions ? row.weightedPosition / row.impressions : 0
  }));
}

function normalizeGa4Rows(rows: readonly AnalyticsOrganicLandingMetric[]): NormalizedGa4Row[] {
  type Aggregate = { day: string; route: string; sessions: number; engaged: number; keyEvents: number; purchases: number };
  const aggregate = new Map<string, Aggregate>();
  for (const row of rows) {
    const route = normalizeGa4Route(row.route);
    if (!route) continue;
    const key = `${row.day}\u0000${route}`;
    const current = aggregate.get(key) ?? { day: row.day, route, sessions: 0, engaged: 0, keyEvents: 0, purchases: 0 };
    current.sessions += Math.max(0, Math.round(row.organicSessions));
    current.engaged += Math.max(0, Math.round(row.engagedSessions));
    current.keyEvents += Math.max(0, row.keyEvents);
    current.purchases += Math.max(0, row.ecommercePurchases);
    aggregate.set(key, current);
  }
  return [...aggregate.values()].map((row) => ({
    day: row.day,
    route: row.route,
    organicSessions: row.sessions,
    engagedSessions: row.engaged,
    engagementRate: row.sessions ? Math.min(1, row.engaged / row.sessions) : 0,
    keyEvents: row.keyEvents,
    ecommercePurchases: row.purchases
  }));
}

function batches<T>(rows: readonly T[], size = WRITE_BATCH_SIZE): readonly T[][] {
  const result: T[][] = [];
  for (let index = 0; index < rows.length; index += size) result.push(rows.slice(index, index + size));
  return result;
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error || "Unknown SEO metrics sync error")).replace(/\s+/g, " ").trim().slice(0, 1000);
}

async function withPlatformTransaction<T>(fn: Parameters<PostgresUnitOfWork["withTransaction"]>[1]): Promise<T> {
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 20_000, lockTimeoutMs: 3_000 });
  return uow.withTransaction({ marketId: marketCode(), platformAccess: true }, fn) as Promise<T>;
}

async function readSyncState(provider: Provider): Promise<Readonly<{ cursor?: string; complete: boolean }>> {
  return withPlatformTransaction(async (tx) => {
    const result = await tx.query<SyncStateRow>(`
      SELECT backfill_cursor,backfill_complete_at
      FROM seo_production_metrics_sync_state
      WHERE market_id=nullif(current_setting('app.market_id',true),'')::uuid AND provider=$1
    `, [provider]);
    const row = result.rows[0];
    return { cursor: dateOnly(row?.backfill_cursor), complete: Boolean(row?.backfill_complete_at) };
  });
}

async function markRecentSuccess(provider: Provider, start: string, end: string): Promise<void> {
  await withPlatformTransaction(async (tx) => {
    await tx.query(`
      INSERT INTO seo_production_metrics_sync_state(
        market_id,provider,last_recent_start,last_recent_end,last_success_at,last_error,updated_at
      ) VALUES(
        nullif(current_setting('app.market_id',true),'')::uuid,$1,$2::date,$3::date,now(),NULL,now()
      )
      ON CONFLICT(market_id,provider) DO UPDATE SET
        last_recent_start=excluded.last_recent_start,
        last_recent_end=excluded.last_recent_end,
        last_success_at=excluded.last_success_at,
        last_error=NULL,
        updated_at=now()
    `, [provider, start, end]);
  });
}

async function markBackfillProgress(provider: Provider, nextCursor: string | undefined, complete: boolean): Promise<void> {
  await withPlatformTransaction(async (tx) => {
    await tx.query(`
      INSERT INTO seo_production_metrics_sync_state(
        market_id,provider,backfill_cursor,backfill_complete_at,last_success_at,last_error,updated_at
      ) VALUES(
        nullif(current_setting('app.market_id',true),'')::uuid,$1,$2::date,
        CASE WHEN $3::boolean THEN now() ELSE NULL END,now(),NULL,now()
      )
      ON CONFLICT(market_id,provider) DO UPDATE SET
        backfill_cursor=excluded.backfill_cursor,
        backfill_complete_at=CASE WHEN $3::boolean THEN COALESCE(seo_production_metrics_sync_state.backfill_complete_at,now()) ELSE NULL END,
        last_success_at=now(),
        last_error=NULL,
        updated_at=now()
    `, [provider, nextCursor ?? null, complete]);
  });
}

async function markProviderError(provider: Provider, error: unknown): Promise<void> {
  await withPlatformTransaction(async (tx) => {
    await tx.query(`
      INSERT INTO seo_production_metrics_sync_state(market_id,provider,last_error,updated_at)
      VALUES(nullif(current_setting('app.market_id',true),'')::uuid,$1,$2,now())
      ON CONFLICT(market_id,provider) DO UPDATE SET last_error=excluded.last_error,updated_at=now()
    `, [provider, errorText(error)]);
  });
}

async function persistGscRows(rows: readonly NormalizedGscRow[]): Promise<void> {
  for (const batch of batches(rows)) {
    await withPlatformTransaction(async (tx) => {
      await tx.query(`
        INSERT INTO seo_gsc_daily_page_metrics(
          market_id,day,route,url,clicks,impressions,ctr,position,updated_at
        )
        SELECT
          nullif(current_setting('app.market_id',true),'')::uuid,
          x.day::date,x.route,x.url,x.clicks,x.impressions,x.ctr,x.position,now()
        FROM jsonb_to_recordset($1::jsonb) AS x(
          day text,route text,url text,clicks bigint,impressions bigint,ctr numeric,position numeric
        )
        ON CONFLICT(market_id,day,route) DO UPDATE SET
          url=excluded.url,
          clicks=excluded.clicks,
          impressions=excluded.impressions,
          ctr=excluded.ctr,
          position=excluded.position,
          updated_at=now()
      `, [JSON.stringify(batch)]);
    });
  }
}

async function persistGa4Rows(rows: readonly NormalizedGa4Row[]): Promise<void> {
  for (const batch of batches(rows)) {
    await withPlatformTransaction(async (tx) => {
      await tx.query(`
        INSERT INTO seo_ga4_daily_landing_metrics(
          market_id,day,route,organic_sessions,engaged_sessions,engagement_rate,key_events,ecommerce_purchases,updated_at
        )
        SELECT
          nullif(current_setting('app.market_id',true),'')::uuid,
          x.day::date,x.route,x.organic_sessions,x.engaged_sessions,x.engagement_rate,x.key_events,x.ecommerce_purchases,now()
        FROM jsonb_to_recordset($1::jsonb) AS x(
          day text,route text,organic_sessions bigint,engaged_sessions bigint,engagement_rate numeric,key_events numeric,ecommerce_purchases numeric
        )
        ON CONFLICT(market_id,day,route) DO UPDATE SET
          organic_sessions=excluded.organic_sessions,
          engaged_sessions=excluded.engaged_sessions,
          engagement_rate=excluded.engagement_rate,
          key_events=excluded.key_events,
          ecommerce_purchases=excluded.ecommerce_purchases,
          updated_at=now()
      `, [JSON.stringify(batch.map((row) => ({
        day: row.day,
        route: row.route,
        organic_sessions: row.organicSessions,
        engaged_sessions: row.engagedSessions,
        engagement_rate: row.engagementRate,
        key_events: row.keyEvents,
        ecommerce_purchases: row.ecommercePurchases
      })))]);
    });
  }
}

async function pruneOldMetrics(oldestDay: string): Promise<void> {
  await withPlatformTransaction(async (tx) => {
    await tx.query(`DELETE FROM seo_gsc_daily_page_metrics WHERE market_id=nullif(current_setting('app.market_id',true),'')::uuid AND day < $1::date`, [oldestDay]);
    await tx.query(`DELETE FROM seo_ga4_daily_landing_metrics WHERE market_id=nullif(current_setting('app.market_id',true),'')::uuid AND day < $1::date`, [oldestDay]);
  });
}

async function syncGsc(canonicalOrigin: string, oldestDay: string): Promise<SeoProductionProviderSync> {
  const provider = "gsc" as const;
  const recent = recentRange(provider);
  const report = await fetchSearchConsoleDailyPageMetrics(recent.start, recent.end);
  if (!report.readiness.ready) {
    return { provider, status: "skipped", recentRows: 0, backfillRows: 0, backfillChunks: 0, backfillComplete: false, reason: report.readiness.issues.join(" ") };
  }
  if (report.error) {
    await markProviderError(provider, report.error);
    return { provider, status: "error", recentStart: recent.start, recentEnd: recent.end, recentRows: 0, backfillRows: 0, backfillChunks: 0, backfillComplete: false, error: report.error };
  }

  const recentRows = normalizeGscRows(report.rows, canonicalOrigin);
  await persistGscRows(recentRows);
  await markRecentSuccess(provider, recent.start, recent.end);

  let state = await readSyncState(provider);
  let cursor = state.cursor ?? shiftDate(recent.start, -1);
  let backfillRows = 0;
  let backfillChunks = 0;
  let backfillComplete = state.complete;

  if (!backfillComplete) {
    for (let index = 0; index < BACKFILL_CHUNKS_PER_RUN && cursor >= oldestDay; index += 1) {
      const start = [shiftDate(cursor, -(BACKFILL_CHUNK_DAYS - 1)), oldestDay].sort().reverse()[0];
      const historical = await fetchSearchConsoleDailyPageMetrics(start, cursor);
      if (historical.error) {
        await markProviderError(provider, historical.error);
        return { provider, status: "error", recentStart: recent.start, recentEnd: recent.end, recentRows: recentRows.length, backfillRows, backfillChunks, backfillComplete: false, error: historical.error };
      }
      const normalized = normalizeGscRows(historical.rows, canonicalOrigin);
      await persistGscRows(normalized);
      backfillRows += normalized.length;
      backfillChunks += 1;
      const next = shiftDate(start, -1);
      backfillComplete = next < oldestDay;
      cursor = next;
      await markBackfillProgress(provider, backfillComplete ? undefined : cursor, backfillComplete);
      if (backfillComplete) break;
    }
  }

  return { provider, status: "synced", recentStart: recent.start, recentEnd: recent.end, recentRows: recentRows.length, backfillRows, backfillChunks, backfillComplete };
}

async function syncGa4(oldestDay: string): Promise<SeoProductionProviderSync> {
  const provider = "ga4" as const;
  const recent = recentRange(provider);
  const report = await fetchAnalyticsOrganicLandingMetrics(recent.start, recent.end);
  if (!report.readiness.ready) {
    return { provider, status: "skipped", recentRows: 0, backfillRows: 0, backfillChunks: 0, backfillComplete: false, reason: report.readiness.issues.join(" ") };
  }
  if (report.error) {
    await markProviderError(provider, report.error);
    return { provider, status: "error", recentStart: recent.start, recentEnd: recent.end, recentRows: 0, backfillRows: 0, backfillChunks: 0, backfillComplete: false, error: report.error };
  }

  const recentRows = normalizeGa4Rows(report.rows);
  await persistGa4Rows(recentRows);
  await markRecentSuccess(provider, recent.start, recent.end);

  let state = await readSyncState(provider);
  let cursor = state.cursor ?? shiftDate(recent.start, -1);
  let backfillRows = 0;
  let backfillChunks = 0;
  let backfillComplete = state.complete;

  if (!backfillComplete) {
    for (let index = 0; index < BACKFILL_CHUNKS_PER_RUN && cursor >= oldestDay; index += 1) {
      const start = [shiftDate(cursor, -(BACKFILL_CHUNK_DAYS - 1)), oldestDay].sort().reverse()[0];
      const historical = await fetchAnalyticsOrganicLandingMetrics(start, cursor);
      if (historical.error) {
        await markProviderError(provider, historical.error);
        return { provider, status: "error", recentStart: recent.start, recentEnd: recent.end, recentRows: recentRows.length, backfillRows, backfillChunks, backfillComplete: false, error: historical.error };
      }
      const normalized = normalizeGa4Rows(historical.rows);
      await persistGa4Rows(normalized);
      backfillRows += normalized.length;
      backfillChunks += 1;
      const next = shiftDate(start, -1);
      backfillComplete = next < oldestDay;
      cursor = next;
      await markBackfillProgress(provider, backfillComplete ? undefined : cursor, backfillComplete);
      if (backfillComplete) break;
    }
  }

  return { provider, status: "synced", recentStart: recent.start, recentEnd: recent.end, recentRows: recentRows.length, backfillRows, backfillChunks, backfillComplete };
}

export async function syncSeoProductionMetrics(): Promise<SeoProductionMetricsSync> {
  if (!productionDatabaseConfigured()) return { status: "skipped", providers: [] };

  const seo = await getSeoGlobalSettingsSnapshot();
  const canonicalOrigin = seo.settings.canonicalOrigin;
  const referenceDay = zonedDate(0, "Europe/Athens");
  const oldestDay = retentionStart(referenceDay);

  const providers = await Promise.all([
    syncGsc(canonicalOrigin, oldestDay),
    syncGa4(oldestDay)
  ]);

  await pruneOldMetrics(oldestDay);
  const errors = providers.filter((provider) => provider.status === "error").length;
  const synced = providers.filter((provider) => provider.status === "synced").length;
  const status: SeoProductionMetricsSync["status"] = errors === providers.length
    ? "error"
    : errors > 0
      ? "partial"
      : synced > 0
        ? "synced"
        : "skipped";
  return { status, retentionStart: oldestDay, providers };
}
