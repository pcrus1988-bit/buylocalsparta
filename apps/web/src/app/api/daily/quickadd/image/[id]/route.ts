import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { requireDailySession } from "../../../../../../lib/daily-session";
import { getProductionPostgresRuntime } from "../../../../../../lib/postgres-runtime";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PROXY_BYTES = 12 * 1024 * 1024;

type Context = { params: Promise<{ id: string }> };
type SourceImageRow = SqlRow & { source_image_url?: string | null; source_url?: string | null };

export async function GET(request: Request, context: Context) {
  try {
    const principal = await requireDailySession(request, false);
    const vendorId = principal.vendorId?.trim();
    if (!vendorId) return notFound();

    const { id } = await context.params;
    const canonicalVariantId = id.trim();
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(canonicalVariantId)) return notFound();

    const runtime = getProductionPostgresRuntime();
    const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
    const result = await uow.withTransaction(
      { actorUserId: principal.userId, vendorId, marketId: "sparta" },
      (tx) => tx.query<SourceImageRow>(`
        WITH vendor_ctx AS (
          SELECT id, market_id
          FROM public.vendor_businesses
          WHERE public_id=$1::text OR id::text=$1::text
          LIMIT 1
        )
        SELECT csp.source_image_url, csp.source_url
        FROM public.canonical_variants cv
        JOIN vendor_ctx vc ON vc.market_id=cv.market_id
        JOIN public.catalog_source_product_links cspl ON cspl.canonical_variant_id=cv.id
        JOIN public.catalog_source_products csp ON csp.id=cspl.source_product_id
        WHERE cv.public_id=$2::text
          AND cv.suppressed=false
          AND cv.recalled=false
          AND cspl.link_status='approved'
          AND NULLIF(btrim(csp.source_image_url),'') IS NOT NULL
          AND csp.source_image_url ~ '^https://'
        ORDER BY cspl.confidence DESC NULLS LAST,
                 cspl.reviewed_at DESC NULLS LAST,
                 csp.created_at DESC,
                 csp.id
        LIMIT 1
      `, [vendorId, canonicalVariantId]),
      { readOnly: true }
    );

    const row = result.rows[0];
    if (!row?.source_image_url) return notFound();

    const imageUrl = safeHttpsUrl(row.source_image_url);
    if (!imageUrl) return notFound();
    const sourceUrl = safeHttpsUrl(row.source_url ?? undefined);

    const headers = new Headers({
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "user-agent": "Mozilla/5.0 (compatible; KONTA-MOU/1.0; +https://kontamou.site)"
    });
    if (sourceUrl?.origin === imageUrl.origin) headers.set("referer", sourceUrl.href);

    const upstream = await fetch(imageUrl, {
      method: "GET",
      headers,
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000)
    });
    if (!upstream.ok) return new Response(null, { status: 502, headers: noStoreHeaders() });

    const contentType = upstream.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (!contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) {
      return new Response(null, { status: 415, headers: noStoreHeaders() });
    }

    const declaredBytes = Number(upstream.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_PROXY_BYTES) {
      return new Response(null, { status: 413, headers: noStoreHeaders() });
    }

    const body = await upstream.arrayBuffer();
    if (body.byteLength > MAX_PROXY_BYTES) {
      return new Response(null, { status: 413, headers: noStoreHeaders() });
    }

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin"
      }
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "warn",
      event: "daily.quickadd_source_image_failed",
      message: error instanceof Error ? error.message : String(error)
    }));
    return new Response(null, { status: 502, headers: noStoreHeaders() });
  }
}

function safeHttpsUrl(raw: string | undefined): URL | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

function notFound(): Response {
  return new Response(null, { status: 404, headers: noStoreHeaders() });
}

function noStoreHeaders(): Record<string, string> {
  return { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
}
