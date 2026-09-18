import { createHash } from "node:crypto";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import {
  refreshSymphonyaOfferStockByExternalIds,
  runSymphonyaStockSyncSlice
} from "../../../../lib/symphonya-stock-sync-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

const PUBLISHED_REFRESH_LIMIT = 400;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const cronAuthorized = Boolean(cronSecret) && request.headers.get("authorization") === `Bearer ${cronSecret}`;
  const token = new URL(request.url).searchParams.get("token")?.trim();
  const manualAuthorized = cronAuthorized ? false : await consumeManualToken(token);

  if (!cronAuthorized && !manualAuthorized) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  try {
    // Storefront visibility depends on a short-lived supplier availability TTL.
    // Refresh published/visible offers first so bulk publication becomes visible
    // promptly instead of waiting for a full 70k+ supplier stock traversal.
    const publishedIds = await oldestPublishedExternalIds(PUBLISHED_REFRESH_LIMIT);
    const publishedOffersUpdated = publishedIds.length
      ? await refreshSymphonyaOfferStockByExternalIds(publishedIds)
      : 0;

    // Keep the full stock cursor moving as background coverage when the
    // storefront-priority queue is empty.
    const stock = publishedIds.length === 0 ? await runSymphonyaStockSyncSlice() : null;

    return Response.json({
      ok: true,
      mode: cronAuthorized ? "cron" : "manual_once",
      publishedSelected: publishedIds.length,
      publishedOffersUpdated,
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
     GROUP BY dso.external_product_id
     ORDER BY min(dso.availability_expires_at) ASC NULLS FIRST,
              min(dso.availability_checked_at) ASC NULLS FIRST,
              dso.external_product_id
     LIMIT $1
  `, [limit]);
  return result.rows
    .map((row) => String(row.external_product_id ?? "").trim())
    .filter(Boolean);
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
