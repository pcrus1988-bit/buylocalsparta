import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import {
  buildBazaarPresentationOverlay,
  buildDeterministicGreekPresentation,
  catalogueEnrichmentSourceHash,
  extractNovaVerifiedFacts
} from "./catalogue-enrichment";
import { extractCatalogueProductIdentifiers } from "./catalogue-enrichment-identifiers";

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

export type NovaEnrichmentPreparationSliceResult = Readonly<{ scanned: number; prepared: number; failed: number }>;

export async function prepareNovaCatalogueEnrichment(input: PrepareCatalogueEnrichmentInput): Promise<void> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const extraction = extractNovaVerifiedFacts(input.normalizedPayload);
  const identifiers = extractCatalogueProductIdentifiers(input.normalizedPayload);
  const sourceHash = catalogueEnrichmentSourceHash(input.normalizedPayload,extraction.facts);
  const fallback = buildDeterministicGreekPresentation(extraction.facts);
  const bazaar = buildBazaarPresentationOverlay(input.normalizedPayload);

  const family = await pool.query<SqlRow>(`
    SELECT id FROM public.product_families
    WHERE source_supplier_id=$1::uuid AND source_external_product_id=$2
    ORDER BY created_at,id LIMIT 1
  `,[input.supplierId,input.externalProductId]);
  const familyId = family.rows[0]?.id ? String(family.rows[0].id) : null;

  await pool.query(`
    INSERT INTO public.catalogue_enrichments(
      supplier_id,external_product_id,family_id,source_product_id,
      verified_facts,fact_provenance,source_hash,status,
      deterministic_fallback,bazaar_overlay,validation_errors,rules_version,identifiers
    ) VALUES(
      $1::uuid,$2,$3::uuid,$4::uuid,$5::jsonb,$6::jsonb,$7,'pending',
      $8::jsonb,$9::jsonb,'[]'::jsonb,'catalogue-enrichment-v4',$10::jsonb
    )
    ON CONFLICT (supplier_id,external_product_id)
    DO UPDATE SET
      family_id=COALESCE(EXCLUDED.family_id,public.catalogue_enrichments.family_id),
      source_product_id=EXCLUDED.source_product_id,
      verified_facts=EXCLUDED.verified_facts,
      fact_provenance=EXCLUDED.fact_provenance,
      identifiers=EXCLUDED.identifiers,
      deterministic_fallback=EXCLUDED.deterministic_fallback,
      bazaar_overlay=EXCLUDED.bazaar_overlay,
      status=CASE WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash THEN 'pending' ELSE public.catalogue_enrichments.status END,
      validation_errors=CASE WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash THEN '[]'::jsonb ELSE public.catalogue_enrichments.validation_errors END,
      generation_candidate=CASE WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash THEN '{}'::jsonb ELSE public.catalogue_enrichments.generation_candidate END,
      generation_attempt_count=CASE WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash THEN 0 ELSE public.catalogue_enrichments.generation_attempt_count END,
      last_attempt_at=CASE WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash THEN NULL ELSE public.catalogue_enrichments.last_attempt_at END,
      processing_lease_until=CASE WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash THEN NULL ELSE public.catalogue_enrichments.processing_lease_until END,
      last_error=CASE WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash THEN NULL ELSE public.catalogue_enrichments.last_error END,
      research_status=CASE WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash THEN 'not_requested' ELSE public.catalogue_enrichments.research_status END,
      research_identity=CASE WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash THEN '{}'::jsonb ELSE public.catalogue_enrichments.research_identity END,
      research_evidence=CASE WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash THEN '{}'::jsonb ELSE public.catalogue_enrichments.research_evidence END,
      research_sources=CASE WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash THEN '[]'::jsonb ELSE public.catalogue_enrichments.research_sources END,
      research_version=CASE WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash THEN NULL ELSE public.catalogue_enrichments.research_version END,
      research_source_hash=CASE WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash THEN NULL ELSE public.catalogue_enrichments.research_source_hash END,
      researched_at=CASE WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash THEN NULL ELSE public.catalogue_enrichments.researched_at END,
      evidence_coverage=CASE WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash THEN '{}'::jsonb ELSE public.catalogue_enrichments.evidence_coverage END,
      quality_version=CASE WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash THEN NULL ELSE public.catalogue_enrichments.quality_version END,
      source_hash=EXCLUDED.source_hash,
      rules_version=EXCLUDED.rules_version,
      updated_at=now()
  `,[input.supplierId,input.externalProductId,familyId,input.sourceProductId,JSON.stringify(extraction.facts),
    JSON.stringify(extraction.provenance),sourceHash,JSON.stringify(fallback),JSON.stringify(bazaar),JSON.stringify(identifiers)]);
}

/** Prepare latest immutable NOVA evidence, prioritising governed/materialized families over dormant feed rows. */
export async function runNovaEnrichmentPreparationSlice(): Promise<NovaEnrichmentPreparationSliceResult> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const candidates = await pool.query<SqlRow>(`
    WITH latest AS (
      SELECT DISTINCT ON (p.source_product_key) p.id,p.source_id,p.source_product_key,p.normalized_payload,p.created_at
      FROM public.catalog_source_products p
      JOIN public.catalog_sources cs ON cs.id=p.source_id
      WHERE cs.code=$1 AND cs.active=true
      ORDER BY p.source_product_key,p.created_at DESC,p.id DESC
    )
    SELECT ds.id AS supplier_id,latest.id AS source_product_id,latest.source_product_key AS external_product_id,latest.normalized_payload
    FROM latest
    JOIN public.dropship_suppliers ds
      ON ds.catalog_source_id=latest.source_id AND ds.code=$2 AND ds.active=true AND ds.catalogue_sync_enabled=true
    LEFT JOIN public.catalogue_enrichments ce ON ce.supplier_id=ds.id AND ce.external_product_id=latest.source_product_key
    LEFT JOIN LATERAL (
      SELECT pf.id FROM public.product_families pf
      WHERE pf.source_supplier_id=ds.id AND pf.source_external_product_id=latest.source_product_key
      ORDER BY pf.created_at,pf.id LIMIT 1
    ) governed_family ON true
    WHERE ce.source_product_id IS DISTINCT FROM latest.id OR (ce.family_id IS NULL AND governed_family.id IS NOT NULL)
    ORDER BY (governed_family.id IS NOT NULL) DESC,latest.source_product_key
    LIMIT $3
  `,[NOVA_SOURCE_CODE,NOVA_SUPPLIER_CODE,preparationBatchSize()]);

  let prepared=0,failed=0;
  for (const row of candidates.rows) {
    try {
      await prepareNovaCatalogueEnrichment({
        supplierId:requiredText(row.supplier_id,"supplier id"),externalProductId:requiredText(row.external_product_id,"external product id"),
        sourceProductId:requiredText(row.source_product_id,"source product id"),normalizedPayload:record(row.normalized_payload)
      });
      prepared += 1;
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({ level:"error",event:"nova.catalogue_enrichment_preparation_product_failed",externalProductId:String(row.external_product_id??"unknown"),error:safeError(error),at:new Date().toISOString() }));
    }
  }
  return { scanned:candidates.rowCount??candidates.rows.length,prepared,failed };
}

function preparationBatchSize(): number {
  const value=Number(process.env.NOVA_ENRICHMENT_PREPARATION_BATCH_SIZE??DEFAULT_PREPARATION_BATCH_SIZE);
  return Number.isSafeInteger(value)&&value>0?Math.min(value,MAX_PREPARATION_BATCH_SIZE):DEFAULT_PREPARATION_BATCH_SIZE;
}
function requiredText(value:unknown,label:string):string { if ((typeof value==="string"||typeof value==="number")&&String(value).trim()) return String(value).trim(); throw new Error(`${label} is required`); }
function record(value:unknown):Readonly<Record<string,unknown>> { return value&&typeof value==="object"&&!Array.isArray(value)?value as Readonly<Record<string,unknown>>:{}; }
function safeError(error:unknown):string { return (error instanceof Error?`${error.name}:${error.message}`:String(error)).slice(0,500); }
