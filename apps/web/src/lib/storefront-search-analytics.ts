import { createHash, randomUUID } from "node:crypto";
import { PostgresUnitOfWork, sanitizeAnalyticsSearchQuery, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

function privacyVisitorHash(visitorKey: string): string {
  return createHash("sha256").update(`bls-analytics-v1|${visitorKey}`).digest("hex");
}

function stableDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

export async function recordStorefrontSearchAnalytics(input: Readonly<{
  visitorKey: string;
  query: string;
  resultCount: number;
  categoryCode?: string;
  filters?: Readonly<Record<string, string | number | boolean | undefined>>;
}>): Promise<void> {
  if (!productionDatabaseConfigured() || !input.query.trim()) return;
  if (!Number.isSafeInteger(input.resultCount) || input.resultCount < 0) return;

  try {
    const safe = sanitizeAnalyticsSearchQuery(input.query);
    if (!safe.normalizedQuery) return;
    const visitorHash = privacyVisitorHash(input.visitorKey);
    const now = Date.now();
    const metadata = {
      query: safe.query,
      normalizedQuery: safe.normalizedQuery,
      resultCount: input.resultCount,
      categoryCode: input.categoryCode ?? "",
      filters: { ...(input.filters ?? {}), categoryCode: input.categoryCode ?? "" }
    };
    const dedupeKey = `shop-search:${visitorHash}:${stableDigest(metadata)}:${Math.floor(now / 10_000)}`;
    const runtime = getProductionPostgresRuntime();
    const uow = new PostgresUnitOfWork(runtime.sqlPool);

    await uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
      const inserted = await tx.query<SqlRow>(`
        INSERT INTO analytics_events (
          id,public_id,market_id,event_name,occurred_at,visitor_hash,metadata,dedupe_key,retention_until
        ) VALUES (
          $1,$2,(SELECT id FROM markets WHERE code='sparta'),'search.performed',now(),$3,$4::jsonb,$5,now()+interval '13 months'
        )
        ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
        RETURNING public_id
      `, [randomUUID(), `an_${randomUUID()}`, visitorHash, JSON.stringify(metadata), dedupeKey]);

      if (!inserted.rowCount) return;
      await tx.query(`
        INSERT INTO analytics_search_terms_daily (
          market_id,day,query_text,normalized_query,searches,zero_results,clicks,result_count_total
        ) VALUES (
          (SELECT id FROM markets WHERE code='sparta'),
          (now() AT TIME ZONE 'Europe/Athens')::date,
          $1,$2,1,$3,0,$4
        )
        ON CONFLICT (market_id,day,normalized_query) DO UPDATE SET
          query_text=EXCLUDED.query_text,
          searches=analytics_search_terms_daily.searches+1,
          zero_results=analytics_search_terms_daily.zero_results+EXCLUDED.zero_results,
          result_count_total=analytics_search_terms_daily.result_count_total+EXCLUDED.result_count_total
      `, [safe.query, safe.normalizedQuery, input.resultCount === 0 ? 1 : 0, input.resultCount]);
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.search_analytics_capture_failed",
      message: error instanceof Error ? error.message : String(error)
    }));
  }
}
