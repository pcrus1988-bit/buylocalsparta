import { createHash } from "node:crypto";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import { runNovaAvailabilityRefreshSlice } from "../../../../lib/nova-availability-refresh-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

async function isAuthorized(request: Request): Promise<boolean> {
  const authorization = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && authorization === `Bearer ${cronSecret}`) return true;

  const failoverToken = request.headers.get("x-kontamou-failover-token")?.trim() ?? "";
  if (!/^[a-f0-9]{64}$/i.test(failoverToken)) return false;

  const tokenSha256 = createHash("sha256").update(failoverToken).digest("hex");
  const result = await getProductionPostgresRuntime().sqlPool.query(`
    SELECT 1
    FROM public.catalog_sources
    WHERE code='nova-brandsgateway'
      AND metadata #>> '{novaAvailabilityFailoverAuth,tokenSha256}'=$1
      AND COALESCE(NULLIF(metadata #>> '{novaAvailabilityFailoverAuth,expiresAt}','')::timestamptz, '-infinity'::timestamptz) > now()
    LIMIT 1
  `, [tokenSha256]);
  return result.rowCount === 1;
}

export async function GET(request: Request) {
  if (!(await isAuthorized(request))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const configured = Number(process.env.BLS_NOVA_AVAILABILITY_FAILOVER_PAGES_PER_RUN || 20);
    const maxPages = Number.isSafeInteger(configured) && configured > 0
      ? Math.min(configured, 20)
      : 20;
    const result = await runNovaAvailabilityRefreshSlice(maxPages);
    console.info(JSON.stringify({
      level: "info",
      event: "nova.availability_vercel_failover",
      at: new Date().toISOString(),
      ...result
    }));
    return Response.json(
      { ok: true, ...result },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "nova_availability_failover_failed";
    console.error(JSON.stringify({
      level: "error",
      event: "nova.availability_vercel_failover_failed",
      at: new Date().toISOString(),
      message
    }));
    return Response.json(
      { error: message },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
