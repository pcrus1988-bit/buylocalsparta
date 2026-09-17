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

  // Keep each Vercel invocation bounded to one supplier page. The production
  // state uses 100 products/page, so a cron run advances at most 100 products
  // while the lease in runSymphonyaCatalogueSyncSlice prevents overlap.
  const previousMaxPages = process.env.SYMPHONYA_SYNC_MAX_PAGES_PER_SLICE;
  process.env.SYMPHONYA_SYNC_MAX_PAGES_PER_SLICE = "1";

  try {
    const result = await runSymphonyaCatalogueSyncSlice();
    return Response.json({
      ok: true,
      mode: cronAuthorized ? "cron" : "manual_once",
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
  } finally {
    if (previousMaxPages === undefined) delete process.env.SYMPHONYA_SYNC_MAX_PAGES_PER_SLICE;
    else process.env.SYMPHONYA_SYNC_MAX_PAGES_PER_SLICE = previousMaxPages;
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
