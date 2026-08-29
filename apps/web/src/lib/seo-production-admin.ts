import "server-only";

import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { getSeoGlobalSettingsSnapshot } from "./seo-settings";

type ProviderRow = SqlRow & {
  provider: string;
  last_recent_start?: Date | string | null;
  last_recent_end?: Date | string | null;
  backfill_complete_at?: Date | string | null;
  last_success_at?: Date | string | null;
  last_error?: string | null;
};

type GscRow = SqlRow & {
  day?: Date | string | null;
  routes: number | string;
  clicks: number | string;
  impressions: number | string;
};

type Ga4Row = SqlRow & {
  day?: Date | string | null;
  routes: number | string;
  organic_sessions: number | string;
  engaged_sessions: number | string;
  key_events: number | string;
  ecommerce_purchases: number | string;
};

function marketCode(): string {
  return process.env.DEFAULT_MARKET?.trim() || "sparta";
}

function text(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  return String(value);
}

function day(value: unknown): string | undefined {
  const valueText = text(value);
  return valueText ? valueText.slice(0, 10) : undefined;
}

function iso(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

export type SeoProductionSignals = Readonly<{
  persistenceAvailable: boolean;
  providers: ReadonlyArray<Readonly<{
    provider: string;
    recentStart?: string;
    recentEnd?: string;
    lastSuccessAt?: string;
    backfillComplete: boolean;
    error?: string;
  }>>;
  gsc: Readonly<{ latestDay?: string; routes: number; clicks: number; impressions: number }>;
  ga4: Readonly<{ latestDay?: string; routes: number; organicSessions: number; engagedSessions: number; keyEvents: number; ecommercePurchases: number }>;
  merchant: Readonly<{ url: string; status: "healthy" | "empty" | "error"; httpStatus?: number; itemCount?: number; error?: string }>;
}>;

async function databaseSignals(): Promise<Omit<SeoProductionSignals, "merchant">> {
  if (!productionDatabaseConfigured()) {
    return {
      persistenceAvailable: false,
      providers: [],
      gsc: { routes: 0, clicks: 0, impressions: 0 },
      ga4: { routes: 0, organicSessions: 0, engagedSessions: 0, keyEvents: 0, ecommercePurchases: 0 }
    };
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction({ marketId: marketCode(), platformAccess: true }, async (tx) => {
    const [providersResult, gscResult, ga4Result] = await Promise.all([
      tx.query<ProviderRow>(`
        SELECT provider,last_recent_start,last_recent_end,backfill_complete_at,last_success_at,last_error
        FROM seo_production_metrics_sync_state
        WHERE market_id=nullif(current_setting('app.market_id',true),'')::uuid
        ORDER BY provider
      `),
      tx.query<GscRow>(`
        WITH latest AS (
          SELECT max(day) AS day FROM seo_gsc_daily_page_metrics
          WHERE market_id=nullif(current_setting('app.market_id',true),'')::uuid
        )
        SELECT latest.day,count(m.route)::int AS routes,coalesce(sum(m.clicks),0)::bigint AS clicks,coalesce(sum(m.impressions),0)::bigint AS impressions
        FROM latest LEFT JOIN seo_gsc_daily_page_metrics m
          ON m.market_id=nullif(current_setting('app.market_id',true),'')::uuid AND m.day=latest.day
        GROUP BY latest.day
      `),
      tx.query<Ga4Row>(`
        WITH latest AS (
          SELECT max(day) AS day FROM seo_ga4_daily_landing_metrics
          WHERE market_id=nullif(current_setting('app.market_id',true),'')::uuid
        )
        SELECT latest.day,count(m.route)::int AS routes,coalesce(sum(m.organic_sessions),0)::bigint AS organic_sessions,
          coalesce(sum(m.engaged_sessions),0)::bigint AS engaged_sessions,coalesce(sum(m.key_events),0)::numeric AS key_events,
          coalesce(sum(m.ecommerce_purchases),0)::numeric AS ecommerce_purchases
        FROM latest LEFT JOIN seo_ga4_daily_landing_metrics m
          ON m.market_id=nullif(current_setting('app.market_id',true),'')::uuid AND m.day=latest.day
        GROUP BY latest.day
      `)
    ]);

    const gsc = gscResult.rows[0];
    const ga4 = ga4Result.rows[0];
    return {
      persistenceAvailable: true,
      providers: providersResult.rows.map((row) => ({
        provider: row.provider,
        recentStart: day(row.last_recent_start),
        recentEnd: day(row.last_recent_end),
        lastSuccessAt: iso(row.last_success_at),
        backfillComplete: Boolean(row.backfill_complete_at),
        error: text(row.last_error)
      })),
      gsc: { latestDay: day(gsc?.day), routes: count(gsc?.routes), clicks: count(gsc?.clicks), impressions: count(gsc?.impressions) },
      ga4: {
        latestDay: day(ga4?.day), routes: count(ga4?.routes), organicSessions: count(ga4?.organic_sessions),
        engagedSessions: count(ga4?.engaged_sessions), keyEvents: count(ga4?.key_events), ecommercePurchases: count(ga4?.ecommerce_purchases)
      }
    };
  });
}

async function merchantSignals(): Promise<SeoProductionSignals["merchant"]> {
  const { settings } = await getSeoGlobalSettingsSnapshot();
  const url = new URL("/merchant-center/products.xml", `${settings.canonicalOrigin.replace(/\/$/, "")}/`).toString();
  try {
    const response = await fetch(url, { cache: "no-store", headers: { "user-agent": "KONTA-MOU-Admin-SEO/1.0" } });
    const parsedCount = Number(response.headers.get("x-kontamou-merchant-items"));
    const itemCount = Number.isFinite(parsedCount) && parsedCount >= 0 ? Math.round(parsedCount) : undefined;
    return { url, status: !response.ok ? "error" : itemCount === 0 ? "empty" : "healthy", httpStatus: response.status, itemCount };
  } catch (error) {
    return { url, status: "error", error: error instanceof Error ? error.message : "Merchant Center feed check failed" };
  }
}

export async function getSeoProductionSignals(principal: SessionPrincipal): Promise<SeoProductionSignals> {
  assertAdminPermission(principal, "content.read");
  const [database, merchant] = await Promise.all([
    databaseSignals().catch(() => ({
      persistenceAvailable: false,
      providers: [],
      gsc: { routes: 0, clicks: 0, impressions: 0 },
      ga4: { routes: 0, organicSessions: 0, engagedSessions: 0, keyEvents: 0, ecommercePurchases: 0 }
    })),
    merchantSignals()
  ]);
  return { ...database, merchant };
}
