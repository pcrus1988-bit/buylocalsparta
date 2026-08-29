import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DATA_AGE_DAYS = 14;

export type PublicVendorSearchVisibility = Readonly<{
  startDate: string;
  endDate: string;
  impressions: number;
  clicks: number;
  organicSessions: number;
}>;

type VisibilityRow = SqlRow & {
  start_day?: string | null;
  end_day?: string | null;
  impressions?: string | number | null;
  clicks?: string | number | null;
  organic_sessions?: string | number | null;
};

/**
 * Returns month-to-date public search visibility for an indexed vendor page.
 *
 * Search Console is the reporting clock because it is the source of the public
 * Google-impression claim and naturally has a small reporting delay. GA4 is
 * aggregated over the exact same date window so the numbers remain directly
 * comparable even when Analytics has data available one day earlier or later.
 */
export async function getPublicVendorSearchVisibility(
  publicVendorId: string,
  now = Date.now()
): Promise<PublicVendorSearchVisibility | undefined> {
  const vendorId = publicVendorId.trim();
  if (!productionDatabaseConfigured() || !/^vendor_[A-Za-z0-9_-]{3,160}$/.test(vendorId)) return undefined;

  const route = `/vendor/${vendorId}`;
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 5_000, lockTimeoutMs: 2_000 });

  try {
    const result = await uow.withTransaction(
      { marketId: "sparta", platformAccess: true },
      (tx) => tx.query<VisibilityRow>(`
        WITH market AS (
          SELECT id FROM markets WHERE code='sparta' LIMIT 1
        ), latest AS (
          SELECT max(day) AS end_day
          FROM seo_gsc_daily_page_metrics
          WHERE market_id=(SELECT id FROM market)
        ), period AS (
          SELECT
            date_trunc('month', latest.end_day)::date AS start_day,
            latest.end_day AS end_day
          FROM latest
          WHERE latest.end_day IS NOT NULL
        )
        SELECT
          period.start_day::text AS start_day,
          period.end_day::text AS end_day,
          COALESCE((
            SELECT sum(metrics.impressions)
            FROM seo_gsc_daily_page_metrics metrics
            WHERE metrics.market_id=(SELECT id FROM market)
              AND metrics.route=$1
              AND metrics.day BETWEEN period.start_day AND period.end_day
          ),0)::bigint AS impressions,
          COALESCE((
            SELECT sum(metrics.clicks)
            FROM seo_gsc_daily_page_metrics metrics
            WHERE metrics.market_id=(SELECT id FROM market)
              AND metrics.route=$1
              AND metrics.day BETWEEN period.start_day AND period.end_day
          ),0)::bigint AS clicks,
          COALESCE((
            SELECT sum(metrics.organic_sessions)
            FROM seo_ga4_daily_landing_metrics metrics
            WHERE metrics.market_id=(SELECT id FROM market)
              AND metrics.route=$1
              AND metrics.day BETWEEN period.start_day AND period.end_day
          ),0)::bigint AS organic_sessions
        FROM period
      `, [route]),
      { readOnly: true }
    );

    if (!result.rowCount) return undefined;
    const row = result.rows[0];
    const startDate = optionalDateText(row.start_day);
    const endDate = optionalDateText(row.end_day);
    const impressions = nonNegativeSafeInteger(row.impressions);
    const clicks = nonNegativeSafeInteger(row.clicks);
    const organicSessions = nonNegativeSafeInteger(row.organic_sessions);
    if (!startDate || !endDate || !impressions) return undefined;

    const latestAt = Date.parse(`${endDate}T00:00:00Z`);
    if (!Number.isFinite(latestAt) || now - latestAt > MAX_DATA_AGE_DAYS * DAY_MS) return undefined;

    return { startDate, endDate, impressions, clicks, organicSessions };
  } catch (error) {
    console.warn(JSON.stringify({
      level: "warn",
      event: "seo.public_vendor_visibility_unavailable",
      vendorId,
      errorName: error instanceof Error ? error.name : "UnknownError"
    }));
    return undefined;
  }
}

function optionalDateText(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function nonNegativeSafeInteger(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}
