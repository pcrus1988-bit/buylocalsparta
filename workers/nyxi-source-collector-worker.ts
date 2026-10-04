import { hostname } from "node:os";
import { createPostgresRuntimeFromEnv, EXPECTED_SCHEMA_VERSION } from "../packages/postgres-runtime/src/index.ts";
import { S3ObjectStorage, objectStorageConfigFromEnv } from "../packages/object-storage/src/index.ts";
import { secureCrawlFetch } from "./catalog-crawler/transport.ts";

type WorkerMode = "continuous" | "drain";

type SourceLease = Readonly<{
  sourceId: string;
  sourceKey: string;
  publisher: string;
  title: string;
  sourceFamily: string;
  authorityLevel: number;
  jurisdiction: string;
  canonicalUrl: string;
  retrievalMethod: string;
  updateFrequency: string;
  metadata: Record<string, unknown>;
  etag?: string;
  lastModified?: string;
  lastContentSha256?: string;
  lastHttpStatus?: number;
  consecutiveFailures: number;
}>;

const env: NodeJS.ProcessEnv = { ...process.env };
if (!env.BLS_DB_POOL_MAX?.trim()) env.BLS_DB_POOL_MAX = "3";
if (!env.BLS_DB_IDLE_TIMEOUT_MS?.trim()) env.BLS_DB_IDLE_TIMEOUT_MS = "30000";

const runtime = createPostgresRuntimeFromEnv({ env, applicationName: "nyxi-source-collector" });
const readiness = await runtime.readiness(EXPECTED_SCHEMA_VERSION);
if (!readiness.ok) {
  await runtime.close();
  throw new Error(`NYXI source collector refused to start: ${readiness.message}`);
}

const storage = new S3ObjectStorage(objectStorageConfigFromEnv(process.env));
const storageReady = await storage.readiness();
if (!storageReady.ok) {
  await runtime.close();
  throw new Error(`NYXI source collector object storage unavailable: ${storageReady.message}`);
}

const workerId = process.env.BLS_NYXI_SOURCE_WORKER_ID?.trim() || `nyxi-source:${hostname()}:${process.pid}`;
const pollMs = positive(process.env.BLS_NYXI_SOURCE_POLL_MS, 15_000, "BLS_NYXI_SOURCE_POLL_MS");
const leaseSeconds = bounded(process.env.BLS_NYXI_SOURCE_LEASE_SECONDS, 300, 30, 3600, "BLS_NYXI_SOURCE_LEASE_SECONDS");
const requestTimeoutMs = bounded(process.env.BLS_NYXI_SOURCE_REQUEST_TIMEOUT_MS, 30_000, 5_000, 120_000, "BLS_NYXI_SOURCE_REQUEST_TIMEOUT_MS");
const maxResponseBytes = bounded(process.env.BLS_NYXI_SOURCE_MAX_RESPONSE_BYTES, 25 * 1024 * 1024, 64 * 1024, 100 * 1024 * 1024, "BLS_NYXI_SOURCE_MAX_RESPONSE_BYTES");
const maxRedirects = bounded(process.env.BLS_NYXI_SOURCE_MAX_REDIRECTS, 5, 0, 10, "BLS_NYXI_SOURCE_MAX_REDIRECTS");
const maxItems = bounded(process.env.BLS_NYXI_SOURCE_MAX_ITEMS, 100, 1, 10_000, "BLS_NYXI_SOURCE_MAX_ITEMS");
const mode = workerMode(process.env.BLS_NYXI_SOURCE_MODE);
const userAgent = process.env.BLS_NYXI_SOURCE_USER_AGENT?.trim() || "NYXI-EvidenceBot/0.1 (+https://kontamou.site/)";
let stopping = false;
let processed = 0;

const requestStop = () => { stopping = true; };
process.once("SIGTERM", requestStop);
process.once("SIGINT", requestStop);

log("info", "nyxi_source.worker_started", {
  workerId,
  mode,
  pollMs,
  leaseSeconds,
  requestTimeoutMs,
  maxResponseBytes,
  schema: readiness.appliedSchemaVersion
});

try {
  while (!stopping) {
    if (mode === "drain" && processed >= maxItems) break;
    const lease = await claimSource();
    if (!lease) {
      if (mode === "drain") break;
      await delay(pollMs);
      continue;
    }

    processed += 1;
    try {
      await collectSource(lease);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordFailure(lease, message).catch((persistError) => {
        log("error", "nyxi_source.failure_persist_failed", {
          sourceKey: lease.sourceKey,
          message: persistError instanceof Error ? persistError.message : String(persistError)
        });
      });
      log("error", "nyxi_source.fetch_failed", {
        sourceKey: lease.sourceKey,
        url: lease.canonicalUrl,
        consecutiveFailures: lease.consecutiveFailures + 1,
        message
      });
    }
  }
} finally {
  await runtime.close();
  log("info", "nyxi_source.worker_stopped", { workerId, mode, processed });
}

async function claimSource(): Promise<SourceLease | undefined> {
  const result = await runtime.nativePool.query(`
    WITH candidate AS (
      SELECT state.source_id
      FROM public.nyxi_source_crawl_state state
      JOIN public.nyxi_sources source ON source.id=state.source_id
      WHERE source.source_status='verified'
        AND source.retrieval_method<>'manual'
        AND coalesce(state.next_check_at,now())<=now()
        AND (state.lease_expires_at IS NULL OR state.lease_expires_at<=now())
      ORDER BY source.authority_level DESC, state.next_check_at NULLS FIRST, source.source_key
      FOR UPDATE OF state SKIP LOCKED
      LIMIT 1
    )
    UPDATE public.nyxi_source_crawl_state state
    SET lease_owner=$1,
        lease_expires_at=now()+($2::text || ' seconds')::interval,
        updated_at=now()
    FROM candidate c
    JOIN public.nyxi_sources source ON source.id=c.source_id
    WHERE state.source_id=c.source_id
    RETURNING
      source.id::text AS source_id,
      source.source_key,
      source.publisher,
      source.title,
      source.source_family,
      source.authority_level,
      source.jurisdiction,
      source.canonical_url,
      source.retrieval_method,
      source.update_frequency,
      source.metadata,
      state.etag,
      state.last_modified,
      state.last_content_sha256,
      state.last_http_status,
      state.consecutive_failures
  `, [workerId, leaseSeconds]);

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return {
    sourceId: required(row.source_id, "source_id"),
    sourceKey: required(row.source_key, "source_key"),
    publisher: required(row.publisher, "publisher"),
    title: required(row.title, "title"),
    sourceFamily: required(row.source_family, "source_family"),
    authorityLevel: integer(row.authority_level, "authority_level"),
    jurisdiction: required(row.jurisdiction, "jurisdiction"),
    canonicalUrl: required(row.canonical_url, "canonical_url"),
    retrievalMethod: required(row.retrieval_method, "retrieval_method"),
    updateFrequency: required(row.update_frequency, "update_frequency"),
    metadata: objectValue(row.metadata),
    etag: optional(row.etag),
    lastModified: optional(row.last_modified),
    lastContentSha256: optional(row.last_content_sha256),
    lastHttpStatus: nullableInteger(row.last_http_status),
    consecutiveFailures: integer(row.consecutive_failures ?? 0, "consecutive_failures")
  };
}

async function collectSource(source: SourceLease): Promise<void> {
  const canonical = new URL(source.canonicalUrl);
  if (canonical.protocol !== "https:") throw new Error("NYXI source collector requires HTTPS sources");
  const allowedHosts = sourceAllowedHosts(source, canonical.hostname);
  const result = await secureCrawlFetch({
    url: source.canonicalUrl,
    policy: {
      allowedHosts,
      allowSubdomains: false,
      allowHttp: false,
      maxRedirects,
      maxResponseBytes
    },
    userAgent,
    timeoutMs: requestTimeoutMs,
    accept: acceptHeader(source.retrievalMethod),
    ifNoneMatch: source.etag,
    ifModifiedSince: source.lastModified
  });

  if (result.status === 304) {
    await runtime.nativePool.query(`
      UPDATE public.nyxi_source_crawl_state
      SET last_checked_at=now(),
          last_success_at=now(),
          last_http_status=304,
          consecutive_failures=0,
          last_error=NULL,
          next_check_at=$3,
          lease_owner=NULL,
          lease_expires_at=NULL,
          updated_at=now()
      WHERE source_id=$1 AND lease_owner=$2
    `, [source.sourceId, workerId, new Date(Date.now() + intervalMs(source.updateFrequency))]);
    log("info", "nyxi_source.not_modified", { sourceKey: source.sourceKey });
    return;
  }

  if (result.status === 429 || result.status >= 500) {
    throw new Error(`Source returned retryable HTTP ${result.status}`);
  }

  const contentType = result.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() || undefined;
  const statusChanged = source.lastHttpStatus != null && source.lastHttpStatus !== result.status;
  const contentChanged = !source.lastContentSha256 || source.lastContentSha256 !== result.responseSha256;
  const changed = contentChanged || statusChanged;
  let objectKey: string | undefined;

  if (contentChanged && result.body.length > 0) {
    objectKey = rawObjectKey(source.sourceId, result.responseSha256, contentType, result.finalUrl);
    const existing = await storage.head(objectKey);
    if (existing) {
      if (existing.byteSize !== result.body.length) throw new Error("Existing NYXI archive object has unexpected byte size");
    } else {
      await storage.write({
        objectKey,
        body: result.body,
        contentType,
        cacheControl: "private, max-age=31536000, immutable",
        metadata: {
          sourceid: source.sourceId,
          sha256: result.responseSha256
        }
      });
    }
  } else if (!contentChanged && source.lastContentSha256) {
    objectKey = rawObjectKey(source.sourceId, source.lastContentSha256, contentType, result.finalUrl);
    if (!await storage.head(objectKey)) objectKey = undefined;
  }

  const client = await runtime.nativePool.connect();
  try {
    await client.query("BEGIN");
    if (changed) {
      await client.query(`
        INSERT INTO public.nyxi_source_snapshots(
          source_id,retrieved_at,capture_kind,http_status,content_type,
          content_sha256,raw_object_key,byte_length,etag,last_modified,metadata
        )
        VALUES(
          $1,now(),$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb
        )
        ON CONFLICT (source_id,content_sha256) WHERE content_sha256 IS NOT NULL DO NOTHING
      `, [
        source.sourceId,
        contentChanged && objectKey ? "raw_file" : "headers",
        result.status,
        contentType ?? null,
        contentChanged ? result.responseSha256 : null,
        objectKey ?? null,
        result.responseBytes,
        result.headers.etag ?? null,
        result.headers["last-modified"] ?? null,
        JSON.stringify({
          canonicalUrl: source.canonicalUrl,
          finalUrl: result.finalUrl,
          redirectChain: result.redirectChain,
          responseHeaders: evidenceHeaders(result.headers),
          sourceFamily: source.sourceFamily,
          authorityLevel: source.authorityLevel,
          jurisdiction: source.jurisdiction,
          collectorVersion: 1,
          interpretationPerformed: false
        })
      ]);
    }

    await client.query(`
      UPDATE public.nyxi_source_crawl_state
      SET last_checked_at=now(),
          last_success_at=CASE WHEN $3 BETWEEN 200 AND 399 THEN now() ELSE last_success_at END,
          last_change_at=CASE WHEN $4 THEN now() ELSE last_change_at END,
          last_http_status=$3,
          last_content_sha256=$5,
          etag=$6,
          last_modified=$7,
          consecutive_failures=0,
          last_error=NULL,
          next_check_at=$8,
          lease_owner=NULL,
          lease_expires_at=NULL,
          updated_at=now()
      WHERE source_id=$1 AND lease_owner=$2
    `, [
      source.sourceId,
      workerId,
      result.status,
      changed,
      result.responseSha256,
      result.headers.etag ?? null,
      result.headers["last-modified"] ?? null,
      new Date(Date.now() + intervalMs(source.updateFrequency))
    ]);

    if (result.status >= 200 && result.status < 400) {
      await client.query(`
        UPDATE public.nyxi_sources
        SET last_verified_at=now(),updated_at=now()
        WHERE id=$1
      `, [source.sourceId]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  log("info", changed ? "nyxi_source.snapshot_created" : "nyxi_source.unchanged", {
    sourceKey: source.sourceKey,
    status: result.status,
    bytes: result.responseBytes,
    sha256: result.responseSha256,
    archived: Boolean(objectKey),
    changed
  });
}

async function recordFailure(source: SourceLease, message: string): Promise<void> {
  const failures = source.consecutiveFailures + 1;
  const retryMs = Math.min(24 * 60 * 60 * 1000, 30 * 60 * 1000 * (2 ** Math.min(5, Math.max(0, failures - 1))));
  await runtime.nativePool.query(`
    UPDATE public.nyxi_source_crawl_state
    SET last_checked_at=now(),
        consecutive_failures=consecutive_failures+1,
        last_error=$3,
        next_check_at=$4,
        lease_owner=NULL,
        lease_expires_at=NULL,
        updated_at=now()
    WHERE source_id=$1 AND lease_owner=$2
  `, [source.sourceId, workerId, message.slice(0, 4000), new Date(Date.now() + retryMs)]);
}

function sourceAllowedHosts(source: SourceLease, hostname: string): string[] {
  const hosts = new Set<string>();
  addHost(hosts, hostname);
  const configured = source.metadata.allowedHosts;
  if (Array.isArray(configured)) {
    for (const value of configured) if (typeof value === "string" && value.trim()) addHost(hosts, value);
  }
  return [...hosts];
}

function addHost(target: Set<string>, value: string): void {
  const host = value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]?.replace(/^www\./, "");
  if (!host || !/^[a-z0-9.-]+$/.test(host)) return;
  target.add(host);
  target.add(`www.${host}`);
}

function acceptHeader(method: string): string {
  switch (method) {
    case "pdf": return "application/pdf,application/octet-stream;q=0.8,*/*;q=0.2";
    case "json":
    case "api": return "application/json,text/json;q=0.9,*/*;q=0.2";
    case "csv": return "text/csv,application/csv;q=0.9,text/plain;q=0.5,*/*;q=0.2";
    case "rss": return "application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.8,*/*;q=0.2";
    case "sitemap": return "application/xml,text/xml;q=0.9,text/plain;q=0.5,*/*;q=0.2";
    default: return "text/html,application/xhtml+xml,application/pdf;q=0.8,application/xml;q=0.7,*/*;q=0.3";
  }
}

function evidenceHeaders(headers: Readonly<Record<string, string>>): Record<string, string> {
  const keys = [
    "cache-control","content-disposition","content-language","content-length","content-type",
    "date","etag","expires","last-modified","location","vary"
  ];
  const result: Record<string, string> = {};
  for (const key of keys) if (headers[key]) result[key] = headers[key];
  return result;
}

function rawObjectKey(sourceId: string, sha256: string, contentType: string | undefined, finalUrl: string): string {
  return `private/nyxi/source-archive/${sourceId}/${sha256}.${extension(contentType, finalUrl)}`;
}

function extension(contentType: string | undefined, rawUrl: string): string {
  const type = contentType?.toLowerCase() ?? "";
  if (type.includes("pdf")) return "pdf";
  if (type.includes("json")) return "json";
  if (type.includes("csv")) return "csv";
  if (type.includes("xml") || type.includes("rss") || type.includes("atom")) return "xml";
  if (type.includes("html")) return "html";
  if (type.startsWith("text/")) return "txt";
  const pathname = new URL(rawUrl).pathname.toLowerCase();
  const match = pathname.match(/\.([a-z0-9]{1,8})$/);
  return match?.[1] && ["pdf","json","csv","xml","html","htm","txt","zip"].includes(match[1]) ? match[1] : "bin";
}

function intervalMs(updateFrequency: string): number {
  switch (updateFrequency) {
    case "continuous": return 6 * 60 * 60 * 1000;
    case "daily": return 24 * 60 * 60 * 1000;
    case "weekly": return 7 * 24 * 60 * 60 * 1000;
    case "monthly": return 30 * 24 * 60 * 60 * 1000;
    case "quarterly": return 90 * 24 * 60 * 60 * 1000;
    case "annual": return 365 * 24 * 60 * 60 * 1000;
    case "event_driven": return 7 * 24 * 60 * 60 * 1000;
    case "irregular": return 30 * 24 * 60 * 60 * 1000;
    default: return 30 * 24 * 60 * 60 * 1000;
  }
}

function workerMode(raw: string | undefined): WorkerMode {
  const value = raw?.trim() || "continuous";
  if (value === "continuous" || value === "drain") return value;
  throw new Error("BLS_NYXI_SOURCE_MODE must be continuous or drain");
}
function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function required(value: unknown, name: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${name} is required`);
  return text;
}
function optional(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}
function integer(value: unknown, name: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`${name} must be an integer`);
  return n;
}
function nullableInteger(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : undefined;
}
function positive(raw: string | undefined, fallback: number, name: string): number {
  const value = raw?.trim() ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}
function bounded(raw: string | undefined, fallback: number, min: number, max: number, name: string): number {
  const value = raw?.trim() ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}
function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function log(level: "info" | "error", event: string, details: Record<string, unknown>): void {
  console[level](JSON.stringify({ level, event, at: new Date().toISOString(), ...details }));
}
