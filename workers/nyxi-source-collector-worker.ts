import { hostname } from "node:os";
import { createPostgresRuntimeFromEnv, EXPECTED_SCHEMA_VERSION } from "../packages/postgres-runtime/src/index.ts";
import { S3ObjectStorage, objectStorageConfigFromEnv } from "../packages/object-storage/src/index.ts";
import { secureCrawlFetch } from "./catalog-crawler/transport.ts";

type WorkerMode = "continuous" | "drain";

type CandidateLease = Readonly<{
  candidateId: string;
  canonicalUrl: string;
  sourceFamilyHint?: string;
  publisherHint?: string;
  jurisdictionHint?: string;
  discoveredFromSourceId: string;
  etag?: string;
  lastModified?: string;
  lastContentSha256?: string;
  lastHttpStatus?: number;
  consecutiveFailures: number;
}>;

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
const discoveryMaxLinks = bounded(process.env.BLS_NYXI_SOURCE_DISCOVERY_MAX_LINKS, 2_000, 0, 20_000, "BLS_NYXI_SOURCE_DISCOVERY_MAX_LINKS");
const discoveryMaxBytes = bounded(process.env.BLS_NYXI_SOURCE_DISCOVERY_MAX_BYTES, 8 * 1024 * 1024, 64 * 1024, 25 * 1024 * 1024, "BLS_NYXI_SOURCE_DISCOVERY_MAX_BYTES");
const candidateRecheckDays = bounded(process.env.BLS_NYXI_CANDIDATE_RECHECK_DAYS, 90, 7, 3650, "BLS_NYXI_CANDIDATE_RECHECK_DAYS");
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
  discoveryMaxLinks,
  discoveryMaxBytes,
  schema: readiness.appliedSchemaVersion
});

try {
  while (!stopping) {
    if (mode === "drain" && processed >= maxItems) break;
    const lease = await claimSource();
    if (lease) {
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
      continue;
    }

    const candidate = await claimCandidate();
    if (!candidate) {
      if (mode === "drain") break;
      await delay(pollMs);
      continue;
    }

    processed += 1;
    try {
      await collectCandidate(candidate);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordCandidateFailure(candidate, message).catch((persistError) => {
        log("error", "nyxi_candidate.failure_persist_failed", {
          candidateId: candidate.candidateId,
          message: persistError instanceof Error ? persistError.message : String(persistError)
        });
      });
      log("error", "nyxi_candidate.fetch_failed", {
        candidateId: candidate.candidateId,
        url: candidate.canonicalUrl,
        consecutiveFailures: candidate.consecutiveFailures + 1,
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

async function claimCandidate(): Promise<CandidateLease | undefined> {
  const result = await runtime.nativePool.query(`
    WITH due AS (
      SELECT candidate.id
      FROM public.nyxi_source_candidates candidate
      WHERE candidate.candidate_status='candidate'
        AND candidate.discovered_from_source_id IS NOT NULL
        AND candidate.next_check_at IS NOT NULL
        AND candidate.next_check_at<=now()
        AND (candidate.lease_expires_at IS NULL OR candidate.lease_expires_at<=now())
      ORDER BY candidate.first_seen_at ASC,candidate.id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE public.nyxi_source_candidates candidate
    SET lease_owner=$1,
        lease_expires_at=now()+($2::text || ' seconds')::interval,
        updated_at=now()
    FROM due
    WHERE candidate.id=due.id
    RETURNING
      candidate.id::text AS candidate_id,
      candidate.canonical_url,
      candidate.source_family_hint,
      candidate.publisher_hint,
      candidate.jurisdiction_hint,
      candidate.discovered_from_source_id::text,
      candidate.etag,
      candidate.last_modified,
      candidate.last_content_sha256,
      candidate.last_http_status,
      candidate.consecutive_failures
  `, [workerId, leaseSeconds]);

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return {
    candidateId: required(row.candidate_id, "candidate_id"),
    canonicalUrl: required(row.canonical_url, "candidate.canonical_url"),
    sourceFamilyHint: optional(row.source_family_hint),
    publisherHint: optional(row.publisher_hint),
    jurisdictionHint: optional(row.jurisdiction_hint),
    discoveredFromSourceId: required(row.discovered_from_source_id, "candidate.discovered_from_source_id"),
    etag: optional(row.etag),
    lastModified: optional(row.last_modified),
    lastContentSha256: optional(row.last_content_sha256),
    lastHttpStatus: nullableInteger(row.last_http_status),
    consecutiveFailures: integer(row.consecutive_failures ?? 0, "candidate.consecutive_failures")
  };
}

async function collectCandidate(candidate: CandidateLease): Promise<void> {
  const canonical = new URL(candidate.canonicalUrl);
  if (canonical.protocol !== "https:") throw new Error("NYXI candidate collector requires HTTPS");
  const allowedHosts = new Set<string>();
  addHost(allowedHosts, canonical.hostname);
  const result = await secureCrawlFetch({
    url: candidate.canonicalUrl,
    policy: {
      allowedHosts: [...allowedHosts],
      allowSubdomains: false,
      allowHttp: false,
      maxRedirects,
      maxResponseBytes
    },
    userAgent,
    timeoutMs: requestTimeoutMs,
    accept: candidateAcceptHeader(candidate.sourceFamilyHint, candidate.canonicalUrl),
    ifNoneMatch: candidate.etag,
    ifModifiedSince: candidate.lastModified
  });

  const nextCheckAt = new Date(Date.now() + candidateRecheckDays * 24 * 60 * 60 * 1000);

  if (result.status === 304) {
    await runtime.nativePool.query(`
      WITH logged AS (
        INSERT INTO public.nyxi_source_candidate_checks(
          candidate_id,outcome,requested_url,final_url,http_status,content_sha256,
          byte_length,etag,last_modified,worker_id,metadata
        )
        VALUES(
          $1,'not_modified',$3,$4,304,$5,$6,$7,$8,$2,
          jsonb_build_object('verifiedSource',false,'interpretationPerformed',false)
        )
        RETURNING id
      )
      UPDATE public.nyxi_source_candidates
      SET last_checked_at=now(),
          last_http_status=COALESCE(last_http_status,304),
          consecutive_failures=0,
          last_error=NULL,
          next_check_at=$9,
          lease_owner=NULL,
          lease_expires_at=NULL,
          updated_at=now()
      WHERE id=$1 AND lease_owner=$2
    `, [
      candidate.candidateId,
      workerId,
      candidate.canonicalUrl,
      result.finalUrl,
      candidate.lastContentSha256 ?? null,
      result.responseBytes,
      result.headers.etag ?? candidate.etag ?? null,
      result.headers["last-modified"] ?? candidate.lastModified ?? null,
      nextCheckAt
    ]);
    log("info", "nyxi_candidate.not_modified", { candidateId: candidate.candidateId });
    return;
  }

  if (result.status === 429 || result.status >= 500) {
    throw new Error(`Candidate returned retryable HTTP ${result.status}`);
  }

  const contentType = result.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() || undefined;
  const contentChanged = !candidate.lastContentSha256 || candidate.lastContentSha256 !== result.responseSha256;
  const successful = result.status >= 200 && result.status < 400;
  let objectKey: string | undefined;

  if (successful && contentChanged && result.body.length > 0) {
    objectKey = candidateRawObjectKey(candidate.candidateId, result.responseSha256, contentType, result.finalUrl);
    const existing = await storage.head(objectKey);
    if (existing) {
      if (existing.byteSize !== result.body.length) throw new Error("Existing NYXI candidate archive object has unexpected byte size");
    } else {
      await storage.write({
        objectKey,
        body: result.body,
        contentType,
        cacheControl: "private, max-age=31536000, immutable",
        metadata: {
          candidateid: candidate.candidateId,
          sha256: result.responseSha256,
          verifiedsource: "false"
        }
      });
    }
  }

  const client = await runtime.nativePool.connect();
  try {
    await client.query("BEGIN");
    if (successful && contentChanged) {
      await client.query(`
        INSERT INTO public.nyxi_source_candidate_snapshots(
          candidate_id,retrieved_at,http_status,content_type,content_sha256,
          raw_object_key,byte_length,etag,last_modified,metadata
        )
        VALUES($1,now(),$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
        ON CONFLICT (candidate_id,content_sha256) WHERE content_sha256 IS NOT NULL DO NOTHING
      `, [
        candidate.candidateId,
        result.status,
        contentType ?? null,
        result.responseSha256,
        objectKey ?? null,
        result.responseBytes,
        result.headers.etag ?? null,
        result.headers["last-modified"] ?? null,
        JSON.stringify({
          requestedUrl: candidate.canonicalUrl,
          finalUrl: result.finalUrl,
          discoveredFromSourceId: candidate.discoveredFromSourceId,
          publisherHint: candidate.publisherHint ?? null,
          jurisdictionHint: candidate.jurisdictionHint ?? null,
          sourceFamilyHint: candidate.sourceFamilyHint ?? null,
          redirectChain: result.redirectChain,
          responseHeaders: evidenceHeaders(result.headers),
          verifiedSource: false,
          interpretationPerformed: false
        })
      ]);
    }

    await client.query(`
      INSERT INTO public.nyxi_source_candidate_checks(
        candidate_id,outcome,requested_url,final_url,http_status,content_sha256,
        byte_length,etag,last_modified,worker_id,metadata
      )
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
    `, [
      candidate.candidateId,
      successful ? (contentChanged ? "changed" : "unchanged") : "http_error",
      candidate.canonicalUrl,
      result.finalUrl,
      result.status,
      result.responseSha256,
      result.responseBytes,
      result.headers.etag ?? null,
      result.headers["last-modified"] ?? null,
      workerId,
      JSON.stringify({
        archived: Boolean(objectKey),
        verifiedSource: false,
        interpretationPerformed: false
      })
    ]);

    await client.query(`
      UPDATE public.nyxi_source_candidates
      SET last_checked_at=now(),
          last_http_status=$3,
          last_content_sha256=CASE WHEN $4 THEN $5 ELSE last_content_sha256 END,
          etag=CASE WHEN $4 THEN $6 ELSE etag END,
          last_modified=CASE WHEN $4 THEN $7 ELSE last_modified END,
          consecutive_failures=CASE WHEN $4 THEN 0 ELSE consecutive_failures+1 END,
          last_error=CASE WHEN $4 THEN NULL ELSE $8 END,
          next_check_at=$9,
          lease_owner=NULL,
          lease_expires_at=NULL,
          updated_at=now()
      WHERE id=$1 AND lease_owner=$2
    `, [
      candidate.candidateId,
      workerId,
      result.status,
      successful,
      successful ? result.responseSha256 : null,
      result.headers.etag ?? null,
      result.headers["last-modified"] ?? null,
      successful ? null : `HTTP ${result.status}`,
      successful ? nextCheckAt : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    ]);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  log("info", "nyxi_candidate.checked", {
    candidateId: candidate.candidateId,
    status: result.status,
    sha256: result.responseSha256,
    archived: Boolean(objectKey),
    verifiedSource: false
  });
}

async function recordCandidateFailure(candidate: CandidateLease, message: string): Promise<void> {
  const failures = candidate.consecutiveFailures + 1;
  const retryMs = Math.min(30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000 * (2 ** Math.min(8, Math.max(0, failures - 1))));
  await runtime.nativePool.query(`
    WITH logged AS (
      INSERT INTO public.nyxi_source_candidate_checks(
        candidate_id,outcome,requested_url,error_message,worker_id,metadata
      )
      VALUES(
        $1,'fetch_error',$3,$4,$2,
        jsonb_build_object('verifiedSource',false,'interpretationPerformed',false)
      )
      RETURNING id
    )
    UPDATE public.nyxi_source_candidates
    SET last_checked_at=now(),
        consecutive_failures=consecutive_failures+1,
        last_error=$4,
        next_check_at=$5,
        lease_owner=NULL,
        lease_expires_at=NULL,
        updated_at=now()
    WHERE id=$1 AND lease_owner=$2
  `, [
    candidate.candidateId,
    workerId,
    candidate.canonicalUrl,
    message.slice(0, 4000),
    new Date(Date.now() + retryMs)
  ]);
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
      WITH logged AS (
        INSERT INTO public.nyxi_source_checks(
          source_id,outcome,requested_url,final_url,http_status,content_sha256,
          byte_length,etag,last_modified,worker_id,metadata
        )
        VALUES(
          $1,'not_modified',$3,$4,304,$5,$6,$7,$8,$2,
          jsonb_build_object('interpretationPerformed',false)
        )
        RETURNING id
      )
      UPDATE public.nyxi_source_crawl_state
      SET last_checked_at=now(),
          last_success_at=now(),
          last_http_status=COALESCE(last_http_status,304),
          consecutive_failures=0,
          last_error=NULL,
          next_check_at=$9,
          lease_owner=NULL,
          lease_expires_at=NULL,
          updated_at=now()
      WHERE source_id=$1 AND lease_owner=$2
    `, [
      source.sourceId,
      workerId,
      source.canonicalUrl,
      result.finalUrl,
      source.lastContentSha256 ?? null,
      result.responseBytes,
      result.headers.etag ?? source.etag ?? null,
      result.headers["last-modified"] ?? source.lastModified ?? null,
      new Date(Date.now() + intervalMs(source.updateFrequency))
    ]);
    log("info", "nyxi_source.not_modified", { sourceKey: source.sourceKey });
    return;
  }

  if (result.status === 429 || result.status >= 500) {
    throw new Error(`Source returned retryable HTTP ${result.status}`);
  }

  const contentType = result.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() || undefined;
  const previousRepresentationStatus = source.lastHttpStatus === 304 ? result.status : source.lastHttpStatus;
  const statusChanged = previousRepresentationStatus != null && previousRepresentationStatus !== result.status;
  const contentChanged = !source.lastContentSha256 || source.lastContentSha256 !== result.responseSha256;
  const changed = contentChanged || statusChanged;
  const discoveredCandidates = result.status >= 200 && result.status < 400
    ? discoverCandidateUrls(source, result.body, contentType, result.finalUrl, allowedHosts)
    : [];
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

    if (discoveredCandidates.length) {
      await client.query(`
        INSERT INTO public.nyxi_source_candidates(
          canonical_url,discovered_from_source_id,discovery_method,
          publisher_hint,source_family_hint,jurisdiction_hint,
          candidate_status,first_seen_at,last_seen_at,next_check_at,metadata
        )
        SELECT
          candidate.canonical_url,
          $1::uuid,
          $2,
          $3,
          candidate.source_family_hint,
          $4,
          'candidate',
          now(),
          now(),
          now(),
          jsonb_build_object(
            'discoveredFromSourceKey',$5::text,
            'discoveredFromUrl',$6::text,
            'contentType',$7::text,
            'structuralDiscoveryOnly',true
          )
        FROM jsonb_to_recordset($8::jsonb) AS candidate(
          canonical_url text,
          source_family_hint text
        )
        WHERE candidate.canonical_url<>$6
        ON CONFLICT (canonical_url) DO UPDATE SET
          last_seen_at=now(),
          next_check_at=COALESCE(public.nyxi_source_candidates.next_check_at,EXCLUDED.next_check_at),
          updated_at=now(),
          metadata=public.nyxi_source_candidates.metadata || EXCLUDED.metadata
      `, [
        source.sourceId,
        source.retrievalMethod === "sitemap" ? "sitemap" : "official_link",
        source.publisher,
        source.jurisdiction,
        source.sourceKey,
        source.canonicalUrl,
        contentType ?? null,
        JSON.stringify(discoveredCandidates)
      ]);
    }

    await client.query(`
      INSERT INTO public.nyxi_source_checks(
        source_id,outcome,requested_url,final_url,http_status,content_sha256,
        byte_length,etag,last_modified,worker_id,metadata
      )
      VALUES(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb
      )
    `, [
      source.sourceId,
      result.status >= 400 ? "http_error" : changed ? "changed" : "unchanged",
      source.canonicalUrl,
      result.finalUrl,
      result.status,
      result.responseSha256,
      result.responseBytes,
      result.headers.etag ?? null,
      result.headers["last-modified"] ?? null,
      workerId,
      JSON.stringify({
        archived: Boolean(objectKey),
        candidatesDiscovered: discoveredCandidates.length,
        interpretationPerformed: false
      })
    ]);

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
    changed,
    candidatesDiscovered: discoveredCandidates.length
  });
}

async function recordFailure(source: SourceLease, message: string): Promise<void> {
  const failures = source.consecutiveFailures + 1;
  const retryMs = Math.min(24 * 60 * 60 * 1000, 30 * 60 * 1000 * (2 ** Math.min(5, Math.max(0, failures - 1))));
  await runtime.nativePool.query(`
    WITH logged AS (
      INSERT INTO public.nyxi_source_checks(
        source_id,outcome,requested_url,error_message,worker_id,metadata
      )
      VALUES(
        $1,'fetch_error',$3,$4,$2,
        jsonb_build_object('interpretationPerformed',false)
      )
      RETURNING id
    )
    UPDATE public.nyxi_source_crawl_state
    SET last_checked_at=now(),
        consecutive_failures=consecutive_failures+1,
        last_error=$4,
        next_check_at=$5,
        lease_owner=NULL,
        lease_expires_at=NULL,
        updated_at=now()
    WHERE source_id=$1 AND lease_owner=$2
  `, [
    source.sourceId,
    workerId,
    source.canonicalUrl,
    message.slice(0, 4000),
    new Date(Date.now() + retryMs)
  ]);
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

function discoverCandidateUrls(
  source: SourceLease,
  body: Buffer,
  contentType: string | undefined,
  finalUrl: string,
  allowedHosts: readonly string[]
): readonly Readonly<{ canonical_url: string; source_family_hint: string }>[] {
  if (discoveryMaxLinks === 0 || body.length === 0) return [];
  const type = contentType?.toLowerCase() ?? "";
  const isHtml = type.includes("html") || source.retrievalMethod === "html";
  const isXml = type.includes("xml") || type.includes("rss") || type.includes("atom")
    || source.retrievalMethod === "sitemap" || source.retrievalMethod === "rss";
  if (!isHtml && !isXml) return [];

  const scan = body.subarray(0, Math.min(body.length, discoveryMaxBytes)).toString("utf8");
  const rawLinks: string[] = [];

  if (isHtml) {
    const hrefPattern = /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
    for (let match = hrefPattern.exec(scan); match && rawLinks.length < discoveryMaxLinks * 4; match = hrefPattern.exec(scan)) {
      const value = match[1] ?? match[2];
      if (value) rawLinks.push(value);
    }
  }

  if (isXml) {
    const locPattern = /<loc\b[^>]*>\s*([^<]+?)\s*<\/loc>/gi;
    for (let match = locPattern.exec(scan); match && rawLinks.length < discoveryMaxLinks * 4; match = locPattern.exec(scan)) {
      if (match[1]) rawLinks.push(match[1]);
    }
  }

  const allowed = new Set(allowedHosts.map((host) => host.toLowerCase().replace(/^www\./, "")));
  const seen = new Set<string>();
  const candidates: Array<Readonly<{ canonical_url: string; source_family_hint: string }>> = [];
  for (const raw of rawLinks) {
    if (candidates.length >= discoveryMaxLinks) break;
    const decoded = raw.replace(/&amp;/gi, "&").trim();
    if (!decoded || decoded.startsWith("#") || /^(?:mailto|tel|javascript|data):/i.test(decoded)) continue;
    let url: URL;
    try {
      url = new URL(decoded, finalUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "https:") continue;
    const normalizedHost = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!allowed.has(normalizedHost)) continue;

    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (lower.startsWith("utm_") || ["gclid","fbclid","mc_cid","mc_eid"].includes(lower)) {
        url.searchParams.delete(key);
      }
    }
    const canonical = url.toString();
    if (canonical === source.canonicalUrl || seen.has(canonical)) continue;
    seen.add(canonical);
    candidates.push({
      canonical_url: canonical,
      source_family_hint: candidateFamilyHint(url.pathname)
    });
  }
  return candidates;
}

function candidateFamilyHint(pathname: string): string {
  const path = pathname.toLowerCase();
  if (/\.pdf$/.test(path) || /(?:^|\/)(?:sds|msds|safety[-_ ]?data)(?:\/|[-_.]|$)/.test(path)) return "manufacturer_sds";
  if (/\.(?:csv|json|xml)$/.test(path) || /(?:sitemap|feed|api)/.test(path)) return "structured_source";
  if (/(?:catalog|catalogue|collection|colors?|colours?|products?)/.test(path)) return "manufacturer_catalogue";
  if (/(?:ingredient|formula|technical|manual|guide|faq|safety)/.test(path)) return "technical_reference";
  return "official_page";
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

function candidateAcceptHeader(sourceFamilyHint: string | undefined, rawUrl: string): string {
  const pathname = new URL(rawUrl).pathname.toLowerCase();
  if (sourceFamilyHint === "manufacturer_sds" || pathname.endsWith(".pdf")) return "application/pdf,text/html;q=0.8,*/*;q=0.3";
  if (/\.(?:json)$/i.test(pathname)) return "application/json,text/plain;q=0.5,*/*;q=0.2";
  if (/\.(?:csv)$/i.test(pathname)) return "text/csv,text/plain;q=0.8,*/*;q=0.2";
  if (/\.(?:xml)$/i.test(pathname) || sourceFamilyHint === "structured_source") return "application/xml,text/xml;q=0.9,*/*;q=0.2";
  return "text/html,application/xhtml+xml,application/pdf;q=0.8,*/*;q=0.3";
}

function candidateRawObjectKey(candidateId: string, sha256: string, contentType: string | undefined, finalUrl: string): string {
  return `private/nyxi/candidate-archive/${candidateId}/${sha256}.${extension(contentType, finalUrl)}`;
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
