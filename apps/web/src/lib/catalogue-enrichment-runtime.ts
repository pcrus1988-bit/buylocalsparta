import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import {
  buildBazaarPresentationOverlay,
  buildDeterministicGreekPresentation,
  catalogueEnrichmentSourceHash,
  extractNovaVerifiedFacts
} from "./catalogue-enrichment";

const NOVA_SOURCE_CODE = "nova-brandsgateway";
const NOVA_SUPPLIER_CODE = "nova_brandsgateway";
const DEFAULT_PREPARATION_BATCH_SIZE = 25;
const MAX_PREPARATION_BATCH_SIZE = 100;

export type PrepareCatalogueEnrichmentInput = Readonly<{
  supplierId: string;
  externalProductId: string;
  sourceProductId: string;
  normalizedPayload: Readonly<Record<string, unknown>>;
}>;

export type NovaEnrichmentPreparationSliceResult = Readonly<{
  scanned: number;
  prepared: number;
  failed: number;
}>;

/**
 * Prepare a supplier-parent enrichment record without generating AI copy.
 *
 * This operation is deliberately idempotent. A merchandising-relevant source
 * change moves the record back to pending while preserving the previous good
 * display copy until a future enrichment run validates a replacement.
 */
export async function prepareNovaCatalogueEnrichment(input: PrepareCatalogueEnrichmentInput): Promise<void> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const extraction = extractNovaVerifiedFacts(input.normalizedPayload);
  const sourceHash = catalogueEnrichmentSourceHash(input.normalizedPayload,extraction.facts);
  const fallback = buildDeterministicGreekPresentation(extraction.facts);
  const bazaar = buildBazaarPresentationOverlay(input.normalizedPayload);

  const family = await pool.query<SqlRow>(`
    SELECT id
    FROM public.product_families
    WHERE source_supplier_id=$1::uuid
      AND source_external_product_id=$2
    ORDER BY created_at,id
    LIMIT 1
  `,[input.supplierId,input.externalProductId]);
  const familyId = family.rows[0]?.id ? String(family.rows[0].id) : null;

  await pool.query(`
    INSERT INTO public.catalogue_enrichments(
      supplier_id,external_product_id,family_id,source_product_id,
      verified_facts,fact_provenance,source_hash,status,
      deterministic_fallback,bazaar_overlay,validation_errors,rules_version
    ) VALUES(
      $1::uuid,$2,$3::uuid,$4::uuid,
      $5::jsonb,$6::jsonb,$7,'pending',
      $8::jsonb,$9::jsonb,'[]'::jsonb,'catalogue-enrichment-v1'
    )
    ON CONFLICT (supplier_id,external_product_id)
    DO UPDATE SET
      family_id=COALESCE(EXCLUDED.family_id,public.catalogue_enrichments.family_id),
      source_product_id=EXCLUDED.source_product_id,
      verified_facts=EXCLUDED.verified_facts,
      fact_provenance=EXCLUDED.fact_provenance,
      deterministic_fallback=EXCLUDED.deterministic_fallback,
      bazaar_overlay=EXCLUDED.bazaar_overlay,
      status=CASE
        WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash THEN 'pending'
        ELSE public.catalogue_enrichments.status
      END,
      validation_errors=CASE
        WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash THEN '[]'::jsonb
        ELSE public.catalogue_enrichments.validation_errors
      END,
      last_error=CASE
        WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash THEN NULL
        ELSE public.catalogue_enrichments.last_error
      END,
      source_hash=EXCLUDED.source_hash,
      rules_version=EXCLUDED.rules_version,
      updated_at=now()
  `,[
    input.supplierId,
    input.externalProductId,
    familyId,
    input.sourceProductId,
    JSON.stringify(extraction.facts),
    JSON.stringify(extraction.provenance),
    sourceHash,
    JSON.stringify(fallback),
    JSON.stringify(bazaar)
  ]);
}

/**
 * Backfill and refresh the enrichment foundation from the latest immutable NOVA
 * source evidence. Rows are selected when supplier evidence changed, or when a
 * previously staged enrichment can now be attached to its governed family.
 * This is preparation only: no model/API call is made and no public copy changes.
 */
export async function runNovaEnrichmentPreparationSlice(): Promise<NovaEnrichmentPreparationSliceResult> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const candidates = await pool.query<SqlRow>(`
    WITH latest AS (
      SELECT DISTINCT ON (p.source_product_key)
        p.id,p.source_id,p.source_product_key,p.normalized_payload,p.created_at
      FROM public.catalog_source_products p
      JOIN public.catalog_sources cs ON cs.id=p.source_id
      WHERE cs.code=$1
        AND cs.active=true
      ORDER BY p.source_product_key,p.created_at DESC,p.id DESC
    )
    SELECT
      ds.id AS supplier_id,
      latest.id AS source_product_id,
      latest.source_product_key AS external_product_id,
      latest.normalized_payload
    FROM latest
    JOIN public.dropship_suppliers ds
      ON ds.catalog_source_id=latest.source_id
     AND ds.code=$2
     AND ds.active=true
     AND ds.catalogue_sync_enabled=true
    LEFT JOIN public.catalogue_enrichments ce
      ON ce.supplier_id=ds.id
     AND ce.external_product_id=latest.source_product_key
    WHERE ce.source_product_id IS DISTINCT FROM latest.id
       OR (
         ce.family_id IS NULL
         AND EXISTS (
           SELECT 1
           FROM public.product_families pf
           WHERE pf.source_supplier_id=ds.id
             AND pf.source_external_product_id=latest.source_product_key
         )
       )
    ORDER BY latest.source_product_key
    LIMIT $3
  `,[NOVA_SOURCE_CODE,NOVA_SUPPLIER_CODE,preparationBatchSize()]);

  let prepared = 0;
  let failed = 0;
  for (const row of candidates.rows) {
    try {
      await prepareNovaCatalogueEnrichment({
        supplierId: requiredText(row.supplier_id,"supplier id"),
        externalProductId: requiredText(row.external_product_id,"external product id"),
        sourceProductId: requiredText(row.source_product_id,"source product id"),
        normalizedPayload: record(row.normalized_payload)
      });
      prepared += 1;
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({
        level: "error",
        event: "nova.catalogue_enrichment_preparation_product_failed",
        externalProductId: String(row.external_product_id ?? "unknown"),
        error: safeError(error),
        at: new Date().toISOString()
      }));
    }
  }
  return { scanned: candidates.rowCount ?? candidates.rows.length,prepared,failed };
}

function preparationBatchSize(): number {
  const value = Number(process.env.NOVA_ENRICHMENT_PREPARATION_BATCH_SIZE ?? DEFAULT_PREPARATION_BATCH_SIZE);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value,MAX_PREPARATION_BATCH_SIZE) : DEFAULT_PREPARATION_BATCH_SIZE;
}

function requiredText(value: unknown, label: string): string {
  if ((typeof value === "string" || typeof value === "number") && String(value).trim()) return String(value).trim();
  throw new Error(`${label} is required`);
}

function record(value: unknown): Readonly<Record<string,unknown>> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string,unknown>> : {};
}

function safeError(error: unknown): string {
  return (error instanceof Error ? `${error.name}:${error.message}` : String(error)).slice(0,500);
}
