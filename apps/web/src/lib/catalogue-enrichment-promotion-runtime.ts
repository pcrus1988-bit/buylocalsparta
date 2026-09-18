import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 500;

export type CatalogueEnrichmentPromotionSliceResult = Readonly<{
  scanned: number;
  promoted: number;
  failed: number;
}>;

/**
 * Promote already validated family-level Greek enrichment into the only customer-facing
 * localization layer: product_translations.
 *
 * The database RPC is deliberately used instead of writing product_translations here. It
 * validates enrichment state, preserves existing non-empty/manual copy, and marks the
 * enrichment published. We still re-scan by variant so a family enrichment can be reused
 * when another variant becomes sellable later without regenerating AI copy.
 */
export async function runCatalogueEnrichmentPromotionSlice(): Promise<CatalogueEnrichmentPromotionSliceResult> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const candidates = await pool.query<SqlRow>(`
    WITH base AS (
      SELECT
        ce.id::text AS enrichment_id,
        ce.supplier_id,
        ce.updated_at,
        cv.id::text AS canonical_variant_id,
        cv.id AS canonical_variant_uuid,
        cv.active
      FROM public.catalogue_enrichments ce
      JOIN public.canonical_variants cv ON cv.family_id=ce.family_id
      LEFT JOIN public.product_translations pt
        ON pt.canonical_variant_id=cv.id AND pt.locale='el'
      WHERE ce.status='enriched'
        AND ce.family_id IS NOT NULL
        AND coalesce(jsonb_array_length(ce.validation_errors),0)=0
        AND nullif(btrim(ce.display_title_el),'') IS NOT NULL
        AND cv.suppressed=false
        AND cv.recalled=false
        AND (
          pt.canonical_variant_id IS NULL
          OR nullif(btrim(pt.title),'') IS NULL
          OR (nullif(btrim(ce.display_description_el),'') IS NOT NULL AND nullif(btrim(pt.description),'') IS NULL)
          OR nullif(btrim(pt.seo_title),'') IS NULL
          OR nullif(btrim(pt.seo_description),'') IS NULL
        )
    ),
    symphonya_candidates AS (
      SELECT b.*
      FROM base b
      JOIN public.dropship_suppliers ds
        ON ds.id=b.supplier_id AND ds.active=true AND ds.code='symphonya'
      WHERE EXISTS (
        SELECT 1
        FROM public.vendor_offers vo
        JOIN public.dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
        WHERE vo.canonical_variant_id=b.canonical_variant_uuid
          AND dso.supplier_id=ds.id
          AND vo.merchant_pause_active=false
          AND vo.customer_price_minor>0
          AND coalesce(vo.source_payload->>'pricingManagedBy','')='symphonya_auto_v1'
      )
    ),
    live_candidates AS (
      SELECT b.*
      FROM base b
      JOIN public.dropship_suppliers enrichment_supplier ON enrichment_supplier.id=b.supplier_id
      WHERE enrichment_supplier.code<>'symphonya'
        AND b.active=true
        AND EXISTS (
          SELECT 1
          FROM public.vendor_offers vo
          JOIN public.vendor_businesses v ON v.id=vo.vendor_id
          JOIN public.vendor_locations l ON l.id=vo.location_id
          LEFT JOIN public.dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
          LEFT JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
          LEFT JOIN public.inventory_balances ib ON ib.offer_id=vo.id
          WHERE vo.canonical_variant_id=b.canonical_variant_uuid
            AND vo.status='approved'
            AND vo.merchant_visible=true
            AND vo.merchant_pause_active=false
            AND vo.customer_price_minor>0
            AND v.status='active'
            AND l.active=true
            AND (
              (
                dso.id IS NOT NULL
                AND dso.active=true
                AND ds.active=true
                AND ds.api_authoritative_availability=true
                AND dso.cached_available=true
                AND dso.cached_quantity>=1
                AND dso.availability_expires_at IS NOT NULL
                AND dso.availability_expires_at>now()
                AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
              )
              OR (
                dso.id IS NULL
                AND GREATEST(
                  0,
                  COALESCE(ib.on_hand,0)-COALESCE(ib.active_reservations,0)-COALESCE(ib.safety_stock,0)-COALESCE(ib.blocked,0)
                )>0
              )
            )
        )
    )
    SELECT enrichment_id,canonical_variant_id
    FROM (
      SELECT * FROM symphonya_candidates
      UNION ALL
      SELECT * FROM live_candidates
    ) candidates
    ORDER BY updated_at,enrichment_id,canonical_variant_id
    LIMIT $1
  `,[promotionBatchSize()]);

  let promoted=0;
  let failed=0;
  for (const row of candidates.rows) {
    const enrichmentId=requiredText(row.enrichment_id,"enrichment id");
    const canonicalVariantId=requiredText(row.canonical_variant_id,"canonical variant id");
    try {
      const result=await pool.query<SqlRow>(
        `SELECT public.promote_catalogue_enrichment_translation($1::uuid,$2::uuid,'el') AS promoted`,
        [enrichmentId,canonicalVariantId]
      );
      if (result.rows[0]?.promoted === true) promoted += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({
        level:"error",
        event:"catalogue.enrichment_translation_promotion_failed",
        enrichmentId,
        canonicalVariantId,
        error:safeError(error),
        at:new Date().toISOString()
      }));
    }
  }

  return { scanned:candidates.rowCount??candidates.rows.length,promoted,failed };
}

function promotionBatchSize(): number {
  const raw=process.env.BLS_CATALOGUE_ENRICHMENT_PROMOTION_BATCH_SIZE;
  if (!raw?.trim()) return DEFAULT_BATCH_SIZE;
  const value=Number(raw);
  return Number.isSafeInteger(value)&&value>0 ? Math.min(value,MAX_BATCH_SIZE) : DEFAULT_BATCH_SIZE;
}

function requiredText(value: unknown,label: string): string {
  if ((typeof value==="string"||typeof value==="number")&&String(value).trim()) return String(value).trim();
  throw new Error(`${label} is required`);
}

function safeError(error: unknown): string {
  return (error instanceof Error?`${error.name}:${error.message}`:String(error)).replace(/\s+/g," ").slice(0,500);
}
