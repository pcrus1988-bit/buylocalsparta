import "server-only";

import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { getSeoGlobalSettingsSnapshot } from "./seo-settings";
import {
  deleteSearchConsoleSitemap,
  getSearchConsoleSitemapStatus,
  submitSearchConsoleSitemap
} from "./seo-search-console";
import {
  inspectAndPersistSearchConsoleUrlSystem,
  syncSearchConsoleHistorySystem
} from "./seo-gsc-history";
import { getPublicVendorSitemapInventory } from "./vendor-sitemap-inventory";
import { researchVendorIndexEligibility } from "./seo-visibility-policy";

const INSPECTION_BATCH_SIZE = 24;
const CONCURRENCY = 4;

type CandidateRow = Readonly<{ inspection_url: string }>;

export type SeoGscDiagnosticsResult = Readonly<{
  history: Awaited<ReturnType<typeof syncSearchConsoleHistorySystem>>;
  inspected: number;
  pass: number;
  neutral: number;
  fail: number;
  unknown: number;
  blockedByMetaTag: number;
  canonicalMismatch: number;
  sitemap: Readonly<{
    canonicalUrl: string;
    submitted: boolean;
    warnings: number;
    errors: number;
    removed: readonly string[];
    cleanupErrors: readonly string[];
  }>;
  errors: readonly string[];
}>;

function marketCode(): string {
  return process.env.DEFAULT_MARKET?.trim() || "sparta";
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error ?? "Unknown Search Console diagnostics error"))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
}

async function inspectionCandidates(
  canonicalOrigin: string,
  researchVendorMinimumScore: number,
  researchVendorIndexingEnabled: boolean
): Promise<readonly string[]> {
  if (!productionDatabaseConfigured()) return [];
  const origin = new URL(canonicalOrigin).origin;
  const runtime = getProductionPostgresRuntime();

  const governed = await runtime.nativePool.query<CandidateRow>(`
    WITH last_inspection AS (
      SELECT route,max(captured_at) AS last_inspected_at
      FROM public.seo_gsc_url_inspections
      WHERE route IS NOT NULL
      GROUP BY route
    ), eligible AS (
      SELECT u.route,li.last_inspected_at
      FROM public.seo_urls u
      JOIN public.markets m ON m.id=u.market_id AND m.code=$2
      LEFT JOIN last_inspection li ON li.route=u.route
      WHERE u.active=true
        AND u.desired_indexable=true
        AND u.route NOT LIKE '/product/%'
        AND u.route NOT LIKE '/vendor/%'
    ), core AS (
      SELECT route,last_inspected_at
      FROM eligible
      WHERE route IN ('/','/shop')
      ORDER BY last_inspected_at ASC NULLS FIRST,route
      LIMIT 2
    ), categories AS (
      SELECT route,last_inspected_at
      FROM eligible
      WHERE route LIKE '/category/%'
      ORDER BY last_inspected_at ASC NULLS FIRST,route
      LIMIT 4
    ), sampled AS (
      SELECT route,last_inspected_at,0 AS priority FROM core
      UNION ALL
      SELECT route,last_inspected_at,1 AS priority FROM categories
    )
    SELECT $1 || route AS inspection_url
    FROM sampled
    ORDER BY priority,last_inspected_at ASC NULLS FIRST,route
  `, [origin, marketCode()]);

  // The persisted SEO URL registry predates the September research-vendor policy
  // recovery and can be stale between manual admin refreshes. Vendor inspection
  // sampling therefore comes from the same lightweight current projection and
  // eligibility rule used by the sitemap, while inspection history still decides
  // which eligible vendors are sampled first.
  const vendorInventory = await getPublicVendorSitemapInventory();
  const vendorRoutes = vendorInventory.flatMap((vendor) => {
    if (vendor.directoryStatus === "partner") return [`/vendor/${encodeURIComponent(vendor.id)}`];
    const quality = researchVendorIndexEligibility(vendor, {
      enabled: researchVendorIndexingEnabled,
      minimumScore: researchVendorMinimumScore
    });
    return quality.eligible ? [`/vendor/${encodeURIComponent(vendor.id)}`] : [];
  });
  const vendorHistory = vendorRoutes.length
    ? await runtime.nativePool.query<{ route: string; last_inspected_at: Date | string | null }>(`
        SELECT requested.route,max(i.captured_at) AS last_inspected_at
        FROM unnest($1::text[]) requested(route)
        LEFT JOIN public.seo_gsc_url_inspections i ON i.route=requested.route
        GROUP BY requested.route
      `, [vendorRoutes])
    : { rows: [] as { route: string; last_inspected_at: Date | string | null }[] };
  const vendorUrls = vendorHistory.rows
    .sort((left,right) => {
      const leftTime = left.last_inspected_at ? new Date(left.last_inspected_at).getTime() : 0;
      const rightTime = right.last_inspected_at ? new Date(right.last_inspected_at).getTime() : 0;
      return leftTime - rightTime || left.route.localeCompare(right.route);
    })
    .slice(0,8)
    .map((row) => origin + row.route);

  const products = await runtime.nativePool.query<CandidateRow>(`
    WITH preferred AS (
      SELECT DISTINCT ON (mps.offer_id)
        mps.offer_id,
        mps.last_submitted_payload->'productAttributes'->>'link' AS inspection_url
      FROM public.merchant_product_sync mps
      WHERE mps.merchant_account_id='5849642952'
        AND mps.feed_label='GR'
        AND mps.sync_status='synced'
        AND mps.content_language IN ('el','en')
        AND (mps.last_submitted_payload->'productAttributes'->>'availability')='IN_STOCK'
        AND NULLIF(BTRIM(mps.last_submitted_payload->'productAttributes'->>'link'),'') IS NOT NULL
      ORDER BY
        mps.offer_id,
        CASE WHEN mps.content_language='el' THEN 0 ELSE 1 END,
        mps.last_success_at DESC NULLS LAST
    ), candidate AS (
      SELECT
        p.inspection_url,
        regexp_replace(p.inspection_url,'^https://kontamou\\.site','') AS route
      FROM preferred p
      WHERE p.inspection_url LIKE 'https://kontamou.site/product/%'
    ), last_inspection AS (
      SELECT route,max(captured_at) AS last_inspected_at
      FROM public.seo_gsc_url_inspections
      WHERE route LIKE '/product/%'
      GROUP BY route
    )
    SELECT c.inspection_url
    FROM candidate c
    LEFT JOIN last_inspection li ON li.route=c.route
    ORDER BY li.last_inspected_at ASC NULLS FIRST,c.route
    LIMIT 10
  `);

  return [...new Set(
    [...governed.rows, ...vendorUrls.map((inspection_url) => ({ inspection_url })), ...products.rows]
      .map((row) => row.inspection_url?.trim())
      .filter((value): value is string => Boolean(value))
  )].slice(0, INSPECTION_BATCH_SIZE);
}

async function reconcileSitemaps(canonicalOrigin: string) {
  const canonicalUrl = new URL("/sitemap.xml", `${canonicalOrigin.replace(/\/$/, "")}/`).toString();
  const canonical = await getSearchConsoleSitemapStatus(canonicalUrl);
  if (!canonical.submitted) await submitSearchConsoleSitemap(canonicalUrl);

  const cleanupCandidates = [
    new URL("/sitemap", `${canonicalOrigin.replace(/\/$/, "")}/`).toString()
  ];
  const origin = new URL(canonicalOrigin);
  if (origin.protocol === "https:") {
    cleanupCandidates.push(`http://${origin.host}/sitemap.xml`);
  }

  const removed: string[] = [];
  const cleanupErrors: string[] = [];
  for (const candidate of cleanupCandidates) {
    try {
      await deleteSearchConsoleSitemap(candidate);
      removed.push(candidate);
    } catch (error) {
      cleanupErrors.push(`${candidate}: ${errorText(error)}`);
    }
  }

  const refreshed = await getSearchConsoleSitemapStatus(canonicalUrl);
  return {
    canonicalUrl,
    submitted: refreshed.submitted,
    warnings: refreshed.warnings,
    errors: refreshed.errors,
    removed,
    cleanupErrors
  } as const;
}

async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

export async function syncSeoGscDiagnostics(): Promise<SeoGscDiagnosticsResult> {
  if (!productionDatabaseConfigured()) throw new Error("Search Console diagnostics require PostgreSQL runtime.");
  const [{ settings }, history] = await Promise.all([
    getSeoGlobalSettingsSnapshot(),
    syncSearchConsoleHistorySystem()
  ]);
  const sitemap = await reconcileSitemaps(settings.canonicalOrigin);
  const candidates = await inspectionCandidates(
    settings.canonicalOrigin,
    settings.researchVendorMinimumScore,
    settings.researchVendorIndexingEnabled
  );
  const errors: string[] = [];
  let pass = 0;
  let neutral = 0;
  let fail = 0;
  let unknown = 0;
  let blockedByMetaTag = 0;
  let canonicalMismatch = 0;

  await mapConcurrent(candidates, CONCURRENCY, async (url) => {
    try {
      const saved = await inspectAndPersistSearchConsoleUrlSystem(url);
      const inspection = saved.inspection;
      if (inspection.verdict === "PASS") pass += 1;
      else if (inspection.verdict === "NEUTRAL") neutral += 1;
      else if (inspection.verdict === "FAIL") fail += 1;
      else unknown += 1;
      if (inspection.indexingState === "BLOCKED_BY_META_TAG") blockedByMetaTag += 1;
      if (inspection.googleCanonical && inspection.userCanonical && inspection.googleCanonical !== inspection.userCanonical) canonicalMismatch += 1;
    } catch (error) {
      errors.push(`${url}: ${errorText(error)}`);
    }
  });

  return {
    history,
    inspected: candidates.length - errors.length,
    pass,
    neutral,
    fail,
    unknown,
    blockedByMetaTag,
    canonicalMismatch,
    sitemap,
    errors: [...errors, ...sitemap.cleanupErrors]
  };
}
