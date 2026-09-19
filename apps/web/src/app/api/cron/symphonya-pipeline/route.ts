import { createHash } from "node:crypto";
import { runCatalogueEnrichmentPromotionSlice } from "../../../../lib/catalogue-enrichment-promotion-runtime";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import { runSymphonyaAutoPricingSlice } from "../../../../lib/symphonya-auto-pricing-runtime";
import { runSymphonyaAutoPublicationSweep } from "../../../../lib/symphonya-auto-publication-runtime";
import { runSymphonyaCatalogueMaterializationSlice } from "../../../../lib/symphonya-catalogue-materializer";
import { runSymphonyaDeterministicTranslationPromotionSlice, runSymphonyaEnrichmentPreparationSlice } from "../../../../lib/symphonya-enrichment-runtime";
import { refreshSymphonyaOfferStockByExternalIds } from "../../../../lib/symphonya-stock-sync-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const cronAuthorized = Boolean(cronSecret) && request.headers.get("authorization") === `Bearer ${cronSecret}`;
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  const requestedPhase = url.searchParams.get("phase")?.trim() ?? "all";
  const allowedPhases = new Set(["all","materialization","pricing","enrichment","fallback","promotion","stock","publication"]);
  const phase = allowedPhases.has(requestedPhase) ? requestedPhase : "all";
  const manualAuthorized = cronAuthorized ? false : await consumeManualToken(token);

  if (!cronAuthorized && !manualAuthorized) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  const previous = {
    materialization: process.env.BLS_SYMPHONYA_MATERIALIZATION_BATCH_SIZE,
    pricing: process.env.BLS_SYMPHONYA_AUTO_PRICING_BATCH_SIZE,
    enrichment: process.env.BLS_SYMPHONYA_ENRICHMENT_PREPARATION_BATCH_SIZE,
    promotion: process.env.BLS_CATALOGUE_ENRICHMENT_PROMOTION_BATCH_SIZE
  };
  process.env.BLS_SYMPHONYA_MATERIALIZATION_BATCH_SIZE = "10";
  process.env.BLS_SYMPHONYA_AUTO_PRICING_BATCH_SIZE = "100";
  process.env.BLS_SYMPHONYA_ENRICHMENT_PREPARATION_BATCH_SIZE = "50";
  process.env.BLS_CATALOGUE_ENRICHMENT_PROMOTION_BATCH_SIZE = "50";

  try {
    const runAll = phase === "all";
    const materialization = runAll || phase === "materialization" ? await runSymphonyaCatalogueMaterializationSlice() : null;
    const pricing = runAll || phase === "pricing" ? await runSymphonyaAutoPricingSlice() : null;
    const enrichment = runAll || phase === "enrichment" ? await runSymphonyaEnrichmentPreparationSlice() : null;
    const deterministicTranslationPromotion = runAll || phase === "enrichment" || phase === "fallback"
      ? await runSymphonyaDeterministicTranslationPromotionSlice()
      : null;
    const translationPromotion = runAll || phase === "promotion" ? await runCatalogueEnrichmentPromotionSlice() : null;
    // Dedicated stock cron owns automatic supplier I/O. Keeping getStock out of
    // the normal all-phase run prevents the bounded pipeline from spending its
    // remaining 55s budget on a second network workload. Manual phase=stock is
    // retained for operator diagnostics.
    const stockIds = phase === "stock" ? await publicationCandidateExternalIds(15) : [];
    const stock = phase === "stock"
      ? (stockIds.length
          ? { selected: stockIds.length, offersUpdated: await refreshSymphonyaOfferStockByExternalIds(stockIds) }
          : { selected: 0, offersUpdated: 0 })
      : null;
    const publication = runAll || phase === "publication" ? await runSymphonyaAutoPublicationSweep() : null;

    return Response.json({
      ok: true,
      mode: cronAuthorized ? "cron" : "manual_once",
      phase,
      materialization,
      pricing,
      enrichment,
      deterministicTranslationPromotion,
      translationPromotion,
      stock,
      publication
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "symphonya_pipeline_failed";
    console.error(JSON.stringify({
      level: "error",
      event: "symphonya.pipeline_cron_failed",
      message,
      at: new Date().toISOString()
    }));
    return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  } finally {
    restore("BLS_SYMPHONYA_MATERIALIZATION_BATCH_SIZE", previous.materialization);
    restore("BLS_SYMPHONYA_AUTO_PRICING_BATCH_SIZE", previous.pricing);
    restore("BLS_SYMPHONYA_ENRICHMENT_PREPARATION_BATCH_SIZE", previous.enrichment);
    restore("BLS_CATALOGUE_ENRICHMENT_PROMOTION_BATCH_SIZE", previous.promotion);
  }
}

async function publicationCandidateExternalIds(limit: number): Promise<string[]> {
  const result = await getProductionPostgresRuntime().sqlPool.query(`
    SELECT dso.external_product_id
      FROM public.dropship_supplier_offers dso
      JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
      JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
      JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
     WHERE ds.code='symphonya'
       AND ds.active=true
       AND ds.api_authoritative_availability=true
       AND cv.category_id IS NOT NULL
       AND cv.family_id IS NOT NULL
       AND cv.suppressed=false
       AND cv.recalled=false
       AND (
         vo.status::text IN ('draft','approved')
         OR (
           vo.status::text='archived'
           AND COALESCE(vo.source_payload->>'publishedBy','')='symphonya_auto_publication'
           AND COALESCE(vo.source_payload->>'publicationState','')='PUBLISHED'
         )
       )
       AND COALESCE(vo.source_payload->>'pricingManagedBy','')='symphonya_auto_v1'
       AND COALESCE(vo.source_payload->>'pricingPending','true')='false'
       AND dso.supplier_cost_minor>0
       AND vo.customer_price_minor>=dso.supplier_cost_minor
       AND dso.cached_available=true
       AND COALESCE(dso.cached_quantity,0)>0
       AND COALESCE(dso.availability_payload->>'priceHeld','false')<>'true'
       AND EXISTS (
         SELECT 1
           FROM public.product_translations pt
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
     GROUP BY dso.external_product_id
     ORDER BY min(dso.availability_expires_at) ASC NULLS FIRST,
              min(dso.availability_checked_at) ASC NULLS FIRST,
              dso.external_product_id
     LIMIT $1
  `, [Math.max(1, Math.min(50, limit))]);
  return result.rows.map((row) => String(row.external_product_id ?? "").trim()).filter(Boolean);
}

async function consumeManualToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const tokenSha256 = createHash("sha256").update(token).digest("hex");
  const result = await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.catalog_sources
       SET metadata=COALESCE(metadata,'{}'::jsonb)-'symphonyaPipelineManual',
           updated_at=now()
     WHERE code='symphonya'
       AND active=true
       AND metadata #>> '{symphonyaPipelineManual,tokenSha256}'=$1
    RETURNING id
  `, [tokenSha256]);
  return Boolean(result.rows[0]?.id);
}

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
