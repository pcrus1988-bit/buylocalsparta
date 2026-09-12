import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import {
  buildBazaarPresentationOverlay,
  buildDeterministicGreekPresentation,
  catalogueEnrichmentSourceHash,
  extractNovaVerifiedFacts
} from "./catalogue-enrichment";

export type PrepareCatalogueEnrichmentInput = Readonly<{
  supplierId: string;
  externalProductId: string;
  sourceProductId: string;
  normalizedPayload: Readonly<Record<string, unknown>>;
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
