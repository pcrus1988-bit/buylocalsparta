import { createServer, type Server } from "node:http";
import { hostname } from "node:os";
import {
  DEFAULT_OPEN_ICECAT_CONTROL,
  OPEN_ICECAT_DETAIL_PROCESSING_VERSION,
  OpenIcecatClient,
  OpenIcecatRequestError,
  PostgresUnitOfWork,
  isValidGtin,
  openIcecatControlFromMetadata,
  type OpenIcecatControlSettings,
  type OpenIcecatDetailJob,
  type SqlRow
} from "../packages/core/src/index.ts";
import { createPostgresRuntimeFromEnv, EXPECTED_SCHEMA_VERSION } from "../packages/postgres-runtime/src/index.ts";

const env: NodeJS.ProcessEnv = { ...process.env };
if (!env.BLS_DB_POOL_MAX?.trim()) env.BLS_DB_POOL_MAX = "4";
if (!env.BLS_DB_IDLE_TIMEOUT_MS?.trim()) env.BLS_DB_IDLE_TIMEOUT_MS = "30000";

const runtime = createPostgresRuntimeFromEnv({ env, applicationName: "buy-local-sparta-open-icecat-detail" });
const readiness = await runtime.readiness(EXPECTED_SCHEMA_VERSION);
if (!readiness.ok) {
  await runtime.close();
  throw new Error(`Open Icecat detail worker refused to start: ${readiness.message}`);
}

const workerId = process.env.BLS_OPEN_ICECAT_DETAIL_WORKER_ID?.trim() || `${hostname()}:${process.pid}`;
const healthPort = bounded(process.env.BLS_OPEN_ICECAT_DETAIL_HEALTH_PORT, 8083, 1, 65535, "BLS_OPEN_ICECAT_DETAIL_HEALTH_PORT");
const runOnce = process.env.BLS_OPEN_ICECAT_DETAIL_RUN_ONCE === "true";
const fallbackControl: OpenIcecatControlSettings = {
  ...DEFAULT_OPEN_ICECAT_CONTROL,
  detailPollMs: positive(process.env.BLS_OPEN_ICECAT_DETAIL_POLL_MS, DEFAULT_OPEN_ICECAT_CONTROL.detailPollMs, "BLS_OPEN_ICECAT_DETAIL_POLL_MS"),
  detailSyncIntervalMs: bounded(process.env.BLS_OPEN_ICECAT_DETAIL_SYNC_INTERVAL_MS, DEFAULT_OPEN_ICECAT_CONTROL.detailSyncIntervalMs, 10_000, 86_400_000, "BLS_OPEN_ICECAT_DETAIL_SYNC_INTERVAL_MS"),
  detailBatchSize: bounded(process.env.BLS_OPEN_ICECAT_DETAIL_BATCH_SIZE, DEFAULT_OPEN_ICECAT_CONTROL.detailBatchSize, 1, 50, "BLS_OPEN_ICECAT_DETAIL_BATCH_SIZE"),
  detailLeaseSeconds: bounded(process.env.BLS_OPEN_ICECAT_DETAIL_LEASE_SECONDS, DEFAULT_OPEN_ICECAT_CONTROL.detailLeaseSeconds, 30, 3_600, "BLS_OPEN_ICECAT_DETAIL_LEASE_SECONDS"),
  detailRequestTimeoutMs: bounded(process.env.BLS_OPEN_ICECAT_DETAIL_REQUEST_TIMEOUT_MS, DEFAULT_OPEN_ICECAT_CONTROL.detailRequestTimeoutMs, 250, 60_000, "BLS_OPEN_ICECAT_DETAIL_REQUEST_TIMEOUT_MS"),
  detailRateDelayMs: bounded(process.env.BLS_OPEN_ICECAT_DETAIL_RATE_DELAY_MS, DEFAULT_OPEN_ICECAT_CONTROL.detailRateDelayMs, 0, 60_000, "BLS_OPEN_ICECAT_DETAIL_RATE_DELAY_MS"),
  detailMaxAttempts: bounded(process.env.BLS_OPEN_ICECAT_DETAIL_MAX_ATTEMPTS, DEFAULT_OPEN_ICECAT_CONTROL.detailMaxAttempts, 1, 20, "BLS_OPEN_ICECAT_DETAIL_MAX_ATTEMPTS"),
  detailRetryBaseSeconds: bounded(process.env.BLS_OPEN_ICECAT_DETAIL_RETRY_BASE_SECONDS, DEFAULT_OPEN_ICECAT_CONTROL.detailRetryBaseSeconds, 1, 3_600, "BLS_OPEN_ICECAT_DETAIL_RETRY_BASE_SECONDS"),
  minimumGreekScore: score(process.env.BLS_OPEN_ICECAT_MIN_GREEK_SCORE, DEFAULT_OPEN_ICECAT_CONTROL.minimumGreekScore)
};
// Validate the deployment fallback with the same governed control contract used for live settings.
openIcecatControlFromMetadata({ icecat_control: fallbackControl });

const username = required(process.env.ICECAT_USERNAME, "ICECAT_USERNAME");
const apiToken = required(process.env.ICECAT_API_TOKEN, "ICECAT_API_TOKEN");
const contentToken = process.env.ICECAT_CONTENT_TOKEN?.trim() || undefined;
const sourceUow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });
const repository = runtime.persistence.openIcecatDetail;

let stopping = false;
let currentProductId: string | undefined;
let currentGtin: string | undefined;
let lastActivityAt = Date.now();
let lastQueueSyncAt: number | undefined;
let lastQueueSyncError: string | undefined;
let nextQueueSyncAt: number | undefined;
let activeAbortController: AbortController | undefined;
let liveControl = fallbackControl;

const sourceState = await loadSourceState();
const sourceId = sourceState.sourceId;
applyControl(sourceState.control);
let initialQueuedOrRefreshed = 0;
let initialRemovedSkipped = 0;
if (liveControl.detailEnabled) {
  const initialSync = await repository.sync(sourceId, OPEN_ICECAT_DETAIL_PROCESSING_VERSION);
  initialQueuedOrRefreshed = initialSync.queuedOrRefreshed;
  initialRemovedSkipped = initialSync.removedSkipped;
  lastQueueSyncAt = Date.now();
  lastActivityAt = lastQueueSyncAt;
  nextQueueSyncAt = runOnce ? undefined : lastQueueSyncAt + liveControl.detailSyncIntervalMs;
}

const healthServer = await startHealthServer(healthPort);
const stop = (signal: string): void => {
  if (stopping) return;
  stopping = true;
  lastActivityAt = Date.now();
  activeAbortController?.abort(new Error(`Open Icecat detail worker stopping after ${signal}`));
  console.log(JSON.stringify({ level: "info", event: "open_icecat.detail_worker_shutdown", workerId, signal, currentProductId, currentGtin }));
};
process.once("SIGTERM", () => stop("SIGTERM"));
process.once("SIGINT", () => stop("SIGINT"));

console.log(JSON.stringify({
  level: "info",
  event: "open_icecat.detail_worker_started",
  workerId,
  sourceId,
  schema: readiness.appliedSchemaVersion,
  processingVersion: OPEN_ICECAT_DETAIL_PROCESSING_VERSION,
  controlRevision: liveControl.revision,
  detailEnabled: liveControl.detailEnabled,
  batchSize: liveControl.detailBatchSize,
  leaseSeconds: liveControl.detailLeaseSeconds,
  requestTimeoutMs: liveControl.detailRequestTimeoutMs,
  rateDelayMs: liveControl.detailRateDelayMs,
  syncIntervalMs: liveControl.detailSyncIntervalMs,
  minimumGreekScore: liveControl.minimumGreekScore,
  initialQueuedOrRefreshed,
  initialRemovedSkipped,
  runOnce
}));

try {
  do {
    const nextControl = await loadControlOnly();
    if (nextControl) applyControl(nextControl);

    if (!liveControl.detailEnabled) {
      lastActivityAt = Date.now();
      if (runOnce) break;
      await delay(Math.min(5_000, liveControl.detailPollMs));
      continue;
    }

    await maybeSyncQueue();
    const jobControl = liveControl;
    const jobs = await repository.claim({
      sourceId,
      workerId,
      leaseSeconds: jobControl.detailLeaseSeconds,
      limit: jobControl.detailBatchSize,
      processingVersion: OPEN_ICECAT_DETAIL_PROCESSING_VERSION
    });
    lastActivityAt = Date.now();

    if (!jobs.length) {
      if (!runOnce && !stopping) await delay(jobControl.detailPollMs);
      continue;
    }

    for (const job of jobs) {
      if (stopping) break;
      await processJob(job, jobControl);
      if (!stopping && jobControl.detailRateDelayMs > 0) await delay(jobControl.detailRateDelayMs);
    }
  } while (!runOnce && !stopping);
} finally {
  await closeServer(healthServer);
  await runtime.close();
}

function applyControl(next: OpenIcecatControlSettings): void {
  if (next.revision !== liveControl.revision) {
    console.log(JSON.stringify({
      level: "info",
      event: "open_icecat.detail_control_reloaded",
      workerId,
      previousRevision: liveControl.revision,
      revision: next.revision,
      detailEnabled: next.detailEnabled,
      detailBatchSize: next.detailBatchSize,
      detailPollMs: next.detailPollMs,
      minimumGreekScore: next.minimumGreekScore
    }));
    nextQueueSyncAt = next.detailEnabled ? Date.now() : undefined;
  }
  liveControl = next;
}

async function maybeSyncQueue(): Promise<void> {
  if (runOnce || stopping) return;
  const now = Date.now();
  if (nextQueueSyncAt !== undefined && now < nextQueueSyncAt) return;

  try {
    const result = await repository.sync(sourceId, OPEN_ICECAT_DETAIL_PROCESSING_VERSION);
    lastQueueSyncAt = Date.now();
    lastActivityAt = lastQueueSyncAt;
    lastQueueSyncError = undefined;
    nextQueueSyncAt = lastQueueSyncAt + liveControl.detailSyncIntervalMs;
    console.log(JSON.stringify({
      level: "info",
      event: "open_icecat.detail_queue_synced",
      workerId,
      sourceId,
      queuedOrRefreshed: result.queuedOrRefreshed,
      removedSkipped: result.removedSkipped,
      nextQueueSyncAt: new Date(nextQueueSyncAt).toISOString(),
      controlRevision: liveControl.revision
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    lastActivityAt = Date.now();
    lastQueueSyncError = message;
    const syncRetryMs = Math.min(liveControl.detailSyncIntervalMs, 60_000);
    nextQueueSyncAt = lastActivityAt + syncRetryMs;
    console.error(JSON.stringify({
      level: "warn",
      event: "open_icecat.detail_queue_sync_failed",
      workerId,
      sourceId,
      message,
      retryInMs: syncRetryMs
    }));
  }
}

async function processJob(job: OpenIcecatDetailJob, control: OpenIcecatControlSettings): Promise<void> {
  currentProductId = job.productId;
  currentGtin = job.gtins.find(isValidGtin);
  lastActivityAt = Date.now();

  if (!currentGtin) {
    await repository.skip(job, workerId, "provider index row has no checksum-valid GTIN for Icecat detail lookup");
    console.warn(JSON.stringify({
      level: "warn",
      event: "open_icecat.detail_job_skipped",
      workerId,
      productId: job.productId,
      reason: "no_valid_gtin"
    }));
    clearCurrentJob();
    return;
  }

  const client = new OpenIcecatClient({
    username,
    apiToken,
    contentToken,
    requestTimeoutMs: control.detailRequestTimeoutMs
  });
  const controller = new AbortController();
  activeAbortController = controller;
  try {
    const draft = await client.lookupByGtin(currentGtin, { minimumGreekScore: control.minimumGreekScore, signal: controller.signal });
    if (stopping) return;
    const result = await repository.persist(job, workerId, draft);
    lastActivityAt = Date.now();
    console.log(JSON.stringify({
      level: "info",
      event: result.stale ? "open_icecat.detail_job_stale" : "open_icecat.detail_job_completed",
      workerId,
      productId: job.productId,
      gtin: currentGtin,
      sourceProductId: result.sourceProductId ?? null,
      status: result.status ?? null,
      greekScore: draft.greekQuality.score,
      greekMissing: draft.greekQuality.missing,
      attempt: job.attemptCount,
      controlRevision: control.revision
    }));
  } catch (error) {
    if (stopping || controller.signal.aborted) return;
    const message = error instanceof Error ? error.message : String(error);

    if (error instanceof OpenIcecatRequestError && error.disposition === "fatal") {
      lastActivityAt = Date.now();
      console.error(JSON.stringify({
        level: "error",
        event: "open_icecat.detail_worker_fatal_provider_error",
        workerId,
        productId: job.productId,
        gtin: currentGtin,
        attempt: job.attemptCount,
        providerStatus: error.status ?? null,
        message
      }));
      throw error;
    }

    if (error instanceof OpenIcecatRequestError && error.disposition === "skip") {
      await repository.skip(job, workerId, message);
      lastActivityAt = Date.now();
      console.warn(JSON.stringify({
        level: "warn",
        event: "open_icecat.detail_job_skipped",
        workerId,
        productId: job.productId,
        gtin: currentGtin,
        attempt: job.attemptCount,
        providerStatus: error.status ?? null,
        reason: "provider_permanent_error",
        message
      }));
      return;
    }

    const terminal = job.attemptCount >= control.detailMaxAttempts;
    const retrySeconds = terminal
      ? control.detailRetryBaseSeconds
      : Math.min(21_600, control.detailRetryBaseSeconds * Math.max(1, 2 ** Math.max(0, job.attemptCount - 1)));
    await repository.retry({ job, workerId, error: message, retrySeconds, terminal });
    lastActivityAt = Date.now();
    console.error(JSON.stringify({
      level: terminal ? "error" : "warn",
      event: terminal ? "open_icecat.detail_job_failed" : "open_icecat.detail_job_retry",
      workerId,
      productId: job.productId,
      gtin: currentGtin,
      attempt: job.attemptCount,
      providerStatus: error instanceof OpenIcecatRequestError ? error.status ?? null : null,
      retrySeconds: terminal ? null : retrySeconds,
      message
    }));
  } finally {
    if (activeAbortController === controller) activeAbortController = undefined;
    clearCurrentJob();
  }
}

async function loadSourceState(): Promise<{ sourceId: string; control: OpenIcecatControlSettings }> {
  return sourceUow.withTransaction({ platformAccess: true }, async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT s.id::text AS source_id, s.metadata
      FROM public.catalog_sources s
      JOIN public.markets m ON m.id=s.market_id
      WHERE s.code='open_icecat' AND s.active=true AND m.code='sparta'
      LIMIT 1
    `);
    const row = result.rows[0];
    const sourceId = row?.source_id;
    if (typeof sourceId !== "string" || !sourceId) throw new Error("Active Sparta Open Icecat source configuration not found");
    return { sourceId, control: openIcecatControlFromMetadata(row?.metadata, fallbackControl) };
  }, { readOnly: true });
}

async function loadControlOnly(): Promise<OpenIcecatControlSettings | undefined> {
  try {
    return (await loadSourceState()).control;
  } catch {
    return undefined;
  }
}

async function startHealthServer(port: number): Promise<Server> {
  const server = createServer(async (request, response) => {
    if (request.url !== "/healthz") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "not_found" }));
      return;
    }
    try {
      const stats = await repository.stats(sourceId);
      response.writeHead(stopping ? 503 : 200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({
        ok: !stopping,
        workerId,
        sourceId,
        stopping,
        currentProductId: currentProductId ?? null,
        currentGtin: currentGtin ?? null,
        lastActivityAt: new Date(lastActivityAt).toISOString(),
        lastQueueSyncAt: lastQueueSyncAt ? new Date(lastQueueSyncAt).toISOString() : null,
        lastQueueSyncError: lastQueueSyncError ?? null,
        nextQueueSyncAt: nextQueueSyncAt ? new Date(nextQueueSyncAt).toISOString() : null,
        schema: readiness.appliedSchemaVersion,
        processingVersion: OPEN_ICECAT_DETAIL_PROCESSING_VERSION,
        controlRevision: liveControl.revision,
        detailEnabled: liveControl.detailEnabled,
        detailBatchSize: liveControl.detailBatchSize,
        detailPollMs: liveControl.detailPollMs,
        minimumGreekScore: liveControl.minimumGreekScore,
        queue: stats
      }));
    } catch (error) {
      response.writeHead(503, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ ok: false, workerId, error: error instanceof Error ? error.message : String(error) }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => { server.off("error", reject); resolve(); });
  });
  return server;
}

function clearCurrentJob(): void {
  currentProductId = undefined;
  currentGtin = undefined;
}
function closeServer(server: Server): Promise<void> { return new Promise((resolve) => server.close(() => resolve())); }
async function delay(ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (!stopping) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(500, remaining)));
  }
}
function required(raw: string | undefined, name: string): string {
  const value = raw?.trim();
  if (!value) throw new Error(`${name} is required for Open Icecat detail enrichment`);
  return value;
}
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
function score(raw: string | undefined, fallback: number): number {
  const value = raw?.trim() ? Number(raw) : fallback;
  if (!Number.isFinite(value) || value < 0.9 || value > 1) throw new Error("BLS_OPEN_ICECAT_MIN_GREEK_SCORE must be between 0.9 and 1");
  return value;
}
