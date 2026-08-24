import type { SqlPool, SqlRow } from "../../packages/core/src/index.ts";
import type { ExtractedProductCandidate } from "../../packages/core/src/index.ts";
import { validateExtractedProductCandidate } from "../../packages/core/src/index.ts";
import type { SecureCrawlFetchResult } from "./transport.ts";

export type ClaimedCrawlJob = Readonly<{
  jobId: string;
  profileId: string;
  sourceId: string;
  crawlMode: "discovery" | "full" | "category" | "single";
  seedUrl?: string;
  policySnapshot: unknown;
  extractorVersion: string;
  attemptCount: number;
}>;

export type CrawlPageRecord = Readonly<{
  id: string;
  status: "queued" | "fetching" | "fetched" | "skipped" | "failed";
  depth: number;
}>;

export type RememberedCrawlPage = Readonly<{
  url: string;
  normalizedUrl: string;
  depth: number;
  discoveredFromPageId?: string;
}>;

export class CrawlJobCancelledError extends Error {
  constructor() { super("Catalogue crawl job cancellation acknowledged"); this.name = "CrawlJobCancelledError"; }
}

export class CatalogCrawlerStore {
  readonly #db: SqlPool;
  constructor(db: SqlPool) { this.#db = db; }

  async claim(workerId: string, leaseSeconds: number): Promise<ClaimedCrawlJob | undefined> {
    const result = await this.#db.query<SqlRow>(`SELECT * FROM bls_private.claim_catalog_web_crawl_job($1,$2)`, [workerId, leaseSeconds]);
    const row = result.rows[0];
    if (!row) return undefined;
    const crawlMode = String(row.crawl_mode) as ClaimedCrawlJob["crawlMode"];
    if (!(["discovery", "full", "category", "single"] as const).includes(crawlMode)) throw new Error(`Invalid crawl mode ${crawlMode}`);
    return {
      jobId: required(row.job_id, "job_id"), profileId: required(row.profile_id, "profile_id"), sourceId: required(row.source_id, "source_id"), crawlMode,
      seedUrl: optional(row.seed_url), policySnapshot: row.policy_snapshot, extractorVersion: required(row.extractor_version, "extractor_version"), attemptCount: integer(row.attempt_count, "attempt_count")
    };
  }

  async shouldCancel(jobId: string, workerId: string): Promise<boolean> {
    const result = await this.#db.query<SqlRow>(`SELECT bls_private.catalog_web_crawl_job_should_cancel($1,$2) AS should_cancel`, [jobId, workerId]);
    return result.rows[0]?.should_cancel === true;
  }

  async acknowledgeCancel(jobId: string, workerId: string): Promise<void> {
    await this.syncCounters(jobId);
    await this.#db.query(`SELECT bls_private.acknowledge_catalog_web_crawl_job_cancel($1,$2)`, [jobId, workerId]);
  }

  async checkpoint(jobId: string, workerId: string, leaseSeconds: number): Promise<void> {
    if (await this.shouldCancel(jobId, workerId)) {
      await this.acknowledgeCancel(jobId, workerId);
      throw new CrawlJobCancelledError();
    }
    await this.#db.query(`SELECT bls_private.renew_catalog_web_crawl_job_lease($1,$2,$3)`, [jobId, workerId, leaseSeconds]);
  }

  async renew(jobId: string, workerId: string, leaseSeconds: number): Promise<void> { await this.checkpoint(jobId, workerId, leaseSeconds); }

  async ensurePage(input: { jobId: string; url: string; normalizedUrl: string; depth: number; discoveredFromPageId?: string }): Promise<CrawlPageRecord> {
    const result = await this.#db.query<SqlRow>(`
      INSERT INTO public.catalog_web_crawl_pages(job_id,discovered_from_page_id,url,normalized_url,depth,status)
      VALUES($1,$2,$3,$4,$5,'queued')
      ON CONFLICT (job_id,normalized_url) DO UPDATE
      SET depth=LEAST(public.catalog_web_crawl_pages.depth,EXCLUDED.depth), discovered_from_page_id=COALESCE(public.catalog_web_crawl_pages.discovered_from_page_id,EXCLUDED.discovered_from_page_id), updated_at=now()
      RETURNING id,status,depth
    `, [input.jobId, input.discoveredFromPageId ?? null, input.url, input.normalizedUrl, input.depth]);
    const row = result.rows[0];
    if (!row) throw new Error("Crawler page upsert returned no row");
    return { id: required(row.id, "page.id"), status: String(row.status) as CrawlPageRecord["status"], depth: integer(row.depth, "page.depth") };
  }

  async rememberPages(jobId: string, pages: readonly RememberedCrawlPage[]): Promise<void> {
    if (!pages.length) return;
    const chunkSize = 500;
    for (let offset = 0; offset < pages.length; offset += chunkSize) {
      const chunk = pages.slice(offset, offset + chunkSize);
      await this.#db.query(`
        INSERT INTO public.catalog_web_crawl_pages(job_id,discovered_from_page_id,url,normalized_url,depth,status)
        SELECT $1::uuid, NULLIF(x.discovered_from_page_id,'')::uuid, x.url, x.normalized_url, x.depth, 'queued'
        FROM jsonb_to_recordset($2::jsonb) AS x(url text, normalized_url text, depth integer, discovered_from_page_id text)
        ON CONFLICT (job_id,normalized_url) DO UPDATE
        SET depth=LEAST(public.catalog_web_crawl_pages.depth,EXCLUDED.depth),
            discovered_from_page_id=COALESCE(public.catalog_web_crawl_pages.discovered_from_page_id,EXCLUDED.discovered_from_page_id),
            updated_at=now()
      `, [jobId, JSON.stringify(chunk.map((page) => ({
        url: page.url,
        normalized_url: page.normalizedUrl,
        depth: page.depth,
        discovered_from_page_id: page.discoveredFromPageId ?? ""
      })))]);
    }
  }

  async listPendingPages(jobId: string, limit: number): Promise<RememberedCrawlPage[]> {
    const safeLimit = Math.max(1, Math.min(250_000, Math.floor(limit)));
    const result = await this.#db.query<SqlRow>(`
      SELECT url,normalized_url,depth,discovered_from_page_id
      FROM public.catalog_web_crawl_pages
      WHERE job_id=$1 AND status IN ('queued','fetching','failed')
      ORDER BY product_likelihood DESC NULLS LAST, depth ASC, created_at ASC
      LIMIT $2
    `, [jobId, safeLimit]);
    return result.rows.map((row) => ({
      url: required(row.url, "pending.url"),
      normalizedUrl: required(row.normalized_url, "pending.normalized_url"),
      depth: integer(row.depth, "pending.depth"),
      discoveredFromPageId: optional(row.discovered_from_page_id)
    }));
  }

  async markFetching(pageId: string, robotsAllowed: boolean | null): Promise<void> {
    await this.#db.query(`UPDATE public.catalog_web_crawl_pages SET status='fetching',robots_allowed=$2,updated_at=now(),failure_kind=NULL,failure_reason=NULL WHERE id=$1 AND status IN ('queued','failed','fetching')`, [pageId, robotsAllowed]);
  }

  async markSkipped(pageId: string, reason: string, robotsAllowed: boolean | null): Promise<void> {
    await this.#db.query(`UPDATE public.catalog_web_crawl_pages SET status='skipped',skip_reason=$2,robots_allowed=$3,extraction_status='not_applicable',updated_at=now() WHERE id=$1`, [pageId, reason.slice(0, 1000), robotsAllowed]);
  }

  async markFailed(pageId: string, kind: string, reason: string): Promise<void> {
    await this.#db.query(`UPDATE public.catalog_web_crawl_pages SET status='failed',failure_kind=$2,failure_reason=$3,extraction_status='failed',updated_at=now() WHERE id=$1`, [pageId, kind.slice(0, 100), reason.slice(0, 2000)]);
  }

  async markFetched(input: { pageId: string; result: SecureCrawlFetchResult; productLikelihood: number; extractionStatus: "not_applicable" | "extracted" | "review_required" }): Promise<void> {
    await this.#db.query(`
      UPDATE public.catalog_web_crawl_pages
      SET status='fetched',url=$2,normalized_url=$2,robots_allowed=COALESCE(robots_allowed,true), resolved_addresses=($3::text[])::inet[],fetch_mode='http',http_status=$4,
          content_type=$5,response_bytes=$6,response_sha256=$7,etag=$8,last_modified_header=$9, redirect_chain=$10::jsonb,product_likelihood=$11,extraction_status=$12,
          fetched_at=now(),failure_kind=NULL,failure_reason=NULL,updated_at=now()
      WHERE id=$1
    `, [input.pageId,input.result.finalUrl,[...input.result.resolvedAddresses],input.result.status,input.result.headers["content-type"] ?? null,input.result.responseBytes,input.result.responseSha256,input.result.headers.etag ?? null,input.result.headers["last-modified"] ?? null,JSON.stringify(input.result.redirectChain),input.productLikelihood,input.extractionStatus]);
  }

  async saveExtraction(input: { pageId: string; extractorVersion: string; ordinal: number; candidate: ExtractedProductCandidate }): Promise<"accepted" | "review_required"> {
    const quality = validateExtractedProductCandidate(input.candidate);
    const status = quality.valid ? "accepted" : "review_required";
    const confidence = extractionConfidence(input.candidate);
    await this.#db.query(`
      INSERT INTO public.catalog_web_product_extractions(page_id,extraction_version,ordinal,source_product_key,status,confidence,extracted_payload,field_provenance,quality_payload,accepted_at)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,CASE WHEN $5='accepted' THEN now() ELSE NULL END)
      ON CONFLICT (page_id,extraction_version,ordinal) DO UPDATE
      SET source_product_key=EXCLUDED.source_product_key,status=EXCLUDED.status,confidence=EXCLUDED.confidence,extracted_payload=EXCLUDED.extracted_payload,
          field_provenance=EXCLUDED.field_provenance,quality_payload=EXCLUDED.quality_payload,accepted_at=EXCLUDED.accepted_at,rejection_reason=NULL,updated_at=now()
      WHERE public.catalog_web_product_extractions.status<>'promoted'
    `, [input.pageId,input.extractorVersion,input.ordinal,input.candidate.sourceProductKey,status,confidence,JSON.stringify(input.candidate),JSON.stringify(input.candidate.fieldEvidence),JSON.stringify({ valid: quality.valid, normalizedGtin: quality.normalizedGtin ?? null, issues: quality.issues })]);
    return status;
  }

  async syncCounters(jobId: string): Promise<void> {
    await this.#db.query(`
      WITH page_counts AS (
        SELECT
          count(*)::integer AS discovered,
          count(*) FILTER (WHERE status='fetched')::integer AS fetched,
          count(*) FILTER (WHERE status='skipped')::integer AS skipped,
          count(*) FILTER (WHERE status='failed')::integer AS failed
        FROM public.catalog_web_crawl_pages
        WHERE job_id=$1
      ), extraction_counts AS (
        SELECT
          count(*)::integer AS extracted,
          count(*) FILTER (WHERE e.status='review_required')::integer AS review,
          count(*) FILTER (WHERE e.status='promoted')::integer AS promoted
        FROM public.catalog_web_product_extractions e
        JOIN public.catalog_web_crawl_pages p ON p.id=e.page_id
        WHERE p.job_id=$1
      )
      UPDATE public.catalog_web_crawl_jobs j
      SET discovered_url_count=pc.discovered,
          fetched_page_count=pc.fetched,
          skipped_page_count=pc.skipped,
          failed_page_count=pc.failed,
          extracted_product_count=ec.extracted,
          review_product_count=ec.review,
          promoted_product_count=ec.promoted,
          updated_at=now()
      FROM page_counts pc CROSS JOIN extraction_counts ec
      WHERE j.id=$1
    `, [jobId]);
  }

  async finish(jobId: string, workerId: string): Promise<void> {
    await this.syncCounters(jobId);
    if (await this.shouldCancel(jobId, workerId)) {
      await this.acknowledgeCancel(jobId, workerId);
      throw new CrawlJobCancelledError();
    }
    await this.#db.query(`SELECT bls_private.finish_catalog_web_crawl_job($1,$2)`, [jobId, workerId]);
    await this.syncCounters(jobId);
  }

  async retry(jobId: string, workerId: string, reason: string, delaySeconds: number, terminal: boolean): Promise<void> {
    await this.syncCounters(jobId);
    await this.#db.query(`SELECT bls_private.retry_catalog_web_crawl_job($1,$2,$3,$4,$5)`, [jobId, workerId, reason, delaySeconds, terminal]);
  }
}

function extractionConfidence(candidate: ExtractedProductCandidate): number {
  const values: number[] = [];
  for (const evidence of Object.values(candidate.fieldEvidence)) for (const item of Array.isArray(evidence) ? evidence : [evidence]) values.push(item.confidence);
  for (const price of candidate.prices ?? []) values.push(price.evidence.confidence);
  for (const image of candidate.images ?? []) values.push(image.evidence.confidence);
  return values.length ? Math.min(...values) : 0.5;
}
function required(value: unknown, name: string): string { const text=String(value ?? "").trim(); if (!text) throw new Error(`${name} is required`); return text; }
function optional(value: unknown): string | undefined { const text=String(value ?? "").trim(); return text || undefined; }
function integer(value: unknown, name: string): number { const number=Number(value); if (!Number.isSafeInteger(number)) throw new Error(`${name} must be an integer`); return number; }
