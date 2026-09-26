import { createHash } from "node:crypto";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import { runZendropShopifyInventorySweep } from "../../../../lib/zendrop-shopify-inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

const INVENTORY_LIMIT = 100;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const cronAuthorized = Boolean(cronSecret) && request.headers.get("authorization") === `Bearer ${cronSecret}`;
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  const manualAuthorized = cronAuthorized ? false : await consumeManualToken(token);

  if (!cronAuthorized && !manualAuthorized) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  try {
    const startedAt = Date.now();
    const inventory = await runZendropShopifyInventorySweep(Date.now(), INVENTORY_LIMIT);
    const publication = await reconcileZendropPublication();

    return Response.json({
      ok: true,
      mode: cronAuthorized ? "cron" : "manual_once",
      inventory,
      publication,
      elapsedMs: Date.now() - startedAt
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "zendrop_inventory_sync_failed";
    console.error(JSON.stringify({
      level: "error",
      event: "zendrop.shopify_inventory_cron_failed",
      message,
      at: new Date().toISOString()
    }));
    return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

async function reconcileZendropPublication(): Promise<Readonly<{
  hidden: number;
  published: number;
}>> {
  const pool = getProductionPostgresRuntime().sqlPool;

  const hiddenResult = await pool.query(`
    WITH unsafe AS (
      SELECT vo.id offer_id,dso.id supplier_offer_id
      FROM public.vendor_offers vo
      JOIN public.dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
      JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
      WHERE ds.code='zendrop'
        AND (
          COALESCE(dso.cached_available,false)=false
          OR COALESCE(dso.cached_quantity,0)<=0
          OR dso.availability_expires_at IS NULL
          OR dso.availability_expires_at<=now()
          OR COALESCE((dso.availability_payload->>'greeceShippingAvailable')::boolean,false)=false
          OR vo.customer_price_minor<=0
          OR COALESCE(vo.source_payload->>'pricingPending','true')<>'false'
        )
    ), dso_hidden AS (
      UPDATE public.dropship_supplier_offers dso
      SET active=false,updated_at=now()
      FROM unsafe u WHERE dso.id=u.supplier_offer_id
      RETURNING dso.id
    ), vo_hidden AS (
      UPDATE public.vendor_offers vo
      SET merchant_visible=false,
          merchant_pause_active=false,
          source_payload=COALESCE(vo.source_payload,'{}'::jsonb)
            || jsonb_build_object('publicationState','STAGED','publishedBy','zendrop_shopify_bridge_v1'),
          updated_at=now()
      FROM unsafe u WHERE vo.id=u.offer_id
      RETURNING vo.id
    )
    SELECT count(*)::int hidden FROM vo_hidden
  `);

  const publishedResult = await pool.query(`
    WITH eligible AS (
      SELECT vo.id offer_id,vo.vendor_id,cv.id canonical_id,cv.family_id,dso.id supplier_offer_id
      FROM public.vendor_offers vo
      JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN public.dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
      JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
      JOIN public.dropship_shopify_bridge_variants bridge
        ON bridge.supplier_id=dso.supplier_id
       AND bridge.external_variant_id=dso.external_variant_id
      WHERE ds.code='zendrop'
        AND ds.active=true
        AND bridge.sync_status='synced'
        AND cv.category_id IS NOT NULL
        AND cv.family_id IS NOT NULL
        AND cv.suppressed=false
        AND cv.recalled=false
        AND COALESCE(dso.cached_available,false)=true
        AND COALESCE(dso.cached_quantity,0)>0
        AND dso.availability_expires_at>now()
        AND COALESCE((dso.availability_payload->>'greeceShippingAvailable')::boolean,false)=true
        AND vo.customer_price_minor>0
        AND COALESCE(vo.source_payload->>'pricingPending','true')='false'
    ), families AS (
      UPDATE public.product_families pf
      SET active=true,updated_at=now()
      FROM eligible e WHERE pf.id=e.family_id AND pf.active=false
      RETURNING pf.id
    ), canonicals AS (
      UPDATE public.canonical_variants cv
      SET active=true,updated_at=now()
      FROM eligible e WHERE cv.id=e.canonical_id AND cv.active=false
      RETURNING cv.id
    ), suppliers AS (
      UPDATE public.dropship_supplier_offers dso
      SET active=true,updated_at=now()
      FROM eligible e WHERE dso.id=e.supplier_offer_id AND dso.active=false
      RETURNING dso.id
    ), offers AS (
      UPDATE public.vendor_offers vo
      SET status='approved',
          merchant_visible=true,
          merchant_pause_active=false,
          source_payload=COALESCE(vo.source_payload,'{}'::jsonb)
            || jsonb_build_object(
              'publicationState','PUBLISHED',
              'publishedBy','zendrop_shopify_bridge_v1',
              'inventoryAuthority','shopify_bridge'
            ),
          updated_at=now()
      FROM eligible e
      WHERE vo.id=e.offer_id
        AND (
          vo.status::text<>'approved'
          OR vo.merchant_visible IS DISTINCT FROM true
          OR COALESCE(vo.source_payload->>'publicationState','')<>'PUBLISHED'
        )
      RETURNING vo.id
    )
    SELECT count(*)::int published FROM offers
  `);

  return {
    hidden: Number(hiddenResult.rows[0]?.hidden ?? 0),
    published: Number(publishedResult.rows[0]?.published ?? 0)
  };
}

async function consumeManualToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const tokenSha256 = createHash("sha256").update(token).digest("hex");
  const result = await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.catalog_sources
       SET metadata=COALESCE(metadata,'{}'::jsonb)-'zendropInventoryManual',
           updated_at=now()
     WHERE code='zendrop'
       AND active=true
       AND metadata #>> '{zendropInventoryManual,tokenSha256}'=$1
    RETURNING id
  `, [tokenSha256]);
  return Boolean(result.rows[0]?.id);
}
