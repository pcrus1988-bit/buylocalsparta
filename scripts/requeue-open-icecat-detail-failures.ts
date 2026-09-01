import {
  OPEN_ICECAT_DETAIL_PROCESSING_VERSION,
  PostgresUnitOfWork,
  type SqlRow
} from "../packages/core/src/index.ts";
import {
  createPostgresRuntimeFromEnv,
  EXPECTED_SCHEMA_VERSION
} from "../packages/postgres-runtime/src/index.ts";

const apply = process.env.BLS_OPEN_ICECAT_DETAIL_REQUEUE_APPLY?.trim().toLowerCase() === "true";
const limit = boundedInteger(
  process.env.BLS_OPEN_ICECAT_DETAIL_REQUEUE_LIMIT,
  100,
  1,
  10_000,
  "BLS_OPEN_ICECAT_DETAIL_REQUEUE_LIMIT"
);
const minimumAgeMinutes = boundedInteger(
  process.env.BLS_OPEN_ICECAT_DETAIL_REQUEUE_MIN_AGE_MINUTES,
  30,
  0,
  43_200,
  "BLS_OPEN_ICECAT_DETAIL_REQUEUE_MIN_AGE_MINUTES"
);

const runtime = createPostgresRuntimeFromEnv({
  applicationName: "buy-local-sparta-open-icecat-detail-requeue"
});

try {
  const readiness = await runtime.readiness(EXPECTED_SCHEMA_VERSION);
  if (!readiness.ok) throw new Error(`Open Icecat detail requeue refused to run: ${readiness.message}`);

  const uow = new PostgresUnitOfWork(runtime.sqlPool, {
    statementTimeoutMs: 15_000,
    lockTimeoutMs: 3_000
  });

  const result = apply
    ? await applyRequeue(uow)
    : await previewRequeue(uow);

  console.log(JSON.stringify({
    ok: true,
    mode: apply ? "apply" : "dry_run",
    processingVersion: OPEN_ICECAT_DETAIL_PROCESSING_VERSION,
    minimumAgeMinutes,
    limit,
    matched: result.length,
    productIds: result.map((row) => String(row.product_id))
  }, null, 2));

  if (!apply && result.length > 0) {
    console.log("Dry run only. Set BLS_OPEN_ICECAT_DETAIL_REQUEUE_APPLY=true to requeue the displayed failed jobs.");
  }
} finally {
  await runtime.close();
}

async function previewRequeue(uow: PostgresUnitOfWork): Promise<readonly SqlRow[]> {
  return uow.withTransaction({ platformAccess: true }, async (tx) => {
    const sourceId = await loadSourceId(tx);
    const result = await tx.query<SqlRow>(`
      SELECT j.product_id, j.attempt_count, j.completed_at, j.last_error
      FROM public.open_icecat_detail_enrichment_jobs j
      JOIN public.open_icecat_index_products i
        ON i.source_id=j.source_id AND i.product_id=j.product_id
      WHERE j.source_id=$1::uuid
        AND j.processing_version=$2
        AND j.status='failed'
        AND j.completed_at <= now()-make_interval(mins => $3)
        AND i.record_state='active'
        AND i.last_run_id=j.last_run_id
        AND i.source_updated IS NOT DISTINCT FROM j.source_updated
      ORDER BY j.completed_at ASC NULLS FIRST, j.updated_at ASC, j.product_id ASC
      LIMIT $4
    `, [sourceId, OPEN_ICECAT_DETAIL_PROCESSING_VERSION, minimumAgeMinutes, limit]);
    return result.rows;
  }, { readOnly: true });
}

async function applyRequeue(uow: PostgresUnitOfWork): Promise<readonly SqlRow[]> {
  return uow.withTransaction({ platformAccess: true }, async (tx) => {
    const sourceId = await loadSourceId(tx);
    const result = await tx.query<SqlRow>(`
      WITH candidates AS (
        SELECT j.source_id, j.product_id
        FROM public.open_icecat_detail_enrichment_jobs j
        JOIN public.open_icecat_index_products i
          ON i.source_id=j.source_id AND i.product_id=j.product_id
        WHERE j.source_id=$1::uuid
          AND j.processing_version=$2
          AND j.status='failed'
          AND j.completed_at <= now()-make_interval(mins => $3)
          AND i.record_state='active'
          AND i.last_run_id=j.last_run_id
          AND i.source_updated IS NOT DISTINCT FROM j.source_updated
        ORDER BY j.completed_at ASC NULLS FIRST, j.updated_at ASC, j.product_id ASC
        FOR UPDATE OF j SKIP LOCKED
        LIMIT $4
      )
      UPDATE public.open_icecat_detail_enrichment_jobs j
      SET status='retry',
          attempt_count=0,
          lease_owner=NULL,
          lease_until=NULL,
          next_attempt_at=now(),
          completed_at=NULL,
          updated_at=now()
      FROM candidates c
      WHERE j.source_id=c.source_id AND j.product_id=c.product_id
      RETURNING j.product_id, j.attempt_count, j.completed_at, j.last_error
    `, [sourceId, OPEN_ICECAT_DETAIL_PROCESSING_VERSION, minimumAgeMinutes, limit]);
    return result.rows;
  }, { isolation: "read committed" });
}

async function loadSourceId(tx: { query<T extends SqlRow = SqlRow>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }> }): Promise<string> {
  const result = await tx.query<SqlRow>(`
    SELECT s.id::text AS source_id
    FROM public.catalog_sources s
    JOIN public.markets m ON m.id=s.market_id
    WHERE s.code='open_icecat' AND s.active=true AND m.code='sparta'
    LIMIT 1
  `);
  const sourceId = result.rows[0]?.source_id;
  if (typeof sourceId !== "string" || !sourceId) throw new Error("Active Sparta Open Icecat source configuration not found");
  return sourceId;
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string
): number {
  const value = raw?.trim() ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}
