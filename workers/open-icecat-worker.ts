import { createServer, type Server } from "node:http";
import { hostname } from "node:os";
import {
  OPEN_ICECAT_GREEK_DAILY_INDEX_URL,
  OPEN_ICECAT_GREEK_FULL_INDEX_URL,
  PostgresUnitOfWork,
  parseOpenIcecatIndexSourceEvents,
  runOpenIcecatBulkImport,
  type OpenIcecatImportKind,
  type OpenIcecatIndexFilter,
  type SqlRow
} from "../packages/core/src/index.ts";
import { createPostgresRuntimeFromEnv, EXPECTED_SCHEMA_VERSION } from "../packages/postgres-runtime/src/index.ts";

const env: NodeJS.ProcessEnv = { ...process.env };
if (!env.BLS_DB_POOL_MAX?.trim()) env.BLS_DB_POOL_MAX = "4";
if (!env.BLS_DB_IDLE_TIMEOUT_MS?.trim()) env.BLS_DB_IDLE_TIMEOUT_MS = "30000";

const runtime = createPostgresRuntimeFromEnv({ env, applicationName: "buy-local-sparta-open-icecat" });
const readiness = await runtime.readiness(EXPECTED_SCHEMA_VERSION);
if (!readiness.ok) {
  await runtime.close();
  throw new Error(`Open Icecat worker refused to start: ${readiness.message}`);
}

const workerId = process.env.BLS_OPEN_ICECAT_WORKER_ID?.trim() || `${hostname()}:${process.pid}`;
const successIntervalMs = positive(process.env.BLS_OPEN_ICECAT_INTERVAL_MS, 24 * 60 * 60 * 1000, "BLS_OPEN_ICECAT_INTERVAL_MS");
const retryIntervalMs = positive(process.env.BLS_OPEN_ICECAT_RETRY_MS, 60 * 60 * 1000, "BLS_OPEN_ICECAT_RETRY_MS");
const lockRetryMs = positive(process.env.BLS_OPEN_ICECAT_LOCK_RETRY_MS, 60_000, "BLS_OPEN_ICECAT_LOCK_RETRY_MS");
const fetchTimeoutMs = positive(process.env.BLS_OPEN_ICECAT_FETCH_TIMEOUT_MS, 2 * 60 * 60 * 1000, "BLS_OPEN_ICECAT_FETCH_TIMEOUT_MS");
const batchSize = bounded(process.env.BLS_OPEN_ICECAT_BATCH_SIZE, 500, 1, 10_000, "BLS_OPEN_ICECAT_BATCH_SIZE");
const maxRecordChars = bounded(process.env.BLS_OPEN_ICECAT_MAX_RECORD_CHARS, 8 * 1024 * 1024, 1024, 64 * 1024 * 1024, "BLS_OPEN_ICECAT_MAX_RECORD_CHARS");
const healthPort = bounded(process.env.BLS_OPEN_ICECAT_HEALTH_PORT, 8082, 1, 65535, "BLS_OPEN_ICECAT_HEALTH_PORT");
const runOnce = process.env.BLS_OPEN_ICECAT_RUN_ONCE === "true";
const country = optionalCountry(process.env.BLS_OPEN_ICECAT_COUNTRY);
const requireApprovedGtin = process.env.BLS_OPEN_ICECAT_REQUIRE_APPROVED_GTIN === "true";
const authHeaders = icecatAuthenticationHeaders(process.env);
const sourceUow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 3_000 });

let stopping = false;
let currentImportKind: OpenIcecatImportKind | undefined;
let currentRunStartedAt: number | undefined;
let lastActivityAt = Date.now();
let activeAbortController: AbortController | undefined;

const healthServer = await startHealthServer(healthPort);
const stop = (signal: string): void => {
  if (stopping) return;
  stopping = true;
  lastActivityAt = Date.now();
  activeAbortController?.abort(new Error(`Open Icecat worker stopping after ${signal}`));
  console.log(JSON.stringify({ level: "info", event: "open_icecat.worker_shutdown", workerId, signal, currentImportKind }));
};
process.once("SIGTERM", () => stop("SIGTERM"));
process.once("SIGINT", () => stop("SIGINT"));

console.log(JSON.stringify({
  level: "info",
  event: "open_icecat.worker_started",
  workerId,
  schema: readiness.appliedSchemaVersion,
  batchSize,
  country: country ?? null,
  requireApprovedGtin,
  runOnce
}));

try {
  if (runOnce) {
    await runCycle();
  } else {
    while (!stopping) {
      let nextDelay = successIntervalMs;
      try {
        const ran = await runCycle();
        nextDelay = ran ? successIntervalMs : lockRetryMs;
      } catch (error) {
        if (stopping) break;
        nextDelay = retryIntervalMs;
        console.error(JSON.stringify({
          level: "error",
          event: "open_icecat.cycle_failed",
          workerId,
          importKind: currentImportKind,
          message: error instanceof Error ? error.message : String(error)
        }));
      }
      if (!stopping) await delay(nextDelay);
    }
  }
} finally {
  await closeServer(healthServer);
  await runtime.close();
}

async function runCycle(): Promise<boolean> {
  const lockClient = await runtime.nativePool.connect();
  let locked = false;
  try {
    const lock = await lockClient.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked",
      ["buy-local-sparta:open-icecat-index-ingestion"]
    );
    locked = lock.rows[0]?.locked === true;
    if (!locked) {
      console.log(JSON.stringify({ level: "info", event: "open_icecat.lock_busy", workerId }));
      return false;
    }

    const source = await loadSourceConfiguration();
    const importKind: OpenIcecatImportKind = source.hasCompletedFull ? "daily" : "full";
    currentImportKind = importKind;
    currentRunStartedAt = Date.now();
    lastActivityAt = currentRunStartedAt;
    const sourceUrl = importKind === "full" ? source.fullUrl : source.dailyUrl;
    const controller = new AbortController();
    activeAbortController = controller;
    const timeoutSignal = AbortSignal.timeout(fetchTimeoutMs);
    const signal = AbortSignal.any([controller.signal, timeoutSignal]);

    console.log(JSON.stringify({ level: "info", event: "open_icecat.index_fetch_started", workerId, importKind, sourceId: source.sourceId }));
    const response = await fetch(sourceUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        ...authHeaders,
        accept: "text/csv, application/gzip, application/octet-stream;q=0.9, */*;q=0.1",
        "accept-encoding": "identity",
        "user-agent": "KONTAMOU-OpenIcecat/1.0 (+https://kontamou.site/)"
      },
      signal
    });

    if (!response.ok) {
      await cancelBody(response);
      throw new Error(`Open Icecat ${importKind} index request failed with HTTP ${response.status}`);
    }
    if (!response.body) throw new Error(`Open Icecat ${importKind} index response has no body`);

    const sourceFingerprint = fingerprintFromHeaders(response.headers);
    const filter: OpenIcecatIndexFilter = {
      requireOnMarket: true,
      requireApprovedGtin,
      country,
      includeRemoved: importKind === "daily"
    };

    try {
      const result = await runOpenIcecatBulkImport({
        identity: {
          sourceId: source.sourceId,
          importKind,
          sourceUrl,
          sourceFingerprint
        },
        events: parseOpenIcecatIndexSourceEvents(gunzipChunks(response.body), filter, { maxRecordChars }),
        repository: runtime.persistence.openIcecatBulk,
        batchSize
      });
      lastActivityAt = Date.now();
      console.log(JSON.stringify({
        level: "info",
        event: "open_icecat.index_ingestion_completed",
        workerId,
        importKind,
        sourceId: source.sourceId,
        fingerprint: sourceFingerprint,
        runId: result.runId,
        resumedFrom: result.resumedFrom,
        checkpoint: result.checkpoint,
        sourceRows: result.sourceRows,
        candidates: result.candidates,
        removals: result.removals,
        rejected: result.rejected,
        filtered: result.filtered
      }));
      return true;
    } finally {
      await cancelBody(response);
      activeAbortController = undefined;
      currentRunStartedAt = undefined;
      currentImportKind = undefined;
    }
  } finally {
    if (locked) {
      try {
        await lockClient.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", ["buy-local-sparta:open-icecat-index-ingestion"]);
      } catch (error) {
        console.error(JSON.stringify({ level: "error", event: "open_icecat.lock_release_failed", workerId, message: error instanceof Error ? error.message : String(error) }));
      }
    }
    lockClient.release();
  }
}

async function loadSourceConfiguration(): Promise<{ sourceId: string; fullUrl: string; dailyUrl: string; hasCompletedFull: boolean }> {
  return sourceUow.withTransaction({ platformAccess: true }, async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT s.id::text AS source_id,
             COALESCE(NULLIF(s.metadata->>'preferred_index',''),$1) AS full_url,
             COALESCE(NULLIF(s.metadata->>'daily_index',''),$2) AS daily_url,
             EXISTS (
               SELECT 1
               FROM public.open_icecat_bulk_ingestion_runs r
               WHERE r.source_id=s.id AND r.import_kind='full' AND r.status='completed'
             ) AS has_completed_full
      FROM public.catalog_sources s
      JOIN public.markets m ON m.id=s.market_id
      WHERE s.code='open_icecat' AND s.active=true AND m.code='sparta'
      LIMIT 1
    `, [OPEN_ICECAT_GREEK_FULL_INDEX_URL, OPEN_ICECAT_GREEK_DAILY_INDEX_URL]);
    if (result.rowCount !== 1 || !result.rows[0]) throw new Error("Active Sparta Open Icecat source configuration not found");
    const row = result.rows[0];
    return {
      sourceId: requiredString(row.source_id, "source_id"),
      fullUrl: safeIcecatIndexUrl(requiredString(row.full_url, "full_url")),
      dailyUrl: safeIcecatIndexUrl(requiredString(row.daily_url, "daily_url")),
      hasCompletedFull: row.has_completed_full === true
    };
  }, { readOnly: true });
}

async function* gunzipChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const decompressed = body.pipeThrough(new DecompressionStream("gzip"));
  const reader = decompressed.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (next.value?.byteLength) yield next.value;
    }
  } finally {
    reader.releaseLock();
  }
}

function fingerprintFromHeaders(headers: Headers): string {
  const etag = headers.get("etag")?.trim();
  const lastModified = headers.get("last-modified")?.trim();
  const length = headers.get("content-length")?.trim();
  if (etag) return `etag:${etag}`;
  if (lastModified) return `last-modified:${lastModified}${length ? `|length:${length}` : ""}`;
  throw new Error("Open Icecat index response is missing ETag and Last-Modified; refusing an unsafe resumable cursor");
}

function icecatAuthenticationHeaders(source: NodeJS.ProcessEnv): Record<string, string> {
  const apiToken = source.ICECAT_API_TOKEN?.trim();
  const username = source.ICECAT_USERNAME?.trim();
  const password = source.ICECAT_PASSWORD?.trim();
  if (!apiToken && !(username && password)) {
    throw new Error("Open Icecat worker requires ICECAT_API_TOKEN or ICECAT_USERNAME + ICECAT_PASSWORD");
  }
  const headers: Record<string, string> = {};
  if (apiToken) headers["api-token"] = apiToken;
  if (username && password) headers.authorization = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
  return headers;
}

function safeIcecatIndexUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.hostname !== "data.icecat.biz") {
    throw new Error("Open Icecat index URL must use https://data.icecat.biz");
  }
  if (!url.pathname.endsWith(".index.csv.gz")) throw new Error("Open Icecat source URL must point to a .index.csv.gz file");
  if (url.username || url.password || url.search || url.hash) throw new Error("Open Icecat source URL must not contain credentials, query parameters, or fragments");
  return url.toString();
}

async function cancelBody(response: Response): Promise<void> {
  try {
    if (response.body && !response.body.locked) await response.body.cancel();
  } catch {
    // The stream may already be fully consumed or aborted.
  }
}

async function startHealthServer(port: number): Promise<Server> {
  const server = createServer((request, response) => {
    if (request.url !== "/healthz") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "not_found" }));
      return;
    }
    response.writeHead(stopping ? 503 : 200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({
      ok: !stopping,
      workerId,
      stopping,
      currentImportKind: currentImportKind ?? null,
      currentRunStartedAt: currentRunStartedAt ? new Date(currentRunStartedAt).toISOString() : null,
      lastActivityAt: new Date(lastActivityAt).toISOString(),
      schema: readiness.appliedSchemaVersion
    }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => { server.off("error", reject); resolve(); });
  });
  return server;
}

function closeServer(server: Server): Promise<void> { return new Promise((resolve) => server.close(() => resolve())); }
function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Open Icecat source ${field} is missing`);
  return value.trim();
}
function optionalCountry(raw: string | undefined): string | undefined {
  const value = raw?.trim().toUpperCase();
  if (!value) return undefined;
  if (!/^[A-Z]{2}$/.test(value)) throw new Error("BLS_OPEN_ICECAT_COUNTRY must be a two-letter country code");
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
