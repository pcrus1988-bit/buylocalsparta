import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { resolveSymphonyaCategoryCode } from "./symphonya-category-mapping";

const SUPPLIER_CODE = "symphonya";
const CATEGORY_BATCH_SIZE = 1_000;
const PUBLICATION_BATCH_SIZE = 1_000;

export type SymphonyaAutoPublicationResult = Readonly<{
  categoryCandidates: number;
  categorized: number;
  unmapped: number;
  publicationEnabled: boolean;
  orderForwardingEnabled: boolean;
  published: number;
}>;

export function symphonyaAutoPublicationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BLS_SYMPHONYA_AUTO_PUBLICATION_ENABLED?.trim().toLowerCase() !== "false";
}

/**
 * Category organization is always allowed because it does not make an offer public.
 *
 * Storefront publication is intentionally separate from automatic supplier-order
 * forwarding so catalogue discovery can recover before live order forwarding is
 * enabled. Checkout is the hard payment boundary: Symphonya carts must not create
 * a payable customer order while order_forwarding_enabled=false. Operators can stop
 * automatic publication explicitly with BLS_SYMPHONYA_AUTO_PUBLICATION_ENABLED=false.
 *
 * Archived Symphonya offers may be recovered only when the authoritative
 * vendor_product_submissions ledger is not archived and there is no pending
 * activation request. Admin archive authority therefore remains fail-closed while
 * historical/system-staged dropshipping rows can re-enter the automatic conveyor.
 */
export async function runSymphonyaAutoPublicationSweep(): Promise<SymphonyaAutoPublicationResult> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const supplier = await pool.query<SqlRow>(`
    SELECT id::text id,order_forwarding_enabled
      FROM public.dropship_suppliers
     WHERE code=$1 AND active=true
     LIMIT 1
  `, [SUPPLIER_CODE]);
  const orderForwardingEnabled = supplier.rows[0]?.order_forwarding_enabled === true;
  const publicationEnabled = symphonyaAutoPublicationEnabled();

  const candidates = await pool.query<SqlRow>(`
    SELECT cv.id::text canonical_id,
           cv.family_id::text family_id,
           csp.title,
           csp.normalized_payload
      FROM public.dropship_supplier_offers dso
      JOIN public.dropship_suppliers ds
        ON ds.id=dso.supplier_id
       AND ds.code=$1
       AND ds.active=true
      JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
      JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN public.catalog_source_products csp ON csp.id=dso.source_product_id
     WHERE cv.category_id IS NULL
       AND cv.suppressed=false
       AND cv.recalled=false
     ORDER BY dso.updated_at DESC,dso.id
     LIMIT $2
  `, [SUPPLIER_CODE, CATEGORY_BATCH_SIZE]);

  const idsByCategory = new Map<string, Array<{ canonicalId: string; familyId: string | null }>>();
  for (const row of candidates.rows) {
    const code = resolveSymphonyaCategoryCode(row.normalized_payload, String(row.title ?? ""));
    if (!code) continue;
    const item = {
      canonicalId: requiredText(row.canonical_id, "canonical id"),
      familyId: optionalText(row.family_id)
    };
    const entries = idsByCategory.get(code);
    if (entries) entries.push(item);
    else idsByCategory.set(code, [item]);
  }

  let categorized = 0;
  for (const [code, entries] of idsByCategory) {
    const canonicalIds = entries.map((item) => item.canonicalId);
    const familyIds = [...new Set(entries.map((item) => item.familyId).filter((item): item is string => Boolean(item)))];

    if (familyIds.length) {
      await pool.query(`
        UPDATE public.product_families pf
           SET category_id=c.id,
               updated_at=now()
          FROM public.categories c
         WHERE pf.id=ANY($1::uuid[])
           AND pf.category_id IS NULL
           AND c.market_id=pf.market_id
           AND c.code=$2
           AND c.active=true
           AND c.assignable=true
           AND c.taxonomy_role='product_class'
      `, [familyIds, code]);
    }

    const changed = await pool.query<SqlRow>(`
      UPDATE public.canonical_variants cv
         SET category_id=COALESCE(pf.category_id,c.id),
             updated_at=now()
        FROM public.product_families pf,
             public.categories c
       WHERE cv.id=ANY($1::uuid[])
         AND cv.category_id IS NULL
         AND pf.id=cv.family_id
         AND c.market_id=cv.market_id
         AND c.code=$2
         AND c.active=true
         AND c.assignable=true
         AND c.taxonomy_role='product_class'
      RETURNING cv.id
    `, [canonicalIds, code]);
    categorized += changed.rowCount ?? changed.rows.length;
  }

  let published = 0;
  if (publicationEnabled) {
    const result = await pool.query<SqlRow>(`
      WITH eligible AS MATERIALIZED (
        SELECT vo.id offer_id,vo.vendor_id,vo.public_id,
               cv.id canonical_id,cv.family_id,dso.id supplier_offer_id
          FROM public.dropship_supplier_offers dso
          JOIN public.dropship_suppliers ds
            ON ds.id=dso.supplier_id
           AND ds.code=$1
           AND ds.active=true
          JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
          JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
         WHERE cv.category_id IS NOT NULL
           AND cv.family_id IS NOT NULL
           AND cv.suppressed=false
           AND cv.recalled=false
           AND vo.status::text IN ('draft','approved','archived')
           AND COALESCE(vo.source_payload->>'pricingManagedBy','')='symphonya_auto_v1'
           AND COALESCE(vo.source_payload->>'pricingPending','true')='false'
           AND dso.supplier_cost_minor>0
           AND vo.customer_price_minor>0
           AND vo.customer_price_minor>=dso.supplier_cost_minor
           AND dso.cached_available=true
           AND COALESCE(dso.cached_quantity,0)>0
           AND dso.availability_expires_at IS NOT NULL
           AND dso.availability_expires_at>now()
           AND COALESCE(dso.availability_payload->>'priceHeld','false')<>'true'
           AND EXISTS (
             SELECT 1 FROM public.product_translations pt
              WHERE pt.canonical_variant_id=cv.id
                AND pt.locale='el'
                AND NULLIF(btrim(pt.title),'') IS NOT NULL
           )
           AND COALESCE((
             SELECT s.status::text
               FROM public.vendor_product_submissions s
              WHERE s.vendor_id=vo.vendor_id
                AND s.canonical_variant_id=vo.canonical_variant_id
              ORDER BY s.updated_at DESC,s.id DESC
              LIMIT 1
           ),'') <> 'archived'
           AND NOT EXISTS (
             SELECT 1
               FROM public.vendor_product_activation_requests ar
              WHERE ar.offer_id=vo.id
                AND ar.status='pending'
           )
         ORDER BY vo.id
         LIMIT $2
      ), family_changed AS (
        UPDATE public.product_families pf
           SET active=true,updated_at=now()
          FROM eligible e
         WHERE pf.id=e.family_id
           AND pf.active=false
        RETURNING pf.id
      ), canonical_changed AS (
        UPDATE public.canonical_variants cv
           SET active=true,updated_at=now()
          FROM eligible e
         WHERE cv.id=e.canonical_id
           AND cv.active=false
        RETURNING cv.id
      ), supplier_changed AS (
        UPDATE public.dropship_supplier_offers dso
           SET active=true,updated_at=now()
          FROM eligible e
         WHERE dso.id=e.supplier_offer_id
           AND dso.active=false
        RETURNING dso.id
      ), offer_changed AS (
        UPDATE public.vendor_offers vo
           SET status=CASE WHEN vo.status IN ('draft','archived') THEN 'approved'::public.offer_status ELSE vo.status END,
               merchant_visible=true,
               merchant_pause_active=false,
               merchant_visibility_updated_by=NULL,
               merchant_visibility_updated_at=now(),
               source_payload=COALESCE(vo.source_payload,'{}'::jsonb)
                 || jsonb_build_object('publicationState','PUBLISHED','publishedBy','symphonya_auto_publication'),
               updated_at=now()
          FROM eligible e
         WHERE vo.id=e.offer_id
        RETURNING vo.id,vo.vendor_id,vo.public_id
      ), audit_events AS (
        INSERT INTO public.vendor_catalog_visibility_events(
          vendor_id,offer_id,scope,visible,actor_id,metadata
        )
        SELECT vendor_id,id,'product',true,NULL,
               jsonb_build_object(
                 'source','symphonya_auto_publication',
                 'channel','dropshipping',
                 'supplier',$1,
                 'offer_public_id',public_id
               )
          FROM offer_changed
        RETURNING id
      )
      SELECT count(*)::int published FROM eligible
    `, [SUPPLIER_CODE, PUBLICATION_BATCH_SIZE]);
    published = Number(result.rows[0]?.published ?? 0);
  }

  return {
    categoryCandidates: candidates.rowCount ?? candidates.rows.length,
    categorized,
    unmapped: Math.max(0, (candidates.rowCount ?? candidates.rows.length) - categorized),
    publicationEnabled,
    orderForwardingEnabled,
    published
  };
}

function optionalText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function requiredText(value: unknown, label: string): string {
  const text = optionalText(value);
  if (!text) throw new Error(`${label} is required`);
  return text;
}
