import { randomUUID } from "node:crypto";
import type { AnalyticsEvent, MarketAnalyticsReport, VendorAnalyticsReport } from "../analytics/types.ts";
import { PostgresUnitOfWork, type DatabaseScope, type SqlExecutor, type SqlPool, type SqlRow } from "./sql.ts";

async function resolveMarket(tx: SqlExecutor, value: string): Promise<string> {
  const result = await tx.query<SqlRow>(`SELECT id::text AS id FROM markets WHERE code=$1 OR id::text=$1 LIMIT 1`, [value]);
  if (result.rowCount !== 1) throw new Error("Market not found");
  return String(result.rows[0].id);
}

async function optionalPublicId(tx: SqlExecutor, table: string, value?: string): Promise<string | null> {
  if (!value) return null;
  if (!/^[a-z_]+$/.test(table)) throw new Error("Unsafe analytics relation");
  const result = await tx.query<SqlRow>(`SELECT id::text AS id FROM ${table} WHERE public_id=$1 OR id::text=$1 LIMIT 1`, [value]);
  return result.rowCount === 1 ? String(result.rows[0].id) : null;
}

/** Raw behavior events are platform-only; vendors receive only pre-aggregated vendor rollups. */
export class PostgresAnalyticsRepository {
  readonly #uow: PostgresUnitOfWork;
  constructor(pool: SqlPool) { this.#uow = new PostgresUnitOfWork(pool); }

  async appendEvent(input: { event: AnalyticsEvent; retentionUntil?: number }): Promise<void> {
    const event = input.event;
    await this.#uow.withTransaction({ marketId: event.marketId, platformAccess: true }, async (tx) => {
      const marketId = await resolveMarket(tx, event.marketId);
      const customerId = await optionalPublicId(tx, "users", event.customerId);
      const vendorId = await optionalPublicId(tx, "vendor_businesses", event.vendorId);
      const canonicalVariantId = await optionalPublicId(tx, "canonical_variants", event.canonicalVariantId);
      const orderId = await optionalPublicId(tx, "customer_orders", event.orderId);
      await tx.query(`INSERT INTO analytics_events
        (id,public_id,market_id,event_name,occurred_at,visitor_hash,customer_id,vendor_id,canonical_variant_id,order_id,search_event_public_id,value_minor,quantity,metadata,dedupe_key,retention_until)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16)
        ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`, [
        randomUUID(), event.id, marketId, event.eventName, new Date(event.occurredAt), event.visitorHash ?? null,
        customerId, vendorId, canonicalVariantId, orderId, event.searchEventId ?? null, event.valueMinor ?? null, event.quantity ?? null,
        JSON.stringify(event.metadata), event.dedupeKey ?? null, new Date(input.retentionUntil ?? event.occurredAt + 13 * 31 * 24 * 60 * 60 * 1000)
      ]);
    });
  }

  async purgeExpired(input: { scope: DatabaseScope; now: number }): Promise<number> {
    return this.#uow.withTransaction({ ...input.scope, platformAccess: true }, async (tx) => {
      const result = await tx.query<{ deleted: unknown }>(`WITH deleted AS (DELETE FROM analytics_events WHERE retention_until <= $1 RETURNING 1) SELECT count(*)::int AS deleted FROM deleted`, [new Date(input.now)]);
      return Number(result.rows[0]?.deleted ?? 0);
    });
  }

  async saveMarketRollup(input: { scope: DatabaseScope; day: string; report: MarketAnalyticsReport }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, marketId: input.report.marketId, platformAccess: true }, async (tx) => {
      const marketId = await resolveMarket(tx, input.report.marketId);
      await tx.query(`INSERT INTO analytics_market_daily (market_id,day,metrics,updated_at)
        VALUES ($1,$2::date,$3::jsonb,now())
        ON CONFLICT (market_id,day) DO UPDATE SET metrics=EXCLUDED.metrics,updated_at=EXCLUDED.updated_at`, [marketId, input.day, JSON.stringify(input.report)]);
    });
  }

  async saveVendorRollup(input: { scope: DatabaseScope; day: string; report: VendorAnalyticsReport }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, marketId: input.report.marketId, platformAccess: true }, async (tx) => {
      const marketId = await resolveMarket(tx, input.report.marketId);
      const vendorId = await optionalPublicId(tx, "vendor_businesses", input.report.vendorId);
      if (!vendorId) throw new Error("Vendor not found for analytics rollup");
      await tx.query(`INSERT INTO analytics_vendor_daily (market_id,vendor_id,day,metrics,updated_at)
        VALUES ($1,$2,$3::date,$4::jsonb,now())
        ON CONFLICT (market_id,vendor_id,day) DO UPDATE SET metrics=EXCLUDED.metrics,updated_at=EXCLUDED.updated_at`, [marketId, vendorId, input.day, JSON.stringify(input.report)]);
    });
  }

  async replaceSearchDemand(input: { scope: DatabaseScope; marketId: string; day: string; rows: MarketAnalyticsReport["topQueries"] }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, marketId: input.marketId, platformAccess: true }, async (tx) => {
      const marketId = await resolveMarket(tx, input.marketId);
      await tx.query(`DELETE FROM analytics_search_terms_daily WHERE market_id=$1 AND day=$2::date`, [marketId, input.day]);
      for (const row of input.rows) {
        await tx.query(`INSERT INTO analytics_search_terms_daily
          (market_id,day,query_text,normalized_query,searches,zero_results,clicks,result_count_total)
          VALUES ($1,$2::date,$3,$4,$5,$6,$7,$8)`, [marketId, input.day, row.query, row.normalizedQuery, row.searches, row.zeroResults, row.clicks, row.resultCountTotal]);
      }
    });
  }
}
