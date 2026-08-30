import type { IcecatTextOrigin, OpenIcecatProductDraft } from "../ingestion/open-icecat/types.ts";
import { PostgresUnitOfWork, requireSingleRow, type SqlExecutor, type SqlPool, type SqlRow } from "./sql.ts";

export const OPEN_ICECAT_DETAIL_PROCESSING_VERSION = "open-icecat-detail-v1";

export type OpenIcecatDetailJobStatus =
  | "pending"
  | "processing"
  | "ready"
  | "needs_enrichment"
  | "retry"
  | "failed"
  | "skipped";

export type OpenIcecatDetailJob = Readonly<{
  sourceId: string;
  productId: string;
  lastRunId: string;
  sourceUpdated?: string;
  processingVersion: string;
  gtins: readonly string[];
  path: string;
  productCode?: string;
  categoryId?: string;
  modelName?: string;
  productViews?: number;
  attemptCount: number;
}>;

export type OpenIcecatDetailQueueStats = Readonly<{
  activeIndexProducts: number;
  unqueueableWithoutGtin: number;
  pending: number;
  processing: number;
  retry: number;
  ready: number;
  needsEnrichment: number;
  failed: number;
  skipped: number;
}>;

export type OpenIcecatDetailSyncResult = Readonly<{
  queuedOrRefreshed: number;
  removedSkipped: number;
}>;

export type OpenIcecatDetailPersistResult = Readonly<{
  stale: boolean;
  sourceProductId?: string;
  status?: "ready" | "needs_enrichment";
}>;

/**
 * Durable Open Icecat detail-enrichment persistence.
 *
 * This repository intentionally writes only provenance-bearing source catalogue
 * evidence plus EL localization/attribute observations. It never writes canonical
 * families/variants, vendor assortment/offers, prices, stock, or publication state.
 */
export class PostgresOpenIcecatDetailRepository {
  readonly #uow: PostgresUnitOfWork;

  constructor(pool: SqlPool) {
    this.#uow = new PostgresUnitOfWork(pool, { statementTimeoutMs: 30_000, lockTimeoutMs: 5_000 });
  }

  async sync(sourceId: string, processingVersion = OPEN_ICECAT_DETAIL_PROCESSING_VERSION): Promise<OpenIcecatDetailSyncResult> {
    return this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      requireSingleRow(await tx.query<SqlRow>(`
        SELECT id::text
        FROM public.catalog_sources
        WHERE id=$1::uuid AND code='open_icecat' AND active=true
      `, [sourceId]), "Active Open Icecat source not found");

      const queued = await tx.query(`
        INSERT INTO public.open_icecat_detail_enrichment_jobs (
          source_id, product_id, last_run_id, source_updated, processing_version,
          status, attempt_count, lease_owner, lease_until, next_attempt_at,
          source_product_id, last_error, completed_at, updated_at
        )
        SELECT i.source_id, i.product_id, i.last_run_id, i.source_updated, $2,
               'pending', 0, NULL, NULL, now(), NULL, NULL, NULL, now()
        FROM public.open_icecat_index_products i
        WHERE i.source_id=$1::uuid
          AND i.record_state='active'
          AND cardinality(i.gtins) > 0
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
      `, [sourceId, processingVersion]);

      const skipped = await tx.query(`
        UPDATE public.open_icecat_detail_enrichment_jobs j
        SET last_run_id=i.last_run_id,
            source_updated=i.source_updated,
            status='skipped',
            lease_owner=NULL,
            lease_until=NULL,
            completed_at=now(),
            last_error='provider index row removed',
            updated_at=now()
        FROM public.open_icecat_index_products i
        WHERE i.source_id=j.source_id AND i.product_id=j.product_id
          AND j.source_id=$1::uuid
          AND i.record_state='removed'
          AND j.status <> 'skipped'
      `, [sourceId]);

      return { queuedOrRefreshed: queued.rowCount, removedSkipped: skipped.rowCount };
    });
  }

  async claim(input: {
    sourceId: string;
    workerId: string;
    leaseSeconds: number;
    limit: number;
    processingVersion?: string;
  }): Promise<readonly OpenIcecatDetailJob[]> {
    const workerId = requiredText(input.workerId, "Open Icecat detail worker id");
    const leaseSeconds = boundedInteger(input.leaseSeconds, 30, 3600, "Open Icecat detail lease seconds");
    const limit = boundedInteger(input.limit, 1, 100, "Open Icecat detail claim limit");
    const processingVersion = input.processingVersion ?? OPEN_ICECAT_DETAIL_PROCESSING_VERSION;

    return this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      const result = await tx.query<SqlRow>(`
        WITH claimable AS (
          SELECT j.source_id, j.product_id
          FROM public.open_icecat_detail_enrichment_jobs j
          JOIN public.open_icecat_index_products i
            ON i.source_id=j.source_id AND i.product_id=j.product_id
          JOIN public.open_icecat_bulk_ingestion_runs r
            ON r.id=j.last_run_id AND r.source_id=j.source_id AND r.status='completed'
          WHERE j.source_id=$1::uuid
            AND j.processing_version=$2
            AND i.record_state='active'
            AND i.last_run_id=j.last_run_id
            AND i.source_updated IS NOT DISTINCT FROM j.source_updated
            AND j.next_attempt_at <= now()
            AND (
              j.status IN ('pending','retry')
              OR (j.status='processing' AND j.lease_until <= now())
            )
          ORDER BY COALESCE(i.product_views,0) DESC, j.updated_at ASC, j.product_id ASC
          FOR UPDATE OF j SKIP LOCKED
          LIMIT $5
        ), claimed AS (
          UPDATE public.open_icecat_detail_enrichment_jobs j
          SET status='processing',
              attempt_count=j.attempt_count+1,
              lease_owner=$3,
              lease_until=now()+make_interval(secs => $4),
              last_attempt_at=now(),
              completed_at=NULL,
              updated_at=now()
          FROM claimable c
          WHERE j.source_id=c.source_id AND j.product_id=c.product_id
          RETURNING j.source_id, j.product_id, j.last_run_id, j.source_updated,
                    j.processing_version, j.attempt_count
        )
        SELECT c.source_id::text, c.product_id, c.last_run_id::text, c.source_updated,
               c.processing_version, c.attempt_count,
               i.gtins, i.path, i.product_code, i.category_id, i.model_name, i.product_views
        FROM claimed c
        JOIN public.open_icecat_index_products i
          ON i.source_id=c.source_id AND i.product_id=c.product_id
        ORDER BY COALESCE(i.product_views,0) DESC, c.product_id ASC
      `, [input.sourceId, processingVersion, workerId, leaseSeconds, limit]);
      return result.rows.map(mapJob);
    }, { isolation: "read committed" });
  }

  async persist(
    job: OpenIcecatDetailJob,
    workerId: string,
    draft: OpenIcecatProductDraft
  ): Promise<OpenIcecatDetailPersistResult> {
    const owner = requiredText(workerId, "Open Icecat detail worker id");
    return this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      const current = requireSingleRow(await tx.query<SqlRow>(`
        SELECT j.source_id::text, j.product_id, j.last_run_id::text, j.source_updated,
               j.processing_version, j.status, j.lease_owner,
               i.last_run_id::text AS index_last_run_id, i.source_updated AS index_source_updated,
               i.record_state, i.product_code, i.path, i.category_id, i.model_name
        FROM public.open_icecat_detail_enrichment_jobs j
        JOIN public.open_icecat_index_products i
          ON i.source_id=j.source_id AND i.product_id=j.product_id
        WHERE j.source_id=$1::uuid AND j.product_id=$2
        FOR UPDATE OF j
      `, [job.sourceId, job.productId]), "Open Icecat detail job not found");

      if (String(current.status) !== "processing" || String(current.lease_owner ?? "") !== owner) {
        throw new Error("Open Icecat detail job lease belongs to another worker");
      }

      const currentRunId = String(current.last_run_id);
      const indexRunId = String(current.index_last_run_id);
      const currentUpdated = optionalString(current.source_updated);
      const indexUpdated = optionalString(current.index_source_updated);
      const recordState = String(current.record_state);
      const stale =
        recordState !== "active" ||
        currentRunId !== job.lastRunId ||
        indexRunId !== job.lastRunId ||
        currentUpdated !== job.sourceUpdated ||
        indexUpdated !== job.sourceUpdated ||
        String(current.processing_version) !== job.processingVersion;

      if (stale) {
        await tx.query(`
          UPDATE public.open_icecat_detail_enrichment_jobs
          SET last_run_id=$4::uuid,
              source_updated=$5,
              status=CASE WHEN $3='active' THEN 'pending' ELSE 'skipped' END,
              attempt_count=CASE WHEN $3='active' THEN 0 ELSE attempt_count END,
              lease_owner=NULL,
              lease_until=NULL,
              next_attempt_at=now(),
              source_product_id=CASE WHEN $3='active' THEN NULL ELSE source_product_id END,
              completed_at=CASE WHEN $3='active' THEN NULL ELSE now() END,
              last_error=CASE WHEN $3='active' THEN 'index version changed during detail fetch' ELSE 'provider index row removed during detail fetch' END,
              updated_at=now()
          WHERE source_id=$1::uuid AND product_id=$2
        `, [job.sourceId, job.productId, recordState, indexRunId, indexUpdated ?? null]);
        return { stale: true };
      }

      const snapshotId = await ensureSnapshot(tx, job.lastRunId);
      const sourceProductId = await ensureSourceProduct(tx, {
        snapshotId,
        sourceId: job.sourceId,
        productId: job.productId,
        productCode: optionalString(current.product_code),
        path: String(current.path),
        categoryId: optionalString(current.category_id),
        modelName: optionalString(current.model_name),
        sourceUpdated: job.sourceUpdated,
        lastRunId: job.lastRunId,
        draft
      });

      await upsertLocalization(tx, sourceProductId, draft);
      await insertAttributeObservations(tx, sourceProductId, draft);

      const terminalStatus = draft.greekQuality.status === "READY" ? "ready" : "needs_enrichment";
      const updated = await tx.query(`
        UPDATE public.open_icecat_detail_enrichment_jobs
        SET status=$4,
            source_product_id=$5::uuid,
            lease_owner=NULL,
            lease_until=NULL,
            last_error=NULL,
            completed_at=now(),
            updated_at=now()
        WHERE source_id=$1::uuid AND product_id=$2
          AND status='processing' AND lease_owner=$3
      `, [job.sourceId, job.productId, owner, terminalStatus, sourceProductId]);
      if (updated.rowCount !== 1) throw new Error("Open Icecat detail completion lost its lease");
      return { stale: false, sourceProductId, status: terminalStatus };
    }, { isolation: "read committed", statementTimeoutMs: 30_000 });
  }

  async retry(input: {
    job: OpenIcecatDetailJob;
    workerId: string;
    error: string;
    retrySeconds: number;
    terminal: boolean;
  }): Promise<void> {
    const owner = requiredText(input.workerId, "Open Icecat detail worker id");
    const retrySeconds = boundedInteger(input.retrySeconds, 1, 86400, "Open Icecat detail retry seconds");
    await this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      const result = await tx.query(`
        UPDATE public.open_icecat_detail_enrichment_jobs
        SET status=CASE WHEN $5 THEN 'failed' ELSE 'retry' END,
            lease_owner=NULL,
            lease_until=NULL,
            next_attempt_at=CASE WHEN $5 THEN next_attempt_at ELSE now()+make_interval(secs => $4) END,
            last_error=left(COALESCE(NULLIF(btrim($3),''),'unknown detail enrichment failure'),4000),
            completed_at=CASE WHEN $5 THEN now() ELSE NULL END,
            updated_at=now()
        WHERE source_id=$1::uuid AND product_id=$2
          AND status='processing' AND lease_owner=$6
      `, [input.job.sourceId, input.job.productId, input.error, retrySeconds, input.terminal, owner]);
      if (result.rowCount !== 1) throw new Error("Open Icecat detail retry lost its lease");
    });
  }

  async skip(job: OpenIcecatDetailJob, workerId: string, reason: string): Promise<void> {
    const owner = requiredText(workerId, "Open Icecat detail worker id");
    await this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      const result = await tx.query(`
        UPDATE public.open_icecat_detail_enrichment_jobs
        SET status='skipped', lease_owner=NULL, lease_until=NULL,
            last_error=left(COALESCE(NULLIF(btrim($3),''),'detail enrichment skipped'),4000),
            completed_at=now(), updated_at=now()
        WHERE source_id=$1::uuid AND product_id=$2
          AND status='processing' AND lease_owner=$4
      `, [job.sourceId, job.productId, reason, owner]);
      if (result.rowCount !== 1) throw new Error("Open Icecat detail skip lost its lease");
    });
  }

  async stats(sourceId: string): Promise<OpenIcecatDetailQueueStats> {
    return this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      const row = requireSingleRow(await tx.query<SqlRow>(`
        WITH index_stats AS (
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
                 count(*) FILTER (WHERE status='skipped')::bigint AS skipped
          FROM public.open_icecat_detail_enrichment_jobs
          WHERE source_id=$1::uuid
        )
        SELECT * FROM index_stats CROSS JOIN job_stats
      `, [sourceId]));
      return {
        activeIndexProducts: integerField(row.active_products),
        unqueueableWithoutGtin: integerField(row.without_gtin),
        pending: integerField(row.pending),
        processing: integerField(row.processing),
        retry: integerField(row.retry),
        ready: integerField(row.ready),
        needsEnrichment: integerField(row.needs_enrichment),
        failed: integerField(row.failed),
        skipped: integerField(row.skipped)
      };
    }, { readOnly: true, statementTimeoutMs: 8_000 });
  }
}

async function ensureSnapshot(tx: SqlExecutor, runId: string): Promise<string> {
  const row = requireSingleRow(await tx.query<SqlRow>(`
    WITH source_run AS (
      SELECT r.id, r.source_id, r.import_kind, r.source_fingerprint,
             COALESCE(r.completed_at,r.updated_at) AS observed_at
      FROM public.open_icecat_bulk_ingestion_runs r
      WHERE r.id=$1::uuid AND r.status='completed'
    ), inserted AS (
      INSERT INTO public.catalog_source_snapshots (
        source_id, source_filename, source_hash, source_version, observed_at, row_count, metadata
      )
      SELECT source_id,
             'open-icecat-'||import_kind||'-index',
             encode(digest('open-icecat-detail|'||id::text||'|'||source_fingerprint,'sha256'),'hex'),
             source_fingerprint,
             observed_at,
             NULL,
             jsonb_build_object('provider','open_icecat','bulkRunId',id::text,'importKind',import_kind,'evidenceKind','product_detail')
      FROM source_run
      ON CONFLICT (source_id,source_hash) DO NOTHING
      RETURNING id::text, source_id, source_hash
    ), target AS (
      SELECT id::text FROM inserted
      UNION ALL
      SELECT s.id::text
      FROM public.catalog_source_snapshots s
      JOIN source_run r ON r.source_id=s.source_id
      WHERE s.source_hash=encode(digest('open-icecat-detail|'||r.id::text||'|'||r.source_fingerprint,'sha256'),'hex')
      LIMIT 1
    )
    SELECT id FROM target LIMIT 1
  `, [runId]), "Completed Open Icecat bulk run snapshot could not be resolved");
  return stringField(row.id);
}

async function ensureSourceProduct(tx: SqlExecutor, input: {
  snapshotId: string;
  sourceId: string;
  productId: string;
  productCode?: string;
  path: string;
  categoryId?: string;
  modelName?: string;
  sourceUpdated?: string;
  lastRunId: string;
  draft: OpenIcecatProductDraft;
}): Promise<string> {
  const primaryImage = input.draft.images.find((image) => image.kind === "primary")?.url ?? input.draft.images[0]?.url;
  const sourceIdentity = {
    provider: "open_icecat",
    providerProductId: input.productId,
    icecatId: input.draft.icecatId,
    gtins: input.draft.gtins,
    primaryGtin: input.draft.primaryGtin,
    brand: input.draft.brand,
    brandPartCode: input.draft.brandPartCode,
    sourceUpdated: input.sourceUpdated,
    bulkRunId: input.lastRunId,
    indexPath: input.path,
    categoryId: input.categoryId,
    modelName: input.modelName
  };
  const normalizedPayload = {
    icecatId: input.draft.icecatId,
    gtins: input.draft.gtins,
    primaryGtin: input.draft.primaryGtin,
    brand: input.draft.brand,
    brandPartCode: input.draft.brandPartCode,
    productName: input.draft.productName,
    title: input.draft.title,
    description: input.draft.description,
    category: input.draft.category,
    specifications: input.draft.specifications,
    images: input.draft.images,
    variants: input.draft.variants,
    sourceLocale: input.draft.sourceLocale
  };

  const inserted = await tx.query<SqlRow>(`
    INSERT INTO public.catalog_source_products (
      snapshot_id, source_id, source_product_key, supplier_code, title,
      source_url, source_image_url, source_identity, raw_payload,
      normalized_payload, quality_payload, price_state, classification_status
    ) VALUES (
      $1::uuid,$2::uuid,$3,$4,$5,NULL,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,'unpriced','raw'
    )
    ON CONFLICT (snapshot_id,source_product_key) DO NOTHING
    RETURNING id::text
  `, [
    input.snapshotId,
    input.sourceId,
    input.productId,
    input.productCode ?? null,
    input.draft.title.value,
    primaryImage ?? null,
    JSON.stringify(sourceIdentity),
    JSON.stringify(input.draft.sourcePayload),
    JSON.stringify(normalizedPayload),
    JSON.stringify(input.draft.greekQuality)
  ]);
  if (inserted.rows[0]?.id) return stringField(inserted.rows[0].id);

  const existing = requireSingleRow(await tx.query<SqlRow>(`
    SELECT id::text
    FROM public.catalog_source_products
    WHERE snapshot_id=$1::uuid AND source_product_key=$2
  `, [input.snapshotId, input.productId]), "Open Icecat source product could not be resolved after idempotent insert");
  return stringField(existing.id);
}

async function upsertLocalization(tx: SqlExecutor, sourceProductId: string, draft: OpenIcecatProductDraft): Promise<void> {
  const provenance = fieldProvenance(draft);
  const searchTerms = uniqueStrings([
    draft.title.value,
    draft.productName?.value,
    draft.brand,
    draft.brandPartCode,
    draft.primaryGtin,
    ...draft.gtins
  ]);
  const metadata = {
    provider: "open_icecat",
    icecatId: draft.icecatId,
    primaryGtin: draft.primaryGtin,
    images: draft.images,
    variants: draft.variants
  };
  const status = draft.greekQuality.status === "READY" ? "ready" : "needs_enrichment";

  await tx.query(`
    INSERT INTO public.catalog_source_product_localizations (
      source_product_id, locale, source_locale, title, product_name, description,
      category_label, specifications, search_terms, field_provenance, content_origin,
      localizer_version, greek_completeness, quality_status, quality_missing, metadata
    ) VALUES (
      $1::uuid,'EL',$2,$3,$4,$5,$6,$7::jsonb,$8::text[],$9::jsonb,$10,NULL,$11,$12,$13::text[],$14::jsonb
    )
    ON CONFLICT (source_product_id,locale) DO UPDATE
    SET source_locale=EXCLUDED.source_locale,
        title=EXCLUDED.title,
        product_name=EXCLUDED.product_name,
        description=EXCLUDED.description,
        category_label=EXCLUDED.category_label,
        specifications=EXCLUDED.specifications,
        search_terms=EXCLUDED.search_terms,
        field_provenance=EXCLUDED.field_provenance,
        content_origin=EXCLUDED.content_origin,
        greek_completeness=EXCLUDED.greek_completeness,
        quality_status=EXCLUDED.quality_status,
        quality_missing=EXCLUDED.quality_missing,
        metadata=EXCLUDED.metadata,
        updated_at=now()
  `, [
    sourceProductId,
    draft.sourceLocale,
    draft.title.value,
    draft.productName?.value ?? null,
    draft.description?.value ?? null,
    draft.category?.value ?? null,
    JSON.stringify(draft.specifications),
    searchTerms,
    JSON.stringify(provenance),
    contentOrigin(draft),
    draft.greekQuality.score,
    status,
    [...draft.greekQuality.missing],
    JSON.stringify(metadata)
  ]);
}

async function insertAttributeObservations(tx: SqlExecutor, sourceProductId: string, draft: OpenIcecatProductDraft): Promise<void> {
  if (!draft.specifications.length) return;
  await tx.query(`
    INSERT INTO public.catalog_source_attribute_observations (
      source_product_id, source_attribute_key, position, attribute_id,
      raw_value, normalized_value, source_unit, mapping_status, confidence, metadata
    )
    SELECT $1::uuid,
           spec.value->>'key',
           0,
           NULL,
           spec.value,
           spec.value,
           NULLIF(spec.value->>'unit',''),
           'unmapped',
           NULL,
           jsonb_build_object('provider','open_icecat','locale','EL')
    FROM jsonb_array_elements($2::jsonb) AS spec(value)
    WHERE length(btrim(spec.value->>'key')) > 0
    ON CONFLICT (source_product_id,source_attribute_key,position) DO NOTHING
  `, [sourceProductId, JSON.stringify(draft.specifications)]);
}

function fieldProvenance(draft: OpenIcecatProductDraft): Record<string, unknown> {
  return {
    title: draft.title.origin,
    description: draft.description?.origin ?? null,
    category: draft.category?.origin ?? null,
    specifications: uniqueStrings(draft.specifications.flatMap((spec) => [spec.name.origin, spec.value.origin]))
  };
}

function contentOrigin(draft: OpenIcecatProductDraft): "icecat_native" | "translated_verified" | "mixed" {
  const origins: IcecatTextOrigin[] = [
    draft.title.origin,
    ...(draft.description ? [draft.description.origin] : []),
    ...(draft.category ? [draft.category.origin] : []),
    ...draft.specifications.flatMap((spec) => [spec.name.origin, spec.value.origin])
  ];
  if (origins.length && origins.every((origin) => origin === "ICECAT_NATIVE_EL")) return "icecat_native";
  if (origins.length && origins.every((origin) => origin === "TRANSLATED_VERIFIED")) return "translated_verified";
  return "mixed";
}

function mapJob(row: SqlRow): OpenIcecatDetailJob {
  return {
    sourceId: stringField(row.source_id),
    productId: stringField(row.product_id),
    lastRunId: stringField(row.last_run_id),
    sourceUpdated: optionalString(row.source_updated),
    processingVersion: stringField(row.processing_version),
    gtins: stringArray(row.gtins),
    path: stringField(row.path),
    productCode: optionalString(row.product_code),
    categoryId: optionalString(row.category_id),
    modelName: optionalString(row.model_name),
    productViews: optionalInteger(row.product_views),
    attemptCount: integerField(row.attempt_count)
  };
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}
function stringField(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("Expected database string field");
  return value;
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}
function integerField(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Expected non-negative safe integer database field");
  return parsed;
}
function optionalInteger(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  return integerField(value);
}
function boundedInteger(value: number, min: number, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer between ${min} and ${max}`);
  return value;
}
function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}
