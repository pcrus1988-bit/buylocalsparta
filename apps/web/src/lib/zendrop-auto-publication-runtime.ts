import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const SUPPLIER_CODE="zendrop";
const DEFAULT_BATCH_SIZE=250;
const MAX_BATCH_SIZE=1000;

export type ZendropAutoPublicationResult=Readonly<{
  enabled:boolean;
  eligible:number;
  published:number;
  hiddenOutOfStock:number;
}>;

/**
 * Publication eligibility is commerce-only:
 * canonical taxonomy + valid pricing + exact Shopify bridge mapping + fresh
 * authoritative Shopify stock. Product translations/localization are never
 * consulted and therefore cannot block publication.
 */
export async function runZendropAutoPublicationSlice(
  limit=batchSize()
):Promise<ZendropAutoPublicationResult>{
  const pool=getProductionPostgresRuntime().sqlPool;
  const supplier=await pool.query<SqlRow>(`
    SELECT id
      FROM public.dropship_suppliers
     WHERE code=$1
       AND active=true
       AND catalogue_sync_enabled=true
       AND api_authoritative_availability=true
       AND configuration->>'shopifyInventoryAuthoritative'='true'
     LIMIT 1
  `,[SUPPLIER_CODE]);
  if(!supplier.rows[0]) return {enabled:false,eligible:0,published:0,hiddenOutOfStock:0};

  const cap=Math.max(1,Math.min(MAX_BATCH_SIZE,limit));

  // First fail closed for mapped Zendrop offers whose Shopify-backed stock is
  // zero/stale. This keeps an already-published offer from lingering sellable.
  const hidden=await pool.query<SqlRow>(`
    WITH unsafe AS MATERIALIZED (
      SELECT vo.id offer_id,dso.id supplier_offer_id
        FROM public.dropship_supplier_offers dso
        JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
        JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
       WHERE ds.code=$1
         AND ds.active=true
         AND (
           dso.cached_available IS DISTINCT FROM true
           OR COALESCE(dso.cached_quantity,0)<=0
           OR dso.availability_expires_at IS NULL
           OR dso.availability_expires_at<=now()
           OR COALESCE((dso.availability_payload->>'greeceShippingAvailable')::boolean,false)=false
           OR NOT EXISTS (
             SELECT 1
               FROM public.dropship_shopify_bridge_variants bridge
              WHERE bridge.supplier_id=dso.supplier_id
                AND bridge.external_variant_id=dso.external_variant_id
                AND bridge.sync_status='synced'
           )
         )
         AND (
           dso.active=true
           OR vo.merchant_visible=true
           OR vo.merchant_pause_active=false
         )
       ORDER BY vo.id
       LIMIT $2
    ), supplier_hidden AS (
      UPDATE public.dropship_supplier_offers dso
         SET active=false,updated_at=now()
        FROM unsafe u
       WHERE dso.id=u.supplier_offer_id
         AND dso.active=true
       RETURNING dso.id
    ), offer_hidden AS (
      UPDATE public.vendor_offers vo
         SET merchant_visible=false,
             merchant_pause_active=true,
             merchant_visibility_updated_by=NULL,
             merchant_visibility_updated_at=now(),
             source_payload=COALESCE(vo.source_payload,'{}'::jsonb)
               || jsonb_build_object(
                    'publicationState','STOCK_UNAVAILABLE',
                    'publishedBy','zendrop_auto_publication',
                    'stockAuthority','shopify_bridge_inventory_quantity'
                  ),
             updated_at=now()
        FROM unsafe u
       WHERE vo.id=u.offer_id
         AND (vo.merchant_visible=true OR vo.merchant_pause_active=false)
       RETURNING vo.id
    )
    SELECT count(*)::int hidden FROM offer_hidden
  `,[SUPPLIER_CODE,cap]);
  const hiddenOutOfStock=Number(hidden.rows[0]?.hidden??0);

  const result=await pool.query<SqlRow>(`
    WITH eligible AS MATERIALIZED (
      SELECT
        vo.id offer_id,
        vo.vendor_id,
        vo.public_id,
        cv.id canonical_id,
        cv.family_id,
        dso.id supplier_offer_id
      FROM public.dropship_supplier_offers dso
      JOIN public.dropship_suppliers ds
        ON ds.id=dso.supplier_id
       AND ds.code=$1
       AND ds.active=true
       AND ds.catalogue_sync_enabled=true
       AND ds.api_authoritative_availability=true
      JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
      JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN public.product_families pf ON pf.id=cv.family_id
      JOIN public.dropship_shopify_bridge_variants bridge
        ON bridge.supplier_id=dso.supplier_id
       AND bridge.external_variant_id=dso.external_variant_id
       AND bridge.sync_status='synced'
      WHERE cv.category_id IS NOT NULL
        AND cv.family_id IS NOT NULL
        AND cv.suppressed=false
        AND cv.recalled=false
        AND vo.status::text IN ('draft','approved','archived')
        AND COALESCE(vo.source_payload->>'pricingManagedBy','')='zendrop_gr_v2'
        AND COALESCE(vo.source_payload->>'pricingPending','true')='false'
        AND dso.supplier_cost_minor>0
        AND vo.customer_price_minor>0
        AND vo.customer_price_minor>=dso.supplier_cost_minor
        AND dso.cached_available=true
        AND COALESCE(dso.cached_quantity,0)>0
        AND dso.availability_expires_at IS NOT NULL
        AND dso.availability_expires_at>now()
        AND COALESCE((dso.availability_payload->>'greeceShippingAvailable')::boolean,false)=true
        AND COALESCE((
          SELECT s.status::text
            FROM public.vendor_product_submissions s
           WHERE s.vendor_id=vo.vendor_id
             AND s.canonical_variant_id=vo.canonical_variant_id
           ORDER BY s.updated_at DESC,s.id DESC
           LIMIT 1
        ),'')<>'archived'
        AND NOT EXISTS (
          SELECT 1
            FROM public.vendor_product_activation_requests ar
           WHERE ar.offer_id=vo.id
             AND ar.status='pending'
        )
        AND (
          pf.active=false
          OR cv.active=false
          OR dso.active=false
          OR vo.status::text<>'approved'
          OR vo.merchant_visible IS DISTINCT FROM true
          OR vo.merchant_pause_active IS DISTINCT FROM false
          OR COALESCE(vo.source_payload->>'publicationState','')<>'PUBLISHED'
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
         SET status=CASE
               WHEN vo.status IN ('draft','archived') THEN 'approved'::public.offer_status
               ELSE vo.status
             END,
             merchant_visible=true,
             merchant_pause_active=false,
             merchant_visibility_updated_by=NULL,
             merchant_visibility_updated_at=now(),
             source_payload=COALESCE(vo.source_payload,'{}'::jsonb)
               || jsonb_build_object(
                    'publicationState','PUBLISHED',
                    'publishedBy','zendrop_auto_publication',
                    'stockAuthority','shopify_bridge_inventory_quantity',
                    'localizationRequiredForPublication',false,
                    'sourceLanguageFallbackAllowed',true
                  ),
             updated_at=now()
        FROM eligible e
       WHERE vo.id=e.offer_id
      RETURNING vo.id,vo.vendor_id,vo.public_id
    ), audit_events AS (
      INSERT INTO public.vendor_catalog_visibility_events(
        vendor_id,offer_id,scope,visible,actor_id,metadata
      )
      SELECT
        e.vendor_id,
        e.offer_id,
        'product',
        true,
        NULL,
        jsonb_build_object(
          'source','zendrop_auto_publication',
          'channel','dropshipping',
          'localizationRequiredForPublication',false
        )
      FROM eligible e
      JOIN offer_changed changed ON changed.id=e.offer_id
      RETURNING id
    )
    SELECT
      (SELECT count(*)::int FROM eligible) eligible,
      (SELECT count(*)::int FROM offer_changed) published
  `,[SUPPLIER_CODE,cap]);

  return {
    enabled:true,
    eligible:Number(result.rows[0]?.eligible??0),
    published:Number(result.rows[0]?.published??0),
    hiddenOutOfStock
  };
}

function batchSize():number{
  const value=Number(process.env.ZENDROP_PUBLICATION_BATCH_SIZE??DEFAULT_BATCH_SIZE);
  return Number.isSafeInteger(value)&&value>0?Math.min(MAX_BATCH_SIZE,value):DEFAULT_BATCH_SIZE;
}
