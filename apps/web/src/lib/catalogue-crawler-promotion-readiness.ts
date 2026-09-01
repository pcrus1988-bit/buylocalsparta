import type { SqlExecutor, SqlRow } from "@buy-local-sparta/core";

export type CatalogWebCrawlPromotionBlockerCode =
  | "job_not_found"
  | "job_not_completed"
  | "source_inactive"
  | "source_key_collision"
  | "no_accepted_products";

export type CatalogWebCrawlPromotionBlocker = Readonly<{
  code: CatalogWebCrawlPromotionBlockerCode;
  message: string;
}>;

export type CatalogWebCrawlPromotionReadiness = Readonly<{
  jobId: string;
  ready: boolean;
  jobStatus?: string;
  sourceActive: boolean;
  acceptedProductCount: number;
  collisionProductKeyCount: number;
  blockers: readonly CatalogWebCrawlPromotionBlocker[];
}>;

type PromotionReadinessRow = SqlRow & Readonly<{
  job_id: unknown;
  job_exists: unknown;
  job_status: unknown;
  source_active: unknown;
  accepted_product_count: unknown;
  collision_product_key_count: unknown;
}>;

export async function evaluateCatalogWebCrawlPromotionReadiness(
  tx: SqlExecutor,
  jobIds: readonly string[],
): Promise<ReadonlyMap<string, CatalogWebCrawlPromotionReadiness>> {
  const uniqueJobIds = [...new Set(jobIds.map((value) => value.trim()).filter(Boolean))];
  if (uniqueJobIds.length === 0) return new Map();

  const result = await tx.query<PromotionReadinessRow>(`
    WITH requested AS (
      SELECT unnest($1::uuid[]) AS job_id
    )
    SELECT
      requested.job_id,
      (job.id IS NOT NULL) AS job_exists,
      job.status AS job_status,
      COALESCE(source.active, false) AS source_active,
      COALESCE((
        SELECT count(DISTINCT extraction.source_product_key)::integer
        FROM public.catalog_web_product_extractions extraction
        JOIN public.catalog_web_crawl_pages page ON page.id=extraction.page_id
        WHERE page.job_id=requested.job_id
          AND extraction.status IN ('accepted','promoted')
      ), 0) AS accepted_product_count,
      COALESCE((
        SELECT count(*)::integer
        FROM (
          SELECT extraction.source_product_key
          FROM public.catalog_web_product_extractions extraction
          JOIN public.catalog_web_crawl_pages page ON page.id=extraction.page_id
          WHERE page.job_id=requested.job_id
            AND extraction.status IN ('accepted','promoted')
          GROUP BY extraction.source_product_key
          HAVING count(DISTINCT extraction.extracted_payload)>1
        ) collisions
      ), 0) AS collision_product_key_count
    FROM requested
    LEFT JOIN public.catalog_web_crawl_jobs job ON job.id=requested.job_id
    LEFT JOIN public.catalog_sources source ON source.id=job.source_id
  `, [uniqueJobIds]);

  return new Map(result.rows.map((row) => {
    const readiness = buildCatalogWebCrawlPromotionReadiness(row);
    return [readiness.jobId, readiness] as const;
  }));
}

export function buildCatalogWebCrawlPromotionReadiness(row: PromotionReadinessRow): CatalogWebCrawlPromotionReadiness {
  const jobId = requiredString(row.job_id, "crawler promotion readiness job id");
  const jobExists = row.job_exists === true;
  const jobStatus = optionalString(row.job_status);
  const sourceActive = row.source_active === true;
  const acceptedProductCount = safeCount(row.accepted_product_count);
  const collisionProductKeyCount = safeCount(row.collision_product_key_count);
  const blockers: CatalogWebCrawlPromotionBlocker[] = [];

  if (!jobExists) {
    blockers.push({ code: "job_not_found", message: "Catalogue crawl job was not found." });
  } else {
    if (jobStatus !== "succeeded" && jobStatus !== "partial") {
      blockers.push({ code: "job_not_completed", message: "Crawl must be succeeded or partial before Supplier PIM import." });
    }
    if (!sourceActive) {
      blockers.push({ code: "source_inactive", message: "The catalogue source is not active." });
    }
    if (collisionProductKeyCount > 0) {
      blockers.push({
        code: "source_key_collision",
        message: `${collisionProductKeyCount} source product key${collisionProductKeyCount === 1 ? " has" : "s have"} conflicting accepted payloads and require review.`,
      });
    }
    if (acceptedProductCount === 0) {
      blockers.push({ code: "no_accepted_products", message: "No accepted product extractions are available to import." });
    }
  }

  return {
    jobId,
    ready: blockers.length === 0,
    jobStatus,
    sourceActive,
    acceptedProductCount,
    collisionProductKeyCount,
    blockers,
  };
}

export function catalogWebCrawlPromotionBlockedMessage(readiness: CatalogWebCrawlPromotionReadiness): string {
  if (readiness.ready) return "Catalogue crawl is ready for Supplier PIM import.";
  return `Catalogue crawl is not ready for Supplier PIM import: ${readiness.blockers.map((blocker) => blocker.message).join(" ")}`;
}

function safeCount(value: unknown): number {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function requiredString(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function optionalString(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}
