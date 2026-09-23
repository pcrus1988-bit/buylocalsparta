import { createHash } from "node:crypto";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import { runNovaAvailabilityRefreshSlice } from "../../../../lib/nova-availability-refresh-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

const FAILOVER_MIN_INTERVAL_SECONDS = 60;

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

async function claimFailoverStart(): Promise<boolean> {
  const result = await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.catalog_sources
    SET metadata=jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{novaAvailabilityFailover}',
          COALESCE(metadata->'novaAvailabilityFailover', '{}'::jsonb)
            || jsonb_build_object('lastStartedAt', now()),
          true
        ),
        updated_at=now()
    WHERE code='nova-brandsgateway'
      AND COALESCE(
        NULLIF(metadata #>> '{novaAvailabilityFailover,lastStartedAt}', '')::timestamptz,
        '-infinity'::timestamptz
      ) <= now() - make_interval(secs => $1::double precision)
    RETURNING id
  `, [FAILOVER_MIN_INTERVAL_SECONDS]);
  return result.rowCount === 1;
}

export async function GET(request: Request) {
  if (!(await isAuthorized(request))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // Failover invocations can overlap when an upstream scheduler retries or a previous
    // slice approaches the platform ceiling. Claim a cheap, atomic start window before
    // doing provider or projection work so duplicate invocations cannot amplify DB load.
    if (!(await claimFailoverStart())) {
      return Response.json(
        { ok: true, skipped: true, reason: "failover_start_throttled" },
        { status: 202, headers: { "cache-control": "no-store" } }
      );
    }

    // Keep the Vercel failover deliberately bounded. The full-catalogue worker is the
    // throughput path; this route shares the production DB with storefront traffic and
    // has a hard 55s runtime ceiling. Production still shows acquisition failures and
    // terminations with two-page slices, so process at most one checkpointed page here.
    const configured = Number(process.env.BLS_NOVA_AVAILABILITY_FAILOVER_PAGES_PER_RUN || 1);
    const maxPages = Number.isSafeInteger(configured) && configured > 0
      ? Math.min(configured, 1)
      : 1;
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
