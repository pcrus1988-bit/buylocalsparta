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

  // Scheduled cron runs stay deliberately small and fully enriched. A one-time
  // manually authorized completion run may scan multiple source pages while
  // deferring optional getProductDetails enrichment to the downstream content
  // stage. The supplier-scoped lease still prevents overlap in both modes.
  const mode = cronAuthorized ? "cron" : "manual_once";
  const resultOptions = cronAuthorized
    ? { maxPages: 1, enrichProductDetails: true, includeDescription: true }
    : { maxPages: 25, enrichProductDetails: false, includeDescription: false };

  try {
    const result = await runSymphonyaCatalogueSyncSlice(resultOptions);
    return Response.json({
      ok: true,
      mode,
      detailEnrichment: cronAuthorized ? "full" : "deferred",
      descriptionEnrichment: cronAuthorized ? "full" : "deferred",
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
