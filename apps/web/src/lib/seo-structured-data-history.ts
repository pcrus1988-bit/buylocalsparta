import "server-only";

import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import type { SeoCrawlPersistenceResult } from "./seo-crawl-history";
import type { SeoLiveCrawlReport } from "./seo-live-crawl";

export type SeoStructuredDataPersistenceResult = Readonly<{
  available: boolean;
  saved: boolean;
  observations: number;
  error?: string;
}>;

function marketCode(): string {
  return process.env.DEFAULT_MARKET?.trim() || "sparta";
}

function publicId(): string {
  return `seo_schema_${randomUUID().replaceAll("-", "")}`;
}

export async function persistSeoStructuredDataEvidence(
  principal: SessionPrincipal,
  report: SeoLiveCrawlReport,
  crawlPersistence: SeoCrawlPersistenceResult
): Promise<SeoStructuredDataPersistenceResult> {
  assertAdminPermission(principal, "content.write");
  if (!productionDatabaseConfigured() || !crawlPersistence.available) return { available: false, saved: false, observations: 0 };
  if (!crawlPersistence.saved || !crawlPersistence.runId) return { available: true, saved: false, observations: 0, error: crawlPersistence.error ?? "Crawl evidence was not persisted." };

  const rows = report.rows.filter((row) => typeof row.structuredDataCount === "number");
  if (!rows.length) return { available: true, saved: true, observations: 0 };

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
  try {
    const observations = await uow.withTransaction({ actorUserId: principal.userId, marketId: marketCode(), platformAccess: true }, async (tx) => {
      const runResult = await tx.query<{ id: string }>(`
        SELECT id::text AS id
        FROM seo_crawl_runs
        WHERE public_id=$1 AND market_id=nullif(current_setting('app.market_id',true),'')::uuid
        LIMIT 1
      `, [crawlPersistence.runId]);
      const runId = String(runResult.rows[0]?.id ?? "");
      if (!runId) throw new Error("Persisted SEO crawl run could not be resolved for structured-data evidence.");

      let inserted = 0;
      for (const row of rows) {
        const result = await tx.query<{ id: string }>(`
          SELECT id::text AS id FROM seo_crawl_results WHERE run_id=$1::uuid AND route=$2 LIMIT 1
        `, [runId, row.route]);
        const resultId = String(result.rows[0]?.id ?? "");
        if (!resultId) throw new Error(`Persisted crawl result is missing for ${row.route}.`);
        const write = await tx.query(`
          INSERT INTO seo_crawl_structured_data_observations(
            public_id,result_id,block_count,schema_types,parse_error_count,captured_at
          ) VALUES($1,$2::uuid,$3,$4::jsonb,$5,$6)
          ON CONFLICT(result_id) DO NOTHING
        `, [
          publicId(),
          resultId,
          row.structuredDataCount ?? 0,
          JSON.stringify(row.structuredDataTypes ?? []),
          row.structuredDataParseErrors ?? 0,
          new Date(report.generatedAt)
        ]);
        inserted += write.rowCount;
      }
      return inserted;
    });
    return { available: true, saved: true, observations };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ level: "error", event: "seo.structured_data_persistence_failed", runId: crawlPersistence.runId, message }));
    return { available: true, saved: false, observations: 0, error: message };
  }
}
