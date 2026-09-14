import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { governedPublicMediaEnabled } from "./public-media-service";

export type BazaarGalleryMedia = Readonly<{
  mediaId: string;
  altText?: string;
}>;

type BazaarGalleryRow = Readonly<{
  media_public_id: string;
  alt_text: string | null;
}>;

export async function getBazaarMediaGallery(
  canonicalVariantId: string,
  preferredVendorId?: string,
  requestedLimit = 12
): Promise<readonly BazaarGalleryMedia[]> {
  const canonicalId = canonicalVariantId.trim();
  if (!canonicalId || !productionDatabaseConfigured() || !governedPublicMediaEnabled()) return [];

  const limit = Math.max(1, Math.min(24, Number.isSafeInteger(requestedLimit) ? requestedLimit : 12));
  const preferredVendor = preferredVendorId?.trim() || null;
  const result = await getProductionPostgresRuntime().nativePool.query<BazaarGalleryRow>(`
    SELECT pm.public_id AS media_public_id,pm.alt_text
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
  `,[canonicalId,preferredVendor,limit]);

  return result.rows.map((row) => ({
    mediaId: row.media_public_id,
    altText: row.alt_text?.trim() || undefined
  }));
}
