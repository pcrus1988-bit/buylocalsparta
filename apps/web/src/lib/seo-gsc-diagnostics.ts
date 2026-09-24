import "server-only";

import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { getSeoGlobalSettingsSnapshot } from "./seo-settings";
import {
  inspectAndPersistSearchConsoleUrlSystem,
  syncSearchConsoleHistorySystem
} from "./seo-gsc-history";

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

async function inspectionCandidates(canonicalOrigin: string): Promise<readonly string[]> {
  if (!productionDatabaseConfigured()) return [];
  const origin = new URL(canonicalOrigin).origin;
  const runtime = getProductionPostgresRuntime();

  const governed = await runtime.nativePool.query<CandidateRow>(`
    WITH last_inspection AS (
      SELECT route,max(captured_at) AS last_inspected_at
      FROM public.seo_gsc_url_inspections
      WHERE route IS NOT NULL
      GROUP BY route
    )
    SELECT $1 || u.route AS inspection_url
    FROM public.seo_urls u
    JOIN public.markets m ON m.id=u.market_id AND m.code=$2
    LEFT JOIN last_inspection li ON li.route=u.route
    WHERE u.active=true
      AND u.desired_indexable=true
      AND u.route NOT LIKE '/product/%'
    ORDER BY li.last_inspected_at ASC NULLS FIRST,u.route
    LIMIT 12
  `, [origin, marketCode()]);

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
    LIMIT 12
  `);

  return [...new Set(
    [...governed.rows, ...products.rows]
      .map((row) => row.inspection_url?.trim())
      .filter((value): value is string => Boolean(value))
  )].slice(0, INSPECTION_BATCH_SIZE);
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
  const candidates = await inspectionCandidates(settings.canonicalOrigin);
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
    errors
  };
}
