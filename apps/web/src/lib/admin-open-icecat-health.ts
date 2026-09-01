import {
  OPEN_ICECAT_DETAIL_PROCESSING_VERSION,
  PostgresUnitOfWork,
  type SessionPrincipal,
  type SqlRow
} from "@buy-local-sparta/core";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type OpenIcecatAdminHealth =
  | Readonly<{
      state: "not_configured" | "unavailable";
    }>
  | Readonly<{
      state: "available";
      processingVersion: string;
      activeIndexProducts: number;
      queueableProducts: number;
      missingGtin: number;
      missingGtinPct: number;
      detailProcessed: number;
      detailCoveragePct: number;
      readyCoveragePct: number;
      actionableBacklog: number;
      completedLastHour: number;
      oldestActionableAgeSeconds: number | null;
      queue: Readonly<{
        pending: number;
        processing: number;
        retry: number;
        ready: number;
        needsEnrichment: number;
        failed: number;
        skipped: number;
      }>;
    }>;

function integer(row: SqlRow, field: string): number {
  const value = Number(row[field] ?? 0);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Database field ${field} is not a non-negative safe integer`);
  }
  return value;
}

function nullableInteger(row: SqlRow, field: string): number | null {
  if (row[field] === null || row[field] === undefined) return null;
  return integer(row, field);
}

function percentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

function buildOpenIcecatHealth(row: SqlRow): OpenIcecatAdminHealth {
  const activeIndexProducts = integer(row, "active_products");
  const missingGtin = integer(row, "without_gtin");
  const queueableProducts = Math.max(0, activeIndexProducts - missingGtin);
  const pending = integer(row, "pending");
  const processing = integer(row, "processing");
  const retry = integer(row, "retry");
  const ready = integer(row, "ready");
  const needsEnrichment = integer(row, "needs_enrichment");
  const failed = integer(row, "failed");
  const skipped = integer(row, "skipped");
  const detailProcessed = ready + needsEnrichment;

  return {
    state: "available",
    processingVersion: OPEN_ICECAT_DETAIL_PROCESSING_VERSION,
    activeIndexProducts,
    queueableProducts,
    missingGtin,
    missingGtinPct: percentage(missingGtin, activeIndexProducts),
    detailProcessed,
    detailCoveragePct: percentage(detailProcessed, queueableProducts),
    readyCoveragePct: percentage(ready, queueableProducts),
    actionableBacklog: pending + processing + retry,
    completedLastHour: integer(row, "completed_last_hour"),
    oldestActionableAgeSeconds: nullableInteger(row, "oldest_actionable_age_seconds"),
    queue: {
      pending,
      processing,
      retry,
      ready,
      needsEnrichment,
      failed,
      skipped
    }
  };
}

async function postgresOpenIcecatHealth(): Promise<OpenIcecatAdminHealth> {
  const runtime = getProductionPostgresRuntime();
  const sourceUow = new PostgresUnitOfWork(runtime.sqlPool);
  let sourceId: string;

  try {
    const source = await sourceUow.withTransaction({ platformAccess: true }, async (tx) => {
      const result = await tx.query<SqlRow>(
        `SELECT s.id::text AS source_id
         FROM public.catalog_sources s
         JOIN public.markets m ON m.id=s.market_id
         WHERE s.code='open_icecat' AND s.active=true AND m.code='sparta'
         LIMIT 1`
      );
      return result.rows[0]?.source_id;
    }, { readOnly: true, statementTimeoutMs: 5_000 });
    if (typeof source !== "string" || !source) return { state: "not_configured" };
    sourceId = source;
  } catch {
    return { state: "unavailable" };
  }

  try {
    const statsUow = new PostgresUnitOfWork(runtime.sqlPool);
    return await statsUow.withTransaction({ platformAccess: true }, async (tx) => {
      const result = await tx.query<SqlRow>(
        `WITH index_stats AS (
           SELECT count(*) FILTER (WHERE record_state='active')::bigint AS active_products,
                  count(*) FILTER (WHERE record_state='active' AND cardinality(gtins)=0)::bigint AS without_gtin
           FROM public.open_icecat_index_products
           WHERE source_id=$1::uuid
         ), job_stats AS (
           SELECT count(*) FILTER (WHERE status='pending')::bigint AS pending,
                  count(*) FILTER (WHERE status='processing')::bigint AS processing,
                  count(*) FILTER (WHERE status='retry')::bigint AS retry,
                  count(*) FILTER (WHERE status='ready')::bigint AS ready,
                  count(*) FILTER (WHERE status='needs_enrichment')::bigint AS needs_enrichment,
                  count(*) FILTER (WHERE status='failed')::bigint AS failed,
                  count(*) FILTER (WHERE status='skipped')::bigint AS skipped,
                  count(*) FILTER (
                    WHERE status IN ('ready','needs_enrichment')
                      AND completed_at >= now() - interval '1 hour'
                  )::bigint AS completed_last_hour,
                  extract(epoch FROM (now() - min(updated_at) FILTER (
                    WHERE status IN ('pending','processing','retry')
                  )))::bigint AS oldest_actionable_age_seconds
           FROM public.open_icecat_detail_enrichment_jobs
           WHERE source_id=$1::uuid
             AND processing_version=$2
         )
         SELECT * FROM index_stats CROSS JOIN job_stats`,
        [sourceId, OPEN_ICECAT_DETAIL_PROCESSING_VERSION]
      );
      const row = result.rows[0];
      if (!row) return { state: "unavailable" } as const;
      return buildOpenIcecatHealth(row);
    }, { readOnly: true, statementTimeoutMs: 8_000 });
  } catch {
    return { state: "unavailable" };
  }
}

export async function adminOpenIcecatHealth(principal: SessionPrincipal): Promise<OpenIcecatAdminHealth> {
  assertAdminPermission(principal, "catalog.read");
  if (!postgresAdminRuntimeEnabled()) return { state: "not_configured" };
  return postgresOpenIcecatHealth();
}
