import { createHash } from "node:crypto";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import { runSymphonyaCatalogueSyncSlice } from "../../../../lib/symphonya-catalogue-sync-runtime";

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

  // Complete the first full supplier cycle as quickly and safely as possible.
  // Until Symphonya has produced a genuine terminal page, scheduled runs use
  // the same bounded fast-catchup mode as manual completion. Once a completed
  // cycle marker exists, normal cron runs return to fully enriched pages.
  const completion = await getProductionPostgresRuntime().sqlPool.query(`
    SELECT (metadata ? 'symphonyaLastCompletedCycle') AS completed
      FROM public.catalog_sources
     WHERE code='symphonya'
       AND active=true
     LIMIT 1
  `);
  const initialCatchup = cronAuthorized && completion.rows[0]?.completed !== true;
  const mode = cronAuthorized ? (initialCatchup ? "cron_initial_catchup" : "cron") : "manual_once";
  const deferredEnrichment = initialCatchup || manualAuthorized;
  const resultOptions = deferredEnrichment
    ? { maxPages: 25, enrichProductDetails: false, includeDescription: false }
    : { maxPages: 1, enrichProductDetails: true, includeDescription: true };

  try {
    const result = await runSymphonyaCatalogueSyncSlice(resultOptions);
    return Response.json({
      ok: true,
      mode,
      detailEnrichment: deferredEnrichment ? "deferred" : "full",
      descriptionEnrichment: deferredEnrichment ? "deferred" : "full",
      ...result
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "symphonya_catalogue_sync_failed";
    console.error(JSON.stringify({
      level: "error",
      event: "symphonya.catalogue_cron_failed",
      message,
      at: new Date().toISOString()
    }));
    return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

async function consumeManualToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const tokenSha256 = createHash("sha256").update(token).digest("hex");
  const result = await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.catalog_sources
       SET metadata=COALESCE(metadata,'{}'::jsonb) - 'symphonyaManualSync',
           updated_at=now()
     WHERE code='symphonya'
       AND active=true
       AND metadata #>> '{symphonyaManualSync,tokenSha256}'=$1
    RETURNING id
  `, [tokenSha256]);
  return Boolean(result.rows[0]?.id);
}
