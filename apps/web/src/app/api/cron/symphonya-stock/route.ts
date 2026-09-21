import { createHash } from "node:crypto";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import { runSymphonyaAutoPublicationSweep } from "../../../../lib/symphonya-auto-publication-runtime";
import {
  refreshSymphonyaOfferStockByExternalIds,
  runSymphonyaStockSyncBurst
} from "../../../../lib/symphonya-stock-sync-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

// Leave enough headroom for a publication sweep to finish before Vercel's hard cap.
// If stock/selection work consumes the budget, publication is safely deferred to a later run.
const PUBLICATION_START_DEADLINE_MS = 30_000;
const PRIORITY_BATCH_LIMIT = 200;
const PUBLISHED_REFRESH_LIMIT = 120;
const PRIORITY_REFRESH_WINDOW_MINUTES = 60;
const FULL_CURSOR_MAX_PAGES = 3;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const cronAuthorized = Boolean(cronSecret) && request.headers.get("authorization") === `Bearer ${cronSecret}`;
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  const requestedMode = url.searchParams.get("mode")?.trim();
  const manualAuthorized = cronAuthorized ? false : await consumeManualToken(token);

  if (!cronAuthorized && !manualAuthorized) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  try {
    const startedAt = Date.now();
    const executionMode = requestedMode === "priority" ? "priority" : "cursor";
    const stock = executionMode === "cursor" ? await runSymphonyaStockSyncBurst(FULL_CURSOR_MAX_PAGES) : null;

    let publishedIds: string[] = [];
    let publicationCandidateIds: string[] = [];
    let priorityIds: string[] = [];
    let priorityOffersUpdated = 0;
    let publication = null;
    let publicationDeferred = false;
    let selectionMs = 0;
    let refreshMs = 0;
    let publicationMs = 0;

    if (executionMode === "cursor" && stock?.claimed && stock.pages > 0) {
      if (Date.now() - startedAt < PUBLICATION_START_DEADLINE_MS) {
        const publicationStartedAt = Date.now();
        publication = await runSymphonyaAutoPublicationSweep();
        publicationMs = Date.now() - publicationStartedAt;
      } else {
        publicationDeferred = true;
      }
    }

    if (executionMode === "priority") {
      const selectionStartedAt = Date.now();
      publishedIds = await oldestPublishedExternalIds(PUBLISHED_REFRESH_LIMIT);
      const candidateLimit = Math.max(0, PRIORITY_BATCH_LIMIT - publishedIds.length);
      if (candidateLimit > 0) {
        publicationCandidateIds = await oldestPublicationCandidateExternalIds(candidateLimit, new Set(publishedIds));
      }
      selectionMs = Date.now() - selectionStartedAt;

      priorityIds = [...new Set([...publishedIds, ...publicationCandidateIds])].slice(0, PRIORITY_BATCH_LIMIT);
      if (priorityIds.length) {
        const refreshStartedAt = Date.now();
        priorityOffersUpdated = await refreshSymphonyaOfferStockByExternalIds(priorityIds);
        refreshMs = Date.now() - refreshStartedAt;
      }

      if (Date.now() - startedAt < PUBLICATION_START_DEADLINE_MS) {
        const publicationStartedAt = Date.now();
        publication = await runSymphonyaAutoPublicationSweep();
        publicationMs = Date.now() - publicationStartedAt;
      } else {
        publicationDeferred = true;
      }
    }

    const elapsedMs = Date.now() - startedAt;
    console.info(JSON.stringify({
      level: "info",
      event: "symphonya.stock_cron_timing",
      executionMode,
      stockPages: stock?.pages ?? 0,
      selectionMs,
      refreshMs,
      publicationMs,
      publicationDeferred,
      prioritySelected: priorityIds.length,
      priorityOffersUpdated,
      elapsedMs,
      at: new Date().toISOString()
    }));

    return Response.json({
      ok: true,
      mode: cronAuthorized ? "cron" : "manual_once",
      executionMode,
      stock,
      publishedSelected: publishedIds.length,
      publicationCandidatesSelected: publicationCandidateIds.length,
      prioritySelected: priorityIds.length,
      priorityOffersUpdated,
      publication,
      publicationDeferred,
      timings: { selectionMs, refreshMs, publicationMs },
      elapsedMs
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "symphonya_stock_sync_failed";
    console.error(JSON.stringify({ level: "error", event: "symphonya.stock_cron_failed", message, at: new Date().toISOString() }));
    return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

async function oldestPublishedExternalIds(limit: number): Promise<string[]> {
  const result = await getProductionPostgresRuntime().sqlPool.query(`
    SELECT dso.external_product_id FROM public.dropship_supplier_offers dso
    JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
    JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
    WHERE ds.code='symphonya' AND ds.active=true AND ds.api_authoritative_availability=true
      AND dso.active=true AND vo.status='approved' AND vo.merchant_visible=true AND vo.merchant_pause_active=false
      AND (dso.availability_expires_at IS NULL OR dso.availability_expires_at<=now()+make_interval(mins=>$2::int))
    GROUP BY dso.external_product_id
    ORDER BY min(dso.availability_expires_at) ASC NULLS FIRST, min(dso.availability_checked_at) ASC NULLS FIRST, dso.external_product_id
    LIMIT $1
  `, [limit, PRIORITY_REFRESH_WINDOW_MINUTES]);
  return result.rows.map((row) => String(row.external_product_id ?? "").trim()).filter(Boolean);
}

async function oldestPublicationCandidateExternalIds(limit: number, excluded: ReadonlySet<string>): Promise<string[]> {
  const result = await getProductionPostgresRuntime().sqlPool.query(`
    SELECT dso.external_product_id FROM public.dropship_supplier_offers dso
    JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
    JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
    JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
    WHERE ds.code='symphonya' AND ds.active=true AND ds.api_authoritative_availability=true
      AND cv.category_id IS NOT NULL AND cv.family_id IS NOT NULL AND cv.suppressed=false AND cv.recalled=false
      AND (vo.status::text IN ('draft','approved') OR (vo.status::text='archived' AND COALESCE(vo.source_payload->>'publishedBy','')='symphonya_auto_publication' AND COALESCE(vo.source_payload->>'publicationState','')='PUBLISHED'))
      AND COALESCE(vo.source_payload->>'pricingManagedBy','') IN ('symphonya_auto_v1','supplier_defaults_v1')
      AND COALESCE(vo.source_payload->>'pricingPending','true')='false'
      AND dso.supplier_cost_minor>0 AND vo.customer_price_minor>=dso.supplier_cost_minor
      AND dso.cached_available=true AND COALESCE(dso.cached_quantity,0)>0
      AND COALESCE(dso.availability_payload->>'priceHeld','false')<>'true'
      AND (dso.availability_expires_at IS NULL OR dso.availability_expires_at<=now()+make_interval(mins=>$2::int))
      AND EXISTS (SELECT 1 FROM public.product_translations pt WHERE pt.canonical_variant_id=cv.id AND pt.locale='el' AND NULLIF(btrim(pt.title),'') IS NOT NULL)
      AND COALESCE((SELECT s.status::text FROM public.vendor_product_submissions s WHERE s.vendor_id=vo.vendor_id AND s.canonical_variant_id=vo.canonical_variant_id ORDER BY s.updated_at DESC,s.id DESC LIMIT 1),'') <> 'archived'
    GROUP BY dso.external_product_id
    ORDER BY min(dso.availability_expires_at) ASC NULLS FIRST, min(dso.availability_checked_at) ASC NULLS FIRST, dso.external_product_id
    LIMIT $1
  `, [limit + excluded.size, PRIORITY_REFRESH_WINDOW_MINUTES]);
  return result.rows.map((row) => String(row.external_product_id ?? "").trim()).filter((id) => Boolean(id) && !excluded.has(id)).slice(0, limit);
}

async function consumeManualToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const tokenSha256 = createHash("sha256").update(token).digest("hex");
  const result = await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.catalog_sources SET metadata=COALESCE(metadata,'{}'::jsonb)-'symphonyaStockManual', updated_at=now()
    WHERE code='symphonya' AND active=true AND metadata #>> '{symphonyaStockManual,tokenSha256}'=$1 RETURNING id
  `, [tokenSha256]);
  return Boolean(result.rows[0]?.id);
}
