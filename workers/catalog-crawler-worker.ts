import { createServer, type Server } from "node:http";
import { hostname } from "node:os";
import { createPostgresRuntimeFromEnv, EXPECTED_SCHEMA_VERSION } from "../packages/postgres-runtime/src/index.ts";
import { CatalogCrawlerStore, CrawlJobCancelledError } from "./catalog-crawler/store.ts";
import { CrawlJobError, runCrawlJob } from "./catalog-crawler/runner.ts";

const env: NodeJS.ProcessEnv = { ...process.env };
if (!env.BLS_DB_POOL_MAX?.trim()) env.BLS_DB_POOL_MAX = "4";
if (!env.BLS_DB_IDLE_TIMEOUT_MS?.trim()) env.BLS_DB_IDLE_TIMEOUT_MS = "30000";
const runtime = createPostgresRuntimeFromEnv({ env, applicationName: "buy-local-sparta-crawler" });
const readiness = await runtime.readiness(EXPECTED_SCHEMA_VERSION);
if (!readiness.ok) {
  await runtime.close();
  throw new Error(`Catalogue crawler worker refused to start: ${readiness.message}`);
}

const workerId = process.env.BLS_CRAWLER_WORKER_ID?.trim() || `${hostname()}:${process.pid}`;
const pollMs = positive(process.env.BLS_CRAWLER_POLL_MS, 2_000, "BLS_CRAWLER_POLL_MS");
const leaseSeconds = bounded(process.env.BLS_CRAWLER_LEASE_SECONDS, 300, 30, 3600, "BLS_CRAWLER_LEASE_SECONDS");
const requestTimeoutMs = positive(process.env.BLS_CRAWLER_REQUEST_TIMEOUT_MS, 15_000, "BLS_CRAWLER_REQUEST_TIMEOUT_MS");
const maxAttempts = bounded(process.env.BLS_CRAWLER_MAX_ATTEMPTS, 5, 1, 20, "BLS_CRAWLER_MAX_ATTEMPTS");
const maxSitemaps = bounded(process.env.BLS_CRAWLER_MAX_SITEMAPS, 32, 1, 500, "BLS_CRAWLER_MAX_SITEMAPS");
const baseRetrySeconds = bounded(process.env.BLS_CRAWLER_RETRY_BASE_SECONDS, 30, 1, 3600, "BLS_CRAWLER_RETRY_BASE_SECONDS");
const healthPort = bounded(process.env.BLS_CRAWLER_HEALTH_PORT, 8081, 1, 65535, "BLS_CRAWLER_HEALTH_PORT");
const userAgent = process.env.BLS_CRAWLER_USER_AGENT?.trim() || "KONTAMOU-CatalogBot/1.0 (+https://kontamou.site/)";
const store = new CatalogCrawlerStore(runtime.sqlPool);
let stopping = false;
let currentJobId: string | undefined;
let lastActivityAt = Date.now();

const healthServer = await startHealthServer(healthPort, () => ({ stopping, currentJobId, lastActivityAt }));
const stop = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  lastActivityAt = Date.now();
  console.log(JSON.stringify({ level: "info", event: "catalog_crawler.worker_shutdown", workerId, signal, currentJobId }));
};
process.once("SIGTERM", () => void stop("SIGTERM"));
process.once("SIGINT", () => void stop("SIGINT"));

console.log(JSON.stringify({
  level: "info", event: "catalog_crawler.worker_started", workerId, pollMs, leaseSeconds, requestTimeoutMs,
  maxAttempts, maxSitemaps, healthPort, schema: readiness.appliedSchemaVersion
}));

try {
  while (!stopping) {
    const job = await store.claim(workerId, leaseSeconds);
    lastActivityAt = Date.now();
    if (!job) {
      await delay(pollMs);
      continue;
    }
    currentJobId = job.jobId;
    console.log(JSON.stringify({ level: "info", event: "catalog_crawler.job_claimed", workerId, jobId: job.jobId, sourceId: job.sourceId, mode: job.crawlMode, attempt: job.attemptCount }));
    try {
      const result = await runCrawlJob({ store, job, workerId, leaseSeconds, userAgent, requestTimeoutMs, maxSitemaps });
      lastActivityAt = Date.now();
      console.log(JSON.stringify({ level: "info", event: "catalog_crawler.job_completed", workerId, jobId: job.jobId, ...result }));
    } catch (error) {
      lastActivityAt = Date.now();
      if (error instanceof CrawlJobCancelledError) {
        console.log(JSON.stringify({ level: "info", event: "catalog_crawler.job_cancelled", workerId, jobId: job.jobId }));
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      const explicitlyTerminal = error instanceof CrawlJobError && error.terminal;
      const terminal = explicitlyTerminal || job.attemptCount >= maxAttempts;
      const retrySeconds = terminal ? 0 : Math.min(3600, baseRetrySeconds * Math.max(1, 2 ** Math.max(0, job.attemptCount - 1)));
      try {
        await store.retry(job.jobId, workerId, message, retrySeconds, terminal);
      } catch (retryError) {
        console.error(JSON.stringify({ level: "error", event: "catalog_crawler.job_retry_state_failed", workerId, jobId: job.jobId, message: retryError instanceof Error ? retryError.message : String(retryError) }));
      }
      console.error(JSON.stringify({ level: terminal ? "error" : "warn", event: terminal ? "catalog_crawler.job_failed" : "catalog_crawler.job_retried", workerId, jobId: job.jobId, attempt: job.attemptCount, retrySeconds, message }));
    } finally {
      currentJobId = undefined;
      lastActivityAt = Date.now();
    }
  }
} finally {
  await closeServer(healthServer);
  await runtime.close();
}

async function startHealthServer(port: number, state: () => { stopping: boolean; currentJobId?: string; lastActivityAt: number }): Promise<Server> {
  const server = createServer((request, response) => {
    if (request.url !== "/healthz") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "not_found" }));
      return;
    }
    const current = state();
    response.writeHead(current.stopping ? 503 : 200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ ok: !current.stopping, workerId, stopping: current.stopping, currentJobId: current.currentJobId ?? null, lastActivityAt: new Date(current.lastActivityAt).toISOString(), schema: readiness.appliedSchemaVersion }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => { server.off("error", reject); resolve(); });
  });
  return server;
}
function closeServer(server: Server): Promise<void> { return new Promise((resolve) => server.close(() => resolve())); }
function positive(raw: string | undefined, fallback: number, name: string): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}
function bounded(raw: string | undefined, fallback: number, min: number, max: number, name: string): number {
  const value = raw?.trim() ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}
function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
