import { createHash } from "node:crypto";
import { runCatalogueEnrichmentPromotionSlice } from "../../../../lib/catalogue-enrichment-promotion-runtime";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import { runSymphonyaAutoPricingSlice } from "../../../../lib/symphonya-auto-pricing-runtime";
import { runSymphonyaAutoPublicationSweep } from "../../../../lib/symphonya-auto-publication-runtime";
import { runSymphonyaCatalogueMaterializationSlice } from "../../../../lib/symphonya-catalogue-materializer";
import { runSymphonyaEnrichmentPreparationSlice } from "../../../../lib/symphonya-enrichment-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const cronAuthorized = Boolean(cronSecret) && request.headers.get("authorization") === `Bearer ${cronSecret}`;
  const token = new URL(request.url).searchParams.get("token")?.trim();
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
  process.env.BLS_SYMPHONYA_MATERIALIZATION_BATCH_SIZE = "25";
  process.env.BLS_SYMPHONYA_AUTO_PRICING_BATCH_SIZE = "500";
  process.env.BLS_SYMPHONYA_ENRICHMENT_PREPARATION_BATCH_SIZE = "25";
  process.env.BLS_CATALOGUE_ENRICHMENT_PROMOTION_BATCH_SIZE = "50";

  try {
    const materialization = await runSymphonyaCatalogueMaterializationSlice();
    const pricing = await runSymphonyaAutoPricingSlice();
    const enrichment = await runSymphonyaEnrichmentPreparationSlice();
    const translationPromotion = await runCatalogueEnrichmentPromotionSlice();
    const publication = await runSymphonyaAutoPublicationSweep();

    return Response.json({
      ok: true,
      mode: cronAuthorized ? "cron" : "manual_once",
      materialization,
      pricing,
      enrichment,
      translationPromotion,
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
