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
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  const requestedPhase = url.searchParams.get("phase")?.trim() ?? "all";
  const allowedPhases = new Set(["all","materialization","pricing","enrichment","promotion","publication"]);
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
  process.env.BLS_SYMPHONYA_ENRICHMENT_PREPARATION_BATCH_SIZE = "10";
  process.env.BLS_CATALOGUE_ENRICHMENT_PROMOTION_BATCH_SIZE = "20";

  try {
    const runAll = phase === "all";
    const materialization = runAll || phase === "materialization" ? await runSymphonyaCatalogueMaterializationSlice() : null;
    const pricing = runAll || phase === "pricing" ? await runSymphonyaAutoPricingSlice() : null;
    const enrichment = runAll || phase === "enrichment" ? await runSymphonyaEnrichmentPreparationSlice() : null;
    const translationPromotion = runAll || phase === "promotion" ? await runCatalogueEnrichmentPromotionSlice() : null;
    const publication = runAll || phase === "publication" ? await runSymphonyaAutoPublicationSweep() : null;

    return Response.json({
      ok: true,
      mode: cronAuthorized ? "cron" : "manual_once",
      phase,
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
