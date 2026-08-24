import { randomUUID } from "node:crypto";
import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import { CatalogCrawlerStore, CrawlJobCancelledError } from "../../../../../../../workers/catalog-crawler/store.ts";
import { CrawlJobError, runCrawlJob } from "../../../../../../../workers/catalog-crawler/runner.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 700;

const CRON_SCHEDULE = "* * * * *";
const SLICE_MS = 10 * 60 * 1000;
const LEASE_SECONDS = 720;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_SITEMAPS = 32;
const USER_AGENT = "KONTAMOU-CatalogBot/1.0 (+https://kontamou.site/)";

class CrawlSliceYieldError extends Error {
  constructor() {
    super("catalogue crawler processing slice completed");
    this.name = "CrawlSliceYieldError";
  }
}

class TimeSlicedCatalogCrawlerStore extends CatalogCrawlerStore {
  constructor(
    db: ConstructorParameters<typeof CatalogCrawlerStore>[0],
    private readonly deadlineAt: number
  ) {
    super(db);
  }

  override async renew(jobId: string, workerId: string, leaseSeconds: number): Promise<void> {
    await super.renew(jobId, workerId, leaseSeconds);
    if (Date.now() >= this.deadlineAt) throw new CrawlSliceYieldError();
  }
}

export async function GET(request: Request) {
  if (!authorizedSchedulerRequest(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const workerId = `vercel-cron:${process.env.VERCEL_REGION ?? "unknown"}:${randomUUID()}`;
  const runtimeDb = getProductionPostgresRuntime();

  // Only one live catalogue worker is allowed at a time. This keeps crawl rate
  // limits meaningful even though Vercel invokes the scheduler every minute.
  const activeResult = await runtimeDb.sqlPool.query<SqlRow>(`
    SELECT count(*)::integer AS active_count
    FROM public.catalog_web_crawl_jobs
    WHERE status='running' AND lease_expires_at IS NOT NULL AND lease_expires_at>now()
  `);
  const activeCount = Number(activeResult.rows[0]?.active_count ?? 0);
  if (activeCount > 0) {
    return Response.json({ ok: true, claimed: false, busy: true, activeCount }, { headers: { "cache-control": "no-store" } });
  }

  const store = new TimeSlicedCatalogCrawlerStore(runtimeDb.sqlPool, Date.now() + SLICE_MS);

  let job: Awaited<ReturnType<CatalogCrawlerStore["claim"]>>;
  try {
    job = await store.claim(workerId, LEASE_SECONDS);
  } catch (error) {
    const message = errorMessage(error);
    console.error(JSON.stringify({ level: "error", event: "catalog_crawler.cron_claim_failed", workerId, message }));
    return Response.json({ ok: false, error: message }, { status: 500 });
  }

  if (!job) {
    return Response.json({ ok: true, claimed: false }, { headers: { "cache-control": "no-store" } });
  }

  console.log(JSON.stringify({
    level: "info",
    event: "catalog_crawler.cron_job_claimed",
    workerId,
    jobId: job.jobId,
    sourceId: job.sourceId,
    mode: job.crawlMode,
    attempt: job.attemptCount
  }));

  try {
    const result = await runCrawlJob({
      store,
      job,
      workerId,
      leaseSeconds: LEASE_SECONDS,
      userAgent: process.env.BLS_CRAWLER_USER_AGENT?.trim() || USER_AGENT,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      maxSitemaps: MAX_SITEMAPS
    });
    console.log(JSON.stringify({ level: "info", event: "catalog_crawler.cron_job_completed", workerId, jobId: job.jobId, ...result }));
    return Response.json({ ok: true, claimed: true, jobId: job.jobId, status: "completed", ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof CrawlJobCancelledError) {
      console.log(JSON.stringify({ level: "info", event: "catalog_crawler.cron_job_cancelled", workerId, jobId: job.jobId }));
      return Response.json({ ok: true, claimed: true, jobId: job.jobId, status: "cancelled" }, { headers: { "cache-control": "no-store" } });
    }

    if (error instanceof CrawlSliceYieldError) {
      try {
        await store.retry(job.jobId, workerId, "Crawler continuing automatically in the next processing slice", 1, false);
        console.log(JSON.stringify({ level: "info", event: "catalog_crawler.cron_job_yielded", workerId, jobId: job.jobId }));
        return Response.json({ ok: true, claimed: true, jobId: job.jobId, status: "continuing" }, { headers: { "cache-control": "no-store" } });
      } catch (retryError) {
        const message = errorMessage(retryError);
        console.error(JSON.stringify({ level: "error", event: "catalog_crawler.cron_yield_failed", workerId, jobId: job.jobId, message }));
        return Response.json({ ok: false, jobId: job.jobId, error: message }, { status: 500 });
      }
    }

    const message = errorMessage(error);
    const terminal = error instanceof CrawlJobError && error.terminal;
    const retrySeconds = terminal ? 0 : Math.min(900, 30 * Math.max(1, 2 ** Math.min(5, Math.max(0, job.attemptCount - 1))));
    try {
      await store.retry(job.jobId, workerId, message, retrySeconds, terminal);
    } catch (retryError) {
      const retryMessage = errorMessage(retryError);
      console.error(JSON.stringify({ level: "error", event: "catalog_crawler.cron_retry_state_failed", workerId, jobId: job.jobId, message: retryMessage }));
      return Response.json({ ok: false, jobId: job.jobId, error: retryMessage }, { status: 500 });
    }

    console.error(JSON.stringify({
      level: terminal ? "error" : "warn",
      event: terminal ? "catalog_crawler.cron_job_failed" : "catalog_crawler.cron_job_retried",
      workerId,
      jobId: job.jobId,
      retrySeconds,
      message
    }));
    return Response.json({ ok: !terminal, claimed: true, jobId: job.jobId, status: terminal ? "failed" : "retrying", retrySeconds, error: message }, { headers: { "cache-control": "no-store" } });
  }
}

function authorizedSchedulerRequest(request: Request): boolean {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (configuredSecret) return request.headers.get("authorization") === `Bearer ${configuredSecret}`;

  // Vercel documents `vercel-cron/1.0` for scheduler invocations and supplies
  // the deployed cron expression in x-vercel-cron-schedule. This fallback is
  // intentionally limited to a parameterless worker that can only consume
  // already-admin-authorized jobs; it cannot create or alter crawl scope.
  const userAgent = request.headers.get("user-agent")?.trim().toLowerCase();
  const schedule = request.headers.get("x-vercel-cron-schedule")?.trim();
  return userAgent === "vercel-cron/1.0" && schedule === CRON_SCHEDULE;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
