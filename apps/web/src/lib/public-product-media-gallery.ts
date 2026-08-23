import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { governedPublicMediaEnabled, type ApprovedCatalogImage, type CatalogMediaRequest } from "./public-media-service";

type CatalogGalleryRow = SqlRow & {
  canonical_public_id: string;
  media_public_id: string;
  alt_text?: string | null;
};

const optionalText = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value.trim() : undefined;

/**
 * Return all publishable images for one canonical product, ordered with images from
 * the currently assigned vendor first. Every returned id still passes through the
 * governed /api/media endpoint, which independently re-checks scan, rights and
 * moderation status before reading the private object.
 */
export async function approvedCatalogImageGallery(
  request: CatalogMediaRequest,
  limit = 8
): Promise<readonly ApprovedCatalogImage[]> {
  const canonicalVariantId = request.canonicalVariantId.trim();
  if (!canonicalVariantId || !governedPublicMediaEnabled()) return [];
  const safeLimit = Math.min(12, Math.max(1, Math.trunc(limit)));

  try {
    const runtime = getProductionPostgresRuntime();
    const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
    const result = await uow.withTransaction(
      { actorUserId: "public-storefront", marketId: "sparta", platformAccess: true },
      (tx) => tx.query<CatalogGalleryRow>(`
        SELECT cv.public_id AS canonical_public_id,
               pm.public_id AS media_public_id,
               pm.alt_text
        FROM canonical_variants cv
        JOIN markets m ON m.id=cv.market_id
        JOIN product_media pm ON pm.canonical_variant_id=cv.id
        LEFT JOIN vendor_businesses v ON v.id=pm.vendor_id
        WHERE cv.public_id=$1
          AND m.code='sparta'
          AND cv.active=true
          AND cv.suppressed=false
          AND cv.recalled=false
          AND pm.kind='image'
          AND pm.scan_status='clean'
          AND pm.rights_status='approved'
          AND pm.moderation_status='approved'
          AND pm.object_key IS NOT NULL
          AND pm.content_type IN ('image/jpeg','image/png','image/webp')
        ORDER BY CASE WHEN $2::text IS NOT NULL AND v.public_id=$2 THEN 0 ELSE 1 END,
                 pm.reviewed_at DESC NULLS LAST,
                 pm.created_at DESC,
                 pm.public_id
        LIMIT $3
      `, [canonicalVariantId, request.preferredVendorId?.trim() || null, safeLimit]),
      { readOnly: true }
    );

    return result.rows.map((row) => ({
      canonicalVariantId: String(row.canonical_public_id),
      mediaId: String(row.media_public_id),
      altText: optionalText(row.alt_text)
    }));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.product_media_gallery_failed",
      canonicalVariantId,
      message: error instanceof Error ? error.message : String(error)
    }));
    return [];
  }
}
