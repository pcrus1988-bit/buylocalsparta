import { createHash } from "node:crypto";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import {
  refreshSymphonyaOfferStockByExternalIds,
  runSymphonyaStockSyncSlice
} from "../../../../lib/symphonya-stock-sync-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

// Keep the storefront-priority refresh comfortably below the serverless timeout.
// Symphonya's targeted supplier calls can be slow, so prefer smaller resumable
// slices over a large batch that repeatedly times out and updates nothing.
const PUBLISHED_REFRESH_LIMIT = 25;
const PUBLICATION_CANDIDATE_REFRESH_LIMIT = 25;
const PRIORITY_REFRESH_WINDOW_MINUTES = 30;
const ROUTE_WORK_BUDGET_MS = 50_000;
const FULL_CURSOR_MIN_BUDGET_MS = 20_000;
const FULL_CURSOR_MAX_BUDGET_MS = 24_000;
const FULL_CURSOR_MAX_PAGES = 4;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const cronAuthorized = Boolean(cronSecret) && request.headers.get("authorization") === `Bearer ${cronSecret}`;
  const token = new URL(request.url).searchParams.get("token")?.trim();
  const manualAuthorized = cronAuthorized ? false : await consumeManualToken(token);

  if (!cronAuthorized && !manualAuthorized) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  try {
    const startedAt = Date.now();
    // Storefront visibility depends on a short-lived supplier availability TTL.
    // Refresh published/visible offers first so bulk publication becomes visible
    // promptly instead of waiting for a full 70k+ supplier stock traversal.
    const publishedIds = await oldestPublishedExternalIds(PUBLISHED_REFRESH_LIMIT);
    const publishedOffersUpdated = publishedIds.length
      ? await refreshSymphonyaOfferStockByExternalIds(publishedIds)
      : 0;

    // Next refresh the best publication candidates: Greek-localised products
    // that already have positive supplier evidence and otherwise satisfy the
    // automatic publication policy. This prevents a 70k+ full stock traversal
    // from delaying the first sellable batches for hours.
    const publicationCandidateIds = await oldestPublicationCandidateExternalIds(
      PUBLICATION_CANDIDATE_REFRESH_LIMIT,
      new Set(publishedIds)
    );
    const publicationCandidateOffersUpdated = publicationCandidateIds.length
      ? await refreshSymphonyaOfferStockByExternalIds(publicationCandidateIds)
      : 0;

    // Priority refreshes must never starve the full catalogue cursor. Use the
    // serverless budget left after targeted calls for a small resumable cursor
    // slice. If targeted supplier calls were unusually slow, fail safe and let
    // the next cron invocation continue rather than overrunning maxDuration.
    const remainingMs = ROUTE_WORK_BUDGET_MS - (Date.now() - startedAt);
    const fullCursorBudgetMs = Math.min(FULL_CURSOR_MAX_BUDGET_MS, Math.max(0, remainingMs - 2_000));
    const stock = fullCursorBudgetMs >= FULL_CURSOR_MIN_BUDGET_MS
      ? await runSymphonyaStockSyncSlice({
          maxDurationMs: fullCursorBudgetMs,
          maxPages: FULL_CURSOR_MAX_PAGES
        })
      : null;

    return Response.json({
      ok: true,
      mode: cronAuthorized ? "cron" : "manual_once",
      publishedSelected: publishedIds.length,
      publishedOffersUpdated,
      publicationCandidatesSelected: publicationCandidateIds.length,
      publicationCandidateOffersUpdated,
      fullCursorBudgetMs,
      stock
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "symphonya_stock_sync_failed";
    console.error(JSON.stringify({
      level: "error",
      event: "symphonya.stock_cron_failed",
      message,
      at: new Date().toISOString()
    }));
    return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

async function oldestPublishedExternalIds(limit: number): Promise<string[]> {
  const result = await getProductionPostgresRuntime().sqlPool.query(`
    SELECT dso.external_product_id
      FROM public.dropship_supplier_offers dso
      JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
      JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
     WHERE ds.code='symphonya'
       AND ds.active=true
       AND ds.api_authoritative_availability=true
       AND dso.active=true
       AND vo.status='approved'
       AND vo.merchant_visible=true
       AND vo.merchant_pause_active=false
       AND (
         dso.availability_expires_at IS NULL
         OR dso.availability_expires_at<=now()+make_interval(mins=>$2::int)
       )
     GROUP BY dso.external_product_id
     ORDER BY min(dso.availability_expires_at) ASC NULLS FIRST,
              min(dso.availability_checked_at) ASC NULLS FIRST,
              dso.external_product_id
     LIMIT $1
  `, [limit, PRIORITY_REFRESH_WINDOW_MINUTES]);
  return result.rows
    .map((row) => String(row.external_product_id ?? "").trim())
    .filter(Boolean);
}

async function oldestPublicationCandidateExternalIds(limit: number, excluded: ReadonlySet<string>): Promise<string[]> {
  const result = await getProductionPostgresRuntime().sqlPool.query(`
    SELECT dso.external_product_id
      FROM public.dropship_supplier_offers dso
      JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
      JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
      JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
     WHERE ds.code='symphonya'
       AND ds.active=true
       AND ds.api_authoritative_availability=true
       AND cv.category_id IS NOT NULL
       AND cv.family_id IS NOT NULL
       AND cv.suppressed=false
       AND cv.recalled=false
       AND (
         vo.status::text IN ('draft','approved')
         OR (
           vo.status::text='archived'
           AND COALESCE(vo.source_payload->>'publishedBy','')='symphonya_auto_publication'
           AND COALESCE(vo.source_payload->>'publicationState','')='PUBLISHED'
         )
       )
       AND COALESCE(vo.source_payload->>'pricingManagedBy','')='symphonya_auto_v1'
       AND COALESCE(vo.source_payload->>'pricingPending','true')='false'
       AND dso.supplier_cost_minor>0
       AND vo.customer_price_minor>=dso.supplier_cost_minor
       AND dso.cached_available=true
       AND COALESCE(dso.cached_quantity,0)>0
       AND COALESCE(dso.availability_payload->>'priceHeld','false')<>'true'
       AND (
         dso.availability_expires_at IS NULL
         OR dso.availability_expires_at<=now()+make_interval(mins=>$2::int)
       )
       AND EXISTS (
         SELECT 1
           FROM public.product_translations pt
          WHERE pt.canonical_variant_id=cv.id
            AND pt.locale='el'
            AND NULLIF(btrim(pt.title),'') IS NOT NULL
       )
       AND COALESCE((
         SELECT s.status::text
           FROM public.vendor_product_submissions s
          WHERE s.vendor_id=vo.vendor_id
            AND s.canonical_variant_id=vo.canonical_variant_id
          ORDER BY s.updated_at DESC,s.id DESC
          LIMIT 1
       ),'') <> 'archived'
     GROUP BY dso.external_product_id
     ORDER BY min(dso.availability_expires_at) ASC NULLS FIRST,
              min(dso.availability_checked_at) ASC NULLS FIRST,
              dso.external_product_id
     LIMIT $1
  `, [limit + excluded.size, PRIORITY_REFRESH_WINDOW_MINUTES]);

  return result.rows
    .map((row) => String(row.external_product_id ?? "").trim())
    .filter((id) => Boolean(id) && !excluded.has(id))
    .slice(0, limit);
}

async function consumeManualToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const tokenSha256 = createHash("sha256").update(token).digest("hex");
  const result = await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.catalog_sources
       SET metadata=COALESCE(metadata,'{}'::jsonb)-'symphonyaStockManual',
           updated_at=now()
     WHERE code='symphonya'
       AND active=true
       AND metadata #>> '{symphonyaStockManual,tokenSha256}'=$1
    RETURNING id
  `, [tokenSha256]);
  return Boolean(result.rows[0]?.id);
}
