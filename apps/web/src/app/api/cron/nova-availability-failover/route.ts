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
    // Railway is no longer the throughput path. Keep the proven two-page supplier/DB
    // unit that completes quickly in production, but execute several checkpointed
    // slices inside one Vercel invocation. This avoids the nonlinear timeout seen when
    // eight pages were persisted as one large batch while still completing a full
    // supplier cycle comfortably inside the two-hour availability TTL.
    const SLICE_PAGES = 2;
    const DEFAULT_TOTAL_PAGE_BUDGET = 12;
    const MAX_TOTAL_PAGE_BUDGET = 12;
    const RUN_BUDGET_MS = 40_000;
    const configured = Number(
      process.env.BLS_NOVA_AVAILABILITY_FAILOVER_PAGES_PER_RUN || DEFAULT_TOTAL_PAGE_BUDGET
    );
    const totalPageBudget = Number.isSafeInteger(configured) && configured > 0
      ? Math.min(configured, MAX_TOTAL_PAGE_BUDGET)
      : DEFAULT_TOTAL_PAGE_BUDGET;

    const startedAt = Date.now();
    let claimed = false;
    let startPage = 1;
    let nextPage = 1;
    let pageSize = 100;
    let pagesProcessed = 0;
    let attemptedProducts = 0;
    let refreshedProducts = 0;
    let updatedOffers = 0;
    let cycleCompleted = false;
    let slices = 0;

    while (
      pagesProcessed < totalPageBudget
      && Date.now() - startedAt < RUN_BUDGET_MS
    ) {
      const remainingPages = totalPageBudget - pagesProcessed;
      const slice = await runNovaAvailabilityRefreshSlice(
        Math.min(SLICE_PAGES, remainingPages)
      );
      slices += 1;

      if (!slice.claimed) break;
      if (!claimed) startPage = slice.startPage;
      claimed = true;
      nextPage = slice.nextPage;
      pageSize = slice.pageSize;
      pagesProcessed += slice.pagesProcessed;
      attemptedProducts += slice.attemptedProducts;
      refreshedProducts += slice.refreshedProducts;
      updatedOffers += slice.updatedOffers;
      cycleCompleted = slice.cycleCompleted;

      if (slice.cycleCompleted || slice.pagesProcessed === 0) break;
    }

    const result = {
      claimed,
      startPage,
      nextPage,
      pageSize,
      pagesProcessed,
      attemptedProducts,
      refreshedProducts,
      updatedOffers,
      cycleCompleted,
      slices,
      elapsedMs: Date.now() - startedAt
    };
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
