import type {
  OpenIcecatBulkBatch,
  OpenIcecatBulkRepository,
  OpenIcecatBulkRunIdentity,
  OpenIcecatBulkRunState
} from "../ingestion/open-icecat/bulk-runner.ts";
import type { OpenIcecatIndexEntry } from "../ingestion/open-icecat/types.ts";
import { OPEN_ICECAT_DETAIL_PROCESSING_VERSION } from "./postgres-open-icecat-detail.ts";
import { PostgresUnitOfWork, requireSingleRow, type SqlExecutor, type SqlPool, type SqlRow } from "./sql.ts";

export type OpenIcecatBulkRunStatus = Readonly<{
  runId: string;
  sourceId: string;
  sourceCode: string;
  sourceName: string;
  importKind: "full" | "daily";
  sourceUrl: string;
  sourceFingerprint: string;
  processingVersion: string;
  status: "running" | "completed" | "failed";
  checkpoint: number;
  sourceRows: number;
  persisted: number;
  removed: number;
  rejected: number;
  filtered: number;
  activeIndexProducts: number;
  removedIndexProducts: number;
  lastError?: string;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  failedAt?: number;
}>;

/**
 * PostgreSQL-backed Open Icecat index staging. This repository intentionally
 * stops at provider-index evidence. It never writes canonical products, offers,
 * stock, or catalog_source_product_localizations; Greek-quality publication
 * governance remains a separate downstream boundary.
 */
export class PostgresOpenIcecatBulkRepository implements OpenIcecatBulkRepository {
  readonly #uow: PostgresUnitOfWork;

  constructor(pool: SqlPool) {
    this.#uow = new PostgresUnitOfWork(pool, { statementTimeoutMs: 30_000, lockTimeoutMs: 5_000 });
  }

  async beginOrResume(identity: OpenIcecatBulkRunIdentity): Promise<OpenIcecatBulkRunState> {
    return this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      const source = requireSingleRow(await tx.query<SqlRow>(`
        SELECT id::text AS id
        FROM public.catalog_sources
        WHERE id::text=$1 AND code='open_icecat' AND active=true
      `, [identity.sourceId]), "Active Open Icecat catalog source not found");

      const run = requireSingleRow(await tx.query<SqlRow>(`
        INSERT INTO public.open_icecat_bulk_ingestion_runs (
          source_id, import_kind, source_url, source_fingerprint, processing_version, status
        ) VALUES ($1::uuid,$2,$3,$4,$5,'running')
        ON CONFLICT (source_id,import_kind,source_fingerprint,processing_version) DO UPDATE
        SET status=CASE
              WHEN public.open_icecat_bulk_ingestion_runs.status='completed' THEN 'completed'
              ELSE 'running'
            END,
            last_error=CASE
              WHEN public.open_icecat_bulk_ingestion_runs.status='completed' THEN public.open_icecat_bulk_ingestion_runs.last_error
              ELSE NULL
            END,
            failed_at=CASE
              WHEN public.open_icecat_bulk_ingestion_runs.status='completed' THEN public.open_icecat_bulk_ingestion_runs.failed_at
              ELSE NULL
            END,
            updated_at=now()
        RETURNING id::text, source_id::text, import_kind, source_url, source_fingerprint,
                  processing_version, checkpoint, status, persisted, removed, rejected, filtered
      `, [source.id, identity.importKind, identity.sourceUrl, identity.sourceFingerprint, identity.processingVersion]));

      return {
        runId: stringField(run.id),
        sourceId: stringField(run.source_id),
        importKind: stringField(run.import_kind) as "full" | "daily",
        sourceUrl: stringField(run.source_url),
        sourceFingerprint: stringField(run.source_fingerprint),
        processingVersion: stringField(run.processing_version),
        checkpoint: integerField(run.checkpoint),
        completed: stringField(run.status) === "completed",
        persisted: integerField(run.persisted),
        removed: integerField(run.removed),
        rejected: integerField(run.rejected),
        filtered: integerField(run.filtered)
      };
    });
  }

  async commitBatch(batch: OpenIcecatBulkBatch): Promise<void> {
    const classifiedRows = batch.candidates.length + batch.removals.length + batch.rejected + batch.filtered;
    if (classifiedRows !== batch.sourceRows) {
      throw new Error(`Open Icecat batch classification mismatch: ${classifiedRows} classified for ${batch.sourceRows} source rows`);
    }

    await this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      const run = requireSingleRow(await tx.query<SqlRow>(`
        SELECT id::text, source_id::text, source_fingerprint, checkpoint, status
        FROM public.open_icecat_bulk_ingestion_runs
        WHERE id=$1::uuid
        FOR UPDATE
      `, [batch.runId]), "Open Icecat bulk run not found");

      if (stringField(run.status) !== "running") throw new Error("Open Icecat bulk run is not running");
      const currentCheckpoint = integerField(run.checkpoint);
      if (batch.checkpoint !== currentCheckpoint + batch.sourceRows) {
        throw new Error(`Open Icecat checkpoint gap: current ${currentCheckpoint}, batch ${batch.checkpoint}, rows ${batch.sourceRows}`);
      }

      const sourceId = stringField(run.source_id);
      const fingerprint = stringField(run.source_fingerprint);
      await upsertIndexEntries(tx, sourceId, fingerprint, batch.runId, batch.candidates, "active");
      await upsertIndexEntries(tx, sourceId, fingerprint, batch.runId, batch.removals, "removed");

      const updated = await tx.query(`
        UPDATE public.open_icecat_bulk_ingestion_runs
        SET checkpoint=$2,
            source_rows=source_rows+$3,
            persisted=persisted+$4,
            removed=removed+$5,
            rejected=rejected+$6,
            filtered=filtered+$7,
            last_error=NULL,
            failed_at=NULL,
            updated_at=now()
        WHERE id=$1::uuid AND status='running'
      `, [
        batch.runId,
        batch.checkpoint,
        batch.sourceRows,
        batch.candidates.length,
        batch.removals.length,
        batch.rejected,
        batch.filtered
      ]);
      if (updated.rowCount !== 1) throw new Error("Open Icecat bulk run checkpoint update failed");
    }, { isolation: "read committed", statementTimeoutMs: 30_000 });
  }

  async complete(runId: string, checkpoint: number): Promise<void> {
    await this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      const run = requireSingleRow(await tx.query<SqlRow>(`
        SELECT id::text, source_id::text, import_kind, source_fingerprint,
               checkpoint, rejected, filtered, status
        FROM public.open_icecat_bulk_ingestion_runs
        WHERE id=$1::uuid
        FOR UPDATE
      `, [runId]), "Open Icecat bulk run not found");
      if (stringField(run.status) !== "running" || integerField(run.checkpoint) !== checkpoint) {
        throw new Error("Open Icecat bulk run could not be completed at the requested checkpoint");
      }

      const losslessFullSnapshot =
        stringField(run.import_kind) === "full" &&
        integerField(run.rejected) === 0 &&
        integerField(run.filtered) === 0;
      if (losslessFullSnapshot) {
        const sourceId = stringField(run.source_id);
        const fingerprint = stringField(run.source_fingerprint);
        await tx.query(`
          WITH retired AS (
            UPDATE public.open_icecat_index_products
            SET record_state='removed',
                last_source_fingerprint=$3,
                last_run_id=$2::uuid,
                last_seen_at=now(),
                removed_at=now()
            WHERE source_id=$1::uuid
              AND record_state='active'
              AND last_run_id <> $2::uuid
            RETURNING product_id
          )
          UPDATE public.open_icecat_detail_enrichment_jobs j
          SET last_run_id=$2::uuid,
              status='skipped',
              lease_owner=NULL,
              lease_until=NULL,
              completed_at=now(),
              last_error='product absent from completed lossless full provider index',
              updated_at=now()
          FROM retired r
          WHERE j.source_id=$1::uuid AND j.product_id=r.product_id
        `, [sourceId, runId, fingerprint]);
      }

      const result = await tx.query(`
        UPDATE public.open_icecat_bulk_ingestion_runs
        SET status='completed', completed_at=now(), failed_at=NULL, last_error=NULL, updated_at=now()
        WHERE id=$1::uuid AND status='running' AND checkpoint=$2
      `, [runId, checkpoint]);
      if (result.rowCount !== 1) throw new Error("Open Icecat bulk run completion update failed");
    });
  }

  async fail(runId: string, error: string): Promise<void> {
    await this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      await tx.query(`
        UPDATE public.open_icecat_bulk_ingestion_runs
        SET status='failed', failed_at=now(), completed_at=NULL,
            last_error=left(COALESCE(NULLIF(btrim($2),''),'unknown ingestion failure'),4000),
            updated_at=now()
        WHERE id=$1::uuid AND status <> 'completed'
      `, [runId, error]);
    });
  }

  async recentRuns(limit = 20): Promise<readonly OpenIcecatBulkRunStatus[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    return this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      const result = await tx.query<SqlRow>(`
        WITH index_counts AS (
          SELECT source_id,
                 count(*) FILTER (WHERE record_state='active')::bigint AS active_products,
                 count(*) FILTER (WHERE record_state='removed')::bigint AS removed_products
          FROM public.open_icecat_index_products
          GROUP BY source_id
        )
        SELECT r.id::text AS run_id, r.source_id::text AS source_id,
               s.code AS source_code, s.name AS source_name,
               r.import_kind, r.source_url, r.source_fingerprint, r.processing_version, r.status,
               r.checkpoint, r.source_rows, r.persisted, r.removed, r.rejected, r.filtered,
               r.last_error, r.started_at, r.updated_at, r.completed_at, r.failed_at,
               COALESCE(i.active_products,0) AS active_products,
               COALESCE(i.removed_products,0) AS removed_products
        FROM public.open_icecat_bulk_ingestion_runs r
        JOIN public.catalog_sources s ON s.id=r.source_id
        LEFT JOIN index_counts i ON i.source_id=r.source_id
        ORDER BY r.started_at DESC, r.id DESC
        LIMIT $1
      `, [safeLimit]);
      return result.rows.map(mapRunStatus);
    }, { readOnly: true, statementTimeoutMs: 8_000 });
  }
}

export function dedupeOpenIcecatIndexEntries(entries: readonly OpenIcecatIndexEntry[]): readonly OpenIcecatIndexEntry[] {
  const byProductId = new Map<string, OpenIcecatIndexEntry>();
  for (const entry of entries) byProductId.set(entry.productId, entry);
  return [...byProductId.values()];
}

async function upsertIndexEntries(
  tx: SqlExecutor,
  sourceId: string,
  fingerprint: string,
  runId: string,
  entries: readonly OpenIcecatIndexEntry[],
  state: "active" | "removed"
): Promise<void> {
  if (!entries.length) return;
  // Icecat's index can repeat a product within one source batch. PostgreSQL
  // rejects a multi-row ON CONFLICT statement that would update the same key
  // twice, so collapse duplicates deterministically while preserving the last
  // provider row for that product. Source-row accounting/checkpointing remains
  // based on the original batch and is therefore still lossless/resumable.
  const payload = JSON.stringify(dedupeOpenIcecatIndexEntries(entries));
  await tx.query(`
    INSERT INTO public.open_icecat_index_products (
      source_id, product_id, path, source_updated, quality, supplier_id, product_code,
      category_id, mapped_product_code, gtins, on_market, country_markets, model_name,
      product_views, high_pic, gtins_approved, limited, record_state,
      last_source_fingerprint, last_run_id, first_seen_at, last_seen_at, removed_at
    )
    SELECT
      $1::uuid,
      item->>'productId',
      item->>'path',
      NULLIF(item->>'updated',''),
      NULLIF(item->>'quality',''),
      NULLIF(item->>'supplierId',''),
      NULLIF(item->>'productCode',''),
      NULLIF(item->>'categoryId',''),
      NULLIF(item->>'mappedProductCode',''),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(item->'gtins','[]'::jsonb))),
      CASE WHEN item ? 'onMarket' THEN (item->>'onMarket')::boolean ELSE NULL END,
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(item->'countryMarkets','[]'::jsonb))),
      NULLIF(item->>'modelName',''),
      CASE WHEN item ? 'productViews' THEN (item->>'productViews')::bigint ELSE NULL END,
      NULLIF(item->>'highPic',''),
      CASE WHEN item ? 'gtinsApproved' THEN (item->>'gtinsApproved')::boolean ELSE NULL END,
      CASE WHEN item ? 'limited' THEN (item->>'limited')::boolean ELSE NULL END,
      $5,
      $2,
      $3::uuid,
      now(),
      now(),
      CASE WHEN $5='removed' THEN now() ELSE NULL END
    FROM jsonb_array_elements($4::jsonb) AS item
    ON CONFLICT (source_id,product_id) DO UPDATE
    SET path=EXCLUDED.path,
        source_updated=EXCLUDED.source_updated,
        quality=EXCLUDED.quality,
        supplier_id=EXCLUDED.supplier_id,
        product_code=EXCLUDED.product_code,
        category_id=EXCLUDED.category_id,
        mapped_product_code=EXCLUDED.mapped_product_code,
        gtins=EXCLUDED.gtins,
        on_market=EXCLUDED.on_market,
        country_markets=EXCLUDED.country_markets,
        model_name=EXCLUDED.model_name,
        product_views=EXCLUDED.product_views,
        high_pic=EXCLUDED.high_pic,
        gtins_approved=EXCLUDED.gtins_approved,
        limited=EXCLUDED.limited,
        record_state=EXCLUDED.record_state,
        last_source_fingerprint=EXCLUDED.last_source_fingerprint,
        last_run_id=EXCLUDED.last_run_id,
        last_seen_at=now(),
        removed_at=CASE WHEN EXCLUDED.record_state='removed' THEN now() ELSE NULL END
  `, [sourceId, fingerprint, runId, payload, state]);

  if (state === "removed") {
    await tx.query(`
      UPDATE public.open_icecat_detail_enrichment_jobs j
      SET last_run_id=$3::uuid,
          status='skipped',
          lease_owner=NULL,
          lease_until=NULL,
          completed_at=now(),
          last_error='provider index row removed',
          updated_at=now()
      FROM jsonb_array_elements($2::jsonb) AS item
      WHERE j.source_id=$1::uuid
        AND j.product_id=item->>'productId'
        AND j.status <> 'skipped'
    `, [sourceId, payload, runId]);
    return;
  }

  await tx.query(`
    INSERT INTO public.open_icecat_detail_enrichment_jobs (
      source_id, product_id, last_run_id, source_updated, processing_version,
      status, attempt_count, lease_owner, lease_until, next_attempt_at,
      source_product_id, last_error, last_attempt_at, completed_at, updated_at
    )
    SELECT i.source_id, i.product_id, i.last_run_id, i.source_updated, $3,
           'pending', 0, NULL, NULL, now(), NULL, NULL, NULL, NULL, now()
    FROM public.open_icecat_index_products i
    JOIN jsonb_array_elements($2::jsonb) AS item
      ON i.product_id=item->>'productId'
    WHERE i.source_id=$1::uuid
      AND i.record_state='active'
      AND cardinality(i.gtins)>0
    ON CONFLICT (source_id,product_id) DO UPDATE
    SET last_run_id=EXCLUDED.last_run_id,
        source_updated=EXCLUDED.source_updated,
        processing_version=EXCLUDED.processing_version,
        status='pending',
        attempt_count=0,
        lease_owner=NULL,
        lease_until=NULL,
        next_attempt_at=now(),
        source_product_id=NULL,
        last_error=NULL,
        last_attempt_at=NULL,
        completed_at=NULL,
        updated_at=now()
    WHERE public.open_icecat_detail_enrichment_jobs.processing_version IS DISTINCT FROM EXCLUDED.processing_version
       OR public.open_icecat_detail_enrichment_jobs.source_updated IS DISTINCT FROM EXCLUDED.source_updated
       OR (
         public.open_icecat_detail_enrichment_jobs.source_updated IS NULL
         AND EXCLUDED.source_updated IS NULL
         AND public.open_icecat_detail_enrichment_jobs.last_run_id IS DISTINCT FROM EXCLUDED.last_run_id
       )
  `, [sourceId, payload, OPEN_ICECAT_DETAIL_PROCESSING_VERSION]);

  await tx.query(`
    UPDATE public.open_icecat_detail_enrichment_jobs j
    SET last_run_id=$3::uuid,
        status='skipped',
        lease_owner=NULL,
        lease_until=NULL,
        completed_at=now(),
        last_error='provider index row has no GTIN for detail lookup',
        updated_at=now()
    FROM public.open_icecat_index_products i
    JOIN jsonb_array_elements($2::jsonb) AS item
      ON i.product_id=item->>'productId'
    WHERE i.source_id=$1::uuid
      AND j.source_id=i.source_id AND j.product_id=i.product_id
      AND i.record_state='active'
      AND cardinality(i.gtins)=0
      AND j.status <> 'skipped'
  `, [sourceId, payload, runId]);
}

function mapRunStatus(row: SqlRow): OpenIcecatBulkRunStatus {
  return {
    runId: stringField(row.run_id),
    sourceId: stringField(row.source_id),
    sourceCode: stringField(row.source_code),
    sourceName: stringField(row.source_name),
    importKind: stringField(row.import_kind) as "full" | "daily",
    sourceUrl: stringField(row.source_url),
    sourceFingerprint: stringField(row.source_fingerprint),
    processingVersion: stringField(row.processing_version),
    status: stringField(row.status) as "running" | "completed" | "failed",
    checkpoint: integerField(row.checkpoint),
    sourceRows: integerField(row.source_rows),
    persisted: integerField(row.persisted),
    removed: integerField(row.removed),
    rejected: integerField(row.rejected),
    filtered: integerField(row.filtered),
    activeIndexProducts: integerField(row.active_products),
    removedIndexProducts: integerField(row.removed_products),
    lastError: optionalString(row.last_error),
    startedAt: epoch(row.started_at),
    updatedAt: epoch(row.updated_at),
    completedAt: optionalEpoch(row.completed_at),
    failedAt: optionalEpoch(row.failed_at)
  };
}

function stringField(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("Expected database string field");
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function integerField(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Expected non-negative safe integer database field");
  return parsed;
}

function epoch(value: unknown): number {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(parsed)) throw new Error("Expected database timestamp field");
  return parsed;
}

function optionalEpoch(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  return epoch(value);
}
