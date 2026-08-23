import "server-only";

import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, sanitizeAnalyticsSearchQuery, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { getSearchConsoleBreakdown, getSearchConsoleOverview, inspectSearchConsoleUrl, type SearchConsolePerformanceRow, type SearchConsoleUrlInspection } from "./seo-search-console";
import { getSeoGlobalSettingsSnapshot } from "./seo-settings";

const SYNC_HISTORY_LIMIT = 20;
const METRIC_ROW_LIMIT = 250;
const QUERY_MIN_IMPRESSIONS = 5;
const INSPECTION_HISTORY_LIMIT = 20;

export type SeoGscSyncSummary = Readonly<{
  id: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  pageRowCount: number;
  queryRowCount: number;
  capturedAt: string;
  actorId?: string;
}>;

export type SeoGscMetricRow = Readonly<{
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}>;

export type SeoGscHistoryWorkspace = Readonly<{
  persistenceAvailable: boolean;
  runs: readonly SeoGscSyncSummary[];
  latest?: SeoGscSyncSummary;
  previous?: SeoGscSyncSummary;
  pages: readonly SeoGscMetricRow[];
  queries: readonly SeoGscMetricRow[];
}>;

export type SeoGscInspectionEvidence = Readonly<{
  id: string;
  inspectionUrl: string;
  route?: string;
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
  capturedAt: string;
  actorId?: string;
}>;

export type SeoGscRouteEvidence = Readonly<{
  persistenceAvailable: boolean;
  latestPageMetric?: SeoGscMetricRow & Readonly<{ startDate: string; endDate: string; capturedAt: string }>;
  inspections: readonly SeoGscInspectionEvidence[];
}>;

type SyncRow = SqlRow & {
  id: string;
  public_id: string;
  site_url: string;
  start_date: Date | string;
  end_date: Date | string;
  clicks: number | string;
  impressions: number | string;
  ctr: number | string;
  position: number | string;
  page_row_count: number | string;
  query_row_count: number | string;
  captured_at: Date | string;
  actor_public_id?: string | null;
};

type MetricRow = SqlRow & {
  key: string;
  clicks: number | string;
  impressions: number | string;
  ctr: number | string;
  position: number | string;
};

type RouteMetricRow = MetricRow & {
  start_date: Date | string;
  end_date: Date | string;
  captured_at: Date | string;
};

type InspectionRow = SqlRow & {
  public_id: string;
  inspection_url: string;
  route?: string | null;
  verdict?: string | null;
  coverage_state?: string | null;
  robots_txt_state?: string | null;
  indexing_state?: string | null;
  last_crawl_time?: Date | string | null;
  page_fetch_state?: string | null;
  crawled_as?: string | null;
  google_canonical?: string | null;
  user_canonical?: string | null;
  sitemaps: unknown;
  captured_at: Date | string;
  actor_public_id?: string | null;
};

type Accumulator = {
  key: string;
  clicks: number;
  impressions: number;
  weightedPosition: number;
};

function marketCode(): string {
  return process.env.DEFAULT_MARKET?.trim() || "sparta";
}

function publicId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asCount(value: unknown): number {
  return Math.max(0, Math.round(asNumber(value)));
}

function iso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function dateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeRoute(pathname: string): string {
  const value = pathname || "/";
  if (value === "/") return value;
  return value.replace(/\/+$/, "") || "/";
}

function routeForCanonicalUrl(value: string, canonicalOrigin: string): string | undefined {
  try {
    const candidate = new URL(value);
    const origin = new URL(canonicalOrigin).origin;
    if (candidate.origin !== origin) return undefined;
    return normalizeRoute(candidate.pathname);
  } catch {
    return undefined;
  }
}

function aggregateRows(rows: readonly SearchConsolePerformanceRow[], keyFor: (row: SearchConsolePerformanceRow) => string | undefined): SeoGscMetricRow[] {
  const byKey = new Map<string, Accumulator>();
  for (const row of rows) {
    const key = keyFor(row)?.trim();
    if (!key) continue;
    const impressions = asCount(row.impressions);
    const clicks = asCount(row.clicks);
    const current = byKey.get(key) ?? { key, clicks: 0, impressions: 0, weightedPosition: 0 };
    current.clicks += clicks;
    current.impressions += impressions;
    current.weightedPosition += Math.max(0, asNumber(row.position)) * impressions;
    byKey.set(key, current);
  }
  return [...byKey.values()].map((row) => ({
    key: row.key,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.impressions ? Math.min(1, row.clicks / row.impressions) : 0,
    position: row.impressions ? row.weightedPosition / row.impressions : 0
  })).sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks || a.key.localeCompare(b.key, "el"));
}

function privacySafeQueryRows(rows: readonly SearchConsolePerformanceRow[]): SeoGscMetricRow[] {
  return aggregateRows(rows, (row) => {
    if (asCount(row.impressions) < QUERY_MIN_IMPRESSIONS) return undefined;
    const sanitized = sanitizeAnalyticsSearchQuery(row.key).query.replace(/\s+/g, " ").trim().slice(0, 300);
    return sanitized || undefined;
  }).filter((row) => row.impressions >= QUERY_MIN_IMPRESSIONS).slice(0, METRIC_ROW_LIMIT);
}

function pageRows(rows: readonly SearchConsolePerformanceRow[], canonicalOrigin: string): SeoGscMetricRow[] {
  return aggregateRows(rows, (row) => routeForCanonicalUrl(row.key, canonicalOrigin)).slice(0, METRIC_ROW_LIMIT);
}

function syncSummary(row: SyncRow): SeoGscSyncSummary {
  return {
    id: row.public_id,
    siteUrl: row.site_url,
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    clicks: asCount(row.clicks),
    impressions: asCount(row.impressions),
    ctr: asNumber(row.ctr),
    position: asNumber(row.position),
    pageRowCount: asCount(row.page_row_count),
    queryRowCount: asCount(row.query_row_count),
    capturedAt: iso(row.captured_at),
    actorId: optionalText(row.actor_public_id)
  };
}

function metricSummary(row: MetricRow): SeoGscMetricRow {
  return { key: row.key, clicks: asCount(row.clicks), impressions: asCount(row.impressions), ctr: asNumber(row.ctr), position: asNumber(row.position) };
}

function inspectionSummary(row: InspectionRow): SeoGscInspectionEvidence {
  return {
    id: row.public_id,
    inspectionUrl: row.inspection_url,
    route: optionalText(row.route),
    verdict: optionalText(row.verdict),
    coverageState: optionalText(row.coverage_state),
    robotsTxtState: optionalText(row.robots_txt_state),
    indexingState: optionalText(row.indexing_state),
    lastCrawlTime: row.last_crawl_time ? iso(row.last_crawl_time) : undefined,
    pageFetchState: optionalText(row.page_fetch_state),
    crawledAs: optionalText(row.crawled_as),
    googleCanonical: optionalText(row.google_canonical),
    userCanonical: optionalText(row.user_canonical),
    sitemaps: Array.isArray(row.sitemaps) ? row.sitemaps.filter((item): item is string => typeof item === "string").slice(0, 25) : [],
    capturedAt: iso(row.captured_at),
    actorId: optionalText(row.actor_public_id)
  };
}

export async function syncSearchConsoleHistory(principal: SessionPrincipal) {
  assertAdminPermission(principal, "content.write");
  if (!productionDatabaseConfigured()) throw new Error("Search Console history requires PostgreSQL runtime.");

  const [overview, breakdown, seo] = await Promise.all([
    getSearchConsoleOverview(),
    getSearchConsoleBreakdown(METRIC_ROW_LIMIT),
    getSeoGlobalSettingsSnapshot()
  ]);
  if (!overview.readiness.ready || !overview.readiness.siteUrl) throw new Error("Search Console integration is not ready.");
  if (overview.error) throw new Error(overview.error);
  if (breakdown.error) throw new Error(breakdown.error);
  if (!overview.performance) throw new Error("Search Console did not return an aggregate performance row.");

  const performance = overview.performance;
  const pages = pageRows(breakdown.pages, seo.settings.canonicalOrigin);
  const queries = privacySafeQueryRows(breakdown.queries);
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 20_000, lockTimeoutMs: 3_000 });
  const runPublicId = publicId("gsc_sync");

  await uow.withTransaction({ actorUserId: principal.userId, marketId: marketCode(), platformAccess: true, requestId: runPublicId }, async (tx) => {
    const run = await tx.query<{ id: string }>(`
      INSERT INTO seo_gsc_sync_runs(
        public_id,market_id,actor_user_id,site_url,start_date,end_date,clicks,impressions,ctr,position,
        page_row_count,query_row_count,captured_at
      ) VALUES(
        $1,nullif(current_setting('app.market_id',true),'')::uuid,
        nullif(current_setting('app.actor_user_id',true),'')::uuid,
        $2,$3::date,$4::date,$5,$6,$7,$8,$9,$10,$11
      ) RETURNING id::text AS id
    `, [
      runPublicId, overview.readiness.siteUrl, performance.startDate, performance.endDate,
      asCount(performance.clicks), asCount(performance.impressions), Math.max(0, Math.min(1, asNumber(performance.ctr))),
      Math.max(0, asNumber(performance.position)), pages.length, queries.length, new Date()
    ]);
    const runId = String(run.rows[0]?.id ?? "");
    if (!runId) throw new Error("Unable to persist Search Console sync.");

    for (const row of pages) {
      const url = new URL(row.key, `${seo.settings.canonicalOrigin}/`).toString();
      await tx.query(`
        INSERT INTO seo_gsc_page_metrics(public_id,sync_run_id,route,url,clicks,impressions,ctr,position)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      `, [publicId("gsc_page"), runId, row.key, url, row.clicks, row.impressions, row.ctr, row.position]);
    }
    for (const row of queries) {
      await tx.query(`
        INSERT INTO seo_gsc_query_metrics(public_id,sync_run_id,query_text,clicks,impressions,ctr,position)
        VALUES($1,$2,$3,$4,$5,$6,$7)
      `, [publicId("gsc_query"), runId, row.key, row.clicks, row.impressions, row.ctr, row.position]);
    }
  });

  await recordAdminAudit(principal, "seo.search_console.sync", "seo_gsc_sync_run", runPublicId, "Persist Search Console aggregate performance", {
    startDate: performance.startDate,
    endDate: performance.endDate,
    pageRows: pages.length,
    queryRows: queries.length
  });
  return { id: runPublicId, startDate: performance.startDate, endDate: performance.endDate, pageRows: pages.length, queryRows: queries.length } as const;
}

export async function inspectAndPersistSearchConsoleUrl(principal: SessionPrincipal, inspectionUrl: string) {
  assertAdminPermission(principal, "content.write");
  const [inspection, seo] = await Promise.all([inspectSearchConsoleUrl(inspectionUrl), getSeoGlobalSettingsSnapshot()]);
  if (!productionDatabaseConfigured()) return { inspection, persistenceAvailable: false, saved: false } as const;

  const route = routeForCanonicalUrl(inspection.inspectionUrl, seo.settings.canonicalOrigin);
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
  const evidenceId = publicId("gsc_inspection");
  const sitemaps = inspection.sitemaps.filter((item) => typeof item === "string" && item.length <= 1_000).slice(0, 25);

  await uow.withTransaction({ actorUserId: principal.userId, marketId: marketCode(), platformAccess: true, requestId: evidenceId }, async (tx) => {
    await tx.query(`
      INSERT INTO seo_gsc_url_inspections(
        public_id,market_id,actor_user_id,inspection_url,route,verdict,coverage_state,robots_txt_state,
        indexing_state,last_crawl_time,page_fetch_state,crawled_as,google_canonical,user_canonical,sitemaps,captured_at
      ) VALUES(
        $1,nullif(current_setting('app.market_id',true),'')::uuid,
        nullif(current_setting('app.actor_user_id',true),'')::uuid,
        $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14
      )
    `, [
      evidenceId, inspection.inspectionUrl, route ?? null, inspection.verdict ?? null, inspection.coverageState ?? null,
      inspection.robotsTxtState ?? null, inspection.indexingState ?? null, inspection.lastCrawlTime ? new Date(inspection.lastCrawlTime) : null,
      inspection.pageFetchState ?? null, inspection.crawledAs ?? null, inspection.googleCanonical ?? null,
      inspection.userCanonical ?? null, JSON.stringify(sitemaps), new Date()
    ]);
  });

  await recordAdminAudit(principal, "seo.search_console.url_inspection", "seo_gsc_url_inspection", evidenceId, "Persist operator-triggered Google URL Inspection evidence", {
    route: route ?? "outside_canonical_origin",
    verdict: inspection.verdict ?? "unknown"
  });
  return { inspection, persistenceAvailable: true, saved: true, evidenceId } as const;
}

export async function getSearchConsoleHistoryWorkspace(principal: SessionPrincipal): Promise<SeoGscHistoryWorkspace> {
  assertAdminPermission(principal, "content.read");
  if (!productionDatabaseConfigured()) return { persistenceAvailable: false, runs: [], pages: [], queries: [] };
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });

  return uow.withTransaction({ actorUserId: principal.userId, marketId: marketCode(), platformAccess: true }, async (tx) => {
    const runsResult = await tx.query<SyncRow>(`
      SELECT r.id::text AS id,r.public_id,r.site_url,r.start_date,r.end_date,r.clicks,r.impressions,r.ctr,r.position,
             r.page_row_count,r.query_row_count,r.captured_at,u.public_id AS actor_public_id
      FROM seo_gsc_sync_runs r
      LEFT JOIN users u ON u.id=r.actor_user_id
      WHERE r.market_id=nullif(current_setting('app.market_id',true),'')::uuid
      ORDER BY r.captured_at DESC
      LIMIT $1
    `, [SYNC_HISTORY_LIMIT]);
    const runs = runsResult.rows.map(syncSummary);
    const latestInternalId = String(runsResult.rows[0]?.id ?? "");
    if (!latestInternalId) return { persistenceAvailable: true, runs, pages: [], queries: [] };

    const [pagesResult, queriesResult] = await Promise.all([
      tx.query<MetricRow>(`
        SELECT route AS key,clicks,impressions,ctr,position
        FROM seo_gsc_page_metrics
        WHERE sync_run_id=$1::uuid
        ORDER BY impressions DESC,clicks DESC,route ASC
        LIMIT $2
      `, [latestInternalId, METRIC_ROW_LIMIT]),
      tx.query<MetricRow>(`
        SELECT query_text AS key,clicks,impressions,ctr,position
        FROM seo_gsc_query_metrics
        WHERE sync_run_id=$1::uuid
        ORDER BY impressions DESC,clicks DESC,query_text ASC
        LIMIT $2
      `, [latestInternalId, METRIC_ROW_LIMIT])
    ]);
    return { persistenceAvailable: true, runs, latest: runs[0], previous: runs[1], pages: pagesResult.rows.map(metricSummary), queries: queriesResult.rows.map(metricSummary) };
  });
}

export async function getSearchConsoleRouteEvidence(principal: SessionPrincipal, route: string): Promise<SeoGscRouteEvidence> {
  assertAdminPermission(principal, "content.read");
  if (!productionDatabaseConfigured()) return { persistenceAvailable: false, inspections: [] };
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });

  return uow.withTransaction({ actorUserId: principal.userId, marketId: marketCode(), platformAccess: true }, async (tx) => {
    const [metricResult, inspectionResult] = await Promise.all([
      tx.query<RouteMetricRow>(`
        SELECT m.route AS key,m.clicks,m.impressions,m.ctr,m.position,r.start_date,r.end_date,r.captured_at
        FROM seo_gsc_page_metrics m
        JOIN seo_gsc_sync_runs r ON r.id=m.sync_run_id
        WHERE r.market_id=nullif(current_setting('app.market_id',true),'')::uuid AND m.route=$1
        ORDER BY r.captured_at DESC
        LIMIT 1
      `, [route]),
      tx.query<InspectionRow>(`
        SELECT i.public_id,i.inspection_url,i.route,i.verdict,i.coverage_state,i.robots_txt_state,i.indexing_state,
               i.last_crawl_time,i.page_fetch_state,i.crawled_as,i.google_canonical,i.user_canonical,i.sitemaps,
               i.captured_at,u.public_id AS actor_public_id
        FROM seo_gsc_url_inspections i
        LEFT JOIN users u ON u.id=i.actor_user_id
        WHERE i.market_id=nullif(current_setting('app.market_id',true),'')::uuid AND i.route=$1
        ORDER BY i.captured_at DESC
        LIMIT $2
      `, [route, INSPECTION_HISTORY_LIMIT])
    ]);
    const metric = metricResult.rows[0];
    return {
      persistenceAvailable: true,
      latestPageMetric: metric ? { ...metricSummary(metric), startDate: dateOnly(metric.start_date), endDate: dateOnly(metric.end_date), capturedAt: iso(metric.captured_at) } : undefined,
      inspections: inspectionResult.rows.map(inspectionSummary)
    };
  });
}
