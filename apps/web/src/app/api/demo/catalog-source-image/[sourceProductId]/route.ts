import { NextResponse } from "next/server";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../../lib/postgres-runtime";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_HOSTS = new Set(["nikolaoutools.gr", "www.nikolaoutools.gr"]);
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function allowedSourceUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.has(url.hostname.toLowerCase())) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ sourceProductId: string }> }) {
  const { sourceProductId } = await params;
  if (!productionDatabaseConfigured() || !validUuid(sourceProductId)) return new NextResponse(null, { status: 404 });

  const result = await getProductionPostgresRuntime().sqlPool.query<{ source_image_url: string | null }>(`
    SELECT csp.source_image_url
    FROM catalog_source_products csp
    JOIN catalog_source_product_links csl ON csl.source_product_id=csp.id
    JOIN canonical_variants cv ON cv.id=csl.canonical_variant_id
    JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id
    JOIN vendor_businesses v ON v.id=vo.vendor_id
    WHERE csp.id=$1::uuid
      AND csl.link_status='approved'
      AND vo.status IN ('draft','pending_review','approved')
      AND v.demo_mode=true
      AND v.status NOT IN ('active','restricted','suspended','closed')
      AND cv.suppressed=false
      AND cv.recalled=false
    ORDER BY csl.confidence DESC,csl.updated_at DESC
    LIMIT 1
  `, [sourceProductId]);

  const source = allowedSourceUrl(result.rows[0]?.source_image_url ?? "");
  if (!source) return new NextResponse(null, { status: 404 });

  try {
    const response = await fetch(source, {
      headers: { "user-agent": "KONTA-MOU-Demo-Catalogue/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok) return new NextResponse(null, { status: 502 });

    const finalUrl = allowedSourceUrl(response.url);
    if (!finalUrl) return new NextResponse(null, { status: 502 });
    const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase();
    if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) return new NextResponse(null, { status: 415 });
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) return new NextResponse(null, { status: 413 });

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) return new NextResponse(null, { status: 413 });
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
        "x-content-type-options": "nosniff"
      }
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "demo_catalogue.source_image_proxy_failed",
      sourceProductId,
      message: error instanceof Error ? error.message : String(error)
    }));
    return new NextResponse(null, { status: 502 });
  }
}
