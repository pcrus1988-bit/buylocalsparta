import { createHash } from "node:crypto";
import { runSymphonyaCatalogueSyncSlice } from "../../../../lib/symphonya-catalogue-sync-runtime";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });

  const tokenSha256 = createHash("sha256").update(token).digest("hex");
  const pool = getProductionPostgresRuntime().sqlPool;

  const claimed = await pool.query(`
    UPDATE public.catalog_sources
       SET metadata=COALESCE(metadata,'{}'::jsonb) - 'symphonyaManualSync',
           updated_at=now()
     WHERE code='symphonya'
       AND metadata #>> '{symphonyaManualSync,tokenSha256}' = $1
    RETURNING id
  `, [tokenSha256]);

  if (!claimed.rowCount) {
    return Response.json({ error: "unauthorized_or_consumed" }, { status: 401 });
  }

  try {
    const result = await runSymphonyaCatalogueSyncSlice();
    return Response.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "symphonya_catalogue_sync_failed";
    console.error(JSON.stringify({ level: "error", event: "symphonya.catalogue_manual_sync_failed", message }));
    return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
