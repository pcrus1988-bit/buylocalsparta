import "server-only";

import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type VendorSeoVisibility = Readonly<{
  monthStart: string;
  googleImpressions: number;
  googleClicks: number;
  organicVisits: number;
  engagedVisits: number;
  latestSearchConsoleDay?: string;
  latestAnalyticsDay?: string;
}>;

type VisibilityRow = SqlRow & {
  month_start?: Date | string | null;
  google_impressions?: number | string | null;
  google_clicks?: number | string | null;
  organic_visits?: number | string | null;
  engaged_visits?: number | string | null;
  latest_gsc_day?: Date | string | null;
  latest_ga4_day?: Date | string | null;
};

function asCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
}

function dateOnly(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
}

export async function getVendorCurrentMonthSeoVisibility(vendorId: string): Promise<VendorSeoVisibility | undefined> {
  const normalizedId = vendorId.trim();
  if (!normalizedId || !productionDatabaseConfigured()) return undefined;

  const route = `/vendor/${encodeURIComponent(normalizedId)}`;
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });

  try {
    const result = await uow.withTransaction({ marketId: "sparta", platformAccess: true }, (tx) => tx.query<VisibilityRow>(`
      WITH calendar AS (
        SELECT date_trunc('month', timezone('Europe/Athens', now()))::date AS month_start
      ),
      gsc AS (
        SELECT COALESCE(sum(clicks),0)::bigint AS clicks,
               COALESCE(sum(impressions),0)::bigint AS impressions,
               max(day) AS latest_day
        FROM seo_gsc_daily_page_metrics, calendar
        WHERE market_id=nullif(current_setting('app.market_id',true),'')::uuid
          AND route=$1
          AND day >= calendar.month_start
      ),
      ga4 AS (
        SELECT COALESCE(sum(organic_sessions),0)::bigint AS organic_sessions,
               COALESCE(sum(engaged_sessions),0)::bigint AS engaged_sessions,
               max(day) AS latest_day
        FROM seo_ga4_daily_landing_metrics, calendar
        WHERE market_id=nullif(current_setting('app.market_id',true),'')::uuid
          AND route=$1
          AND day >= calendar.month_start
      )
      SELECT calendar.month_start,
             gsc.impressions AS google_impressions,
             gsc.clicks AS google_clicks,
             ga4.organic_sessions AS organic_visits,
             ga4.engaged_sessions AS engaged_visits,
             gsc.latest_day AS latest_gsc_day,
             ga4.latest_day AS latest_ga4_day
      FROM calendar CROSS JOIN gsc CROSS JOIN ga4
    `, [route]), { readOnly: true });

    const row = result.rows[0];
    const monthStart = dateOnly(row?.month_start);
    if (!row || !monthStart) return undefined;

    const visibility: VendorSeoVisibility = {
      monthStart,
      googleImpressions: asCount(row.google_impressions),
      googleClicks: asCount(row.google_clicks),
      organicVisits: asCount(row.organic_visits),
      engagedVisits: asCount(row.engaged_visits),
      latestSearchConsoleDay: dateOnly(row.latest_gsc_day),
      latestAnalyticsDay: dateOnly(row.latest_ga4_day)
    };

    return visibility.googleImpressions > 0 || visibility.organicVisits > 0 ? visibility : undefined;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
    if (code !== "42P01") {
      console.warn(JSON.stringify({ level: "warn", event: "seo.vendor_visibility_unavailable", vendorId: normalizedId, code: code || undefined }));
    }
    return undefined;
  }
}
