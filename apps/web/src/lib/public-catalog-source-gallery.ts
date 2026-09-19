import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { trustedCatalogSourceHttpsUrl } from "./trusted-catalog-source-url";

type SourceGalleryRow = SqlRow & {
  normalized_payload: unknown;
  source_code: string | null;
  source_website: string | null;
  source_title: string | null;
};

type BatchSourcePrimaryRow = SqlRow & {
  canonical_public_id: string;
  source_code: string | null;
  source_website: string | null;
  source_title: string | null;
  source_image_url: string | null;
  source_position: number | string | null;
};

export type PublicCatalogSourceImage = Readonly<{
  index: number;
  position: number;
  src: string;
  altText?: string;
}>;

export type PublicCatalogSourceImageRequest = Readonly<{
  canonicalVariantId: string;
  preferredVendorId?: string | null;
}>;

const MAX_GALLERY_IMAGES = 12;
const MAX_PRIMARY_IMAGE_BATCH = 40;

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numericPosition(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function sourceImagesFromRow(row: SourceGalleryRow): readonly PublicCatalogSourceImage[] {
  const payload = objectValue(row.normalized_payload);
  const rawImages = Array.isArray(payload.images) ? payload.images : [];
  const sourceTitle = optionalText(row.source_title);
  const candidates = rawImages
    .map((entry, index) => {
      const image = objectValue(entry);
      const src = trustedCatalogSourceHttpsUrl(row.source_code, row.source_website, image.src ?? image.url ?? image.image);
      if (!src) return undefined;
      return {
        sourceIndex: index,
        position: numericPosition(image.position, index),
        src
      };
    })
    .filter((entry): entry is { sourceIndex: number; position: number; src: string } => Boolean(entry))
    .sort((left, right) => left.position - right.position || left.sourceIndex - right.sourceIndex);

  const seen = new Set<string>();
  const images: PublicCatalogSourceImage[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.src)) continue;
    seen.add(candidate.src);
    images.push({
      index: images.length,
      position: candidate.position,
      src: candidate.src,
      altText: sourceTitle
    });
    if (images.length >= MAX_GALLERY_IMAGES) break;
  }
  return images;
}

export async function getPublicCatalogSourceGallery(
  canonicalVariantId: string,
  preferredVendorId?: string | null
): Promise<readonly PublicCatalogSourceImage[]> {
  const canonicalId = canonicalVariantId.trim();
  if (!canonicalId) return [];

  try {
    const runtime = getProductionPostgresRuntime();
    const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
    const result = await uow.withTransaction(
      { actorUserId: "public-storefront", marketId: "sparta", platformAccess: true },
      (tx) => tx.query<SourceGalleryRow>(`
        SELECT csp.normalized_payload,
               cs.code AS source_code,
               cs.website AS source_website,
               csp.title AS source_title
        FROM canonical_variants cv
        JOIN markets m ON m.id=cv.market_id
        JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id
        JOIN vendor_businesses vb ON vb.id=vo.vendor_id
        JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
        JOIN catalog_source_products csp ON csp.id=dso.source_product_id
        JOIN catalog_sources cs ON cs.id=csp.source_id
        WHERE cv.public_id=$1
          AND m.code='sparta'
          AND cv.active=true
          AND cv.suppressed=false
          AND cv.recalled=false
          AND vo.status='approved'
          AND cs.active=true
          AND cs.code IN ('nova-brandsgateway','symphonya')
        ORDER BY CASE WHEN $2::text IS NOT NULL AND vb.public_id=$2 THEN 0 ELSE 1 END,
                 csp.created_at DESC,
                 vo.updated_at DESC
        LIMIT 1
      `, [canonicalId, preferredVendorId?.trim() || null]),
      { readOnly: true }
    );

    const row = result.rows[0];
    return row ? sourceImagesFromRow(row) : [];
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.catalog_source_gallery_failed",
      canonicalVariantId: canonicalId,
      message: error instanceof Error ? error.message : String(error)
    }));
    return [];
  }
}

/**
 * Resolve the primary governed supplier image for a page-sized catalogue window
 * in one database round trip. The SQL projection extracts only the winning image
 * URL instead of sending each supplier's full normalized JSON payload back to the
 * serverless runtime, which keeps page-sized card requests small as catalogues grow.
 */
export async function getPublicCatalogSourcePrimaryImages(
  requests: readonly PublicCatalogSourceImageRequest[]
): Promise<ReadonlyMap<string, PublicCatalogSourceImage>> {
  const deduped = new Map<string, PublicCatalogSourceImageRequest>();
  for (const request of requests.slice(0, MAX_PRIMARY_IMAGE_BATCH)) {
    const canonicalVariantId = request.canonicalVariantId.trim();
    if (!canonicalVariantId) continue;
    deduped.set(canonicalVariantId, {
      canonicalVariantId,
      preferredVendorId: request.preferredVendorId?.trim() || null
    });
  }
  if (!deduped.size) return new Map();

  try {
    const runtime = getProductionPostgresRuntime();
    const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
    const requested = [...deduped.values()].map((request) => ({
      canonical_public_id: request.canonicalVariantId,
      preferred_vendor_public_id: request.preferredVendorId ?? null
    }));
    const result = await uow.withTransaction(
      { actorUserId: "public-storefront", marketId: "sparta", platformAccess: true },
      (tx) => tx.query<BatchSourcePrimaryRow>(`
        WITH requested AS (
          SELECT canonical_public_id,preferred_vendor_public_id
          FROM jsonb_to_recordset($1::jsonb)
            AS r(canonical_public_id text,preferred_vendor_public_id text)
        ), ranked AS (
          SELECT
            requested.canonical_public_id,
            csp.normalized_payload,
            cs.code AS source_code,
            cs.website AS source_website,
            csp.title AS source_title,
            row_number() OVER (
              PARTITION BY requested.canonical_public_id
              ORDER BY
                CASE WHEN requested.preferred_vendor_public_id IS NOT NULL
                           AND vb.public_id=requested.preferred_vendor_public_id THEN 0 ELSE 1 END,
                csp.created_at DESC,
                vo.updated_at DESC
            ) AS source_rank
          FROM requested
          JOIN canonical_variants cv ON cv.public_id=requested.canonical_public_id
          JOIN markets m ON m.id=cv.market_id
          JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id
          JOIN vendor_businesses vb ON vb.id=vo.vendor_id
          JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
          JOIN catalog_source_products csp ON csp.id=dso.source_product_id
          JOIN catalog_sources cs ON cs.id=csp.source_id
          WHERE m.code='sparta'
            AND cv.active=true
            AND cv.suppressed=false
            AND cv.recalled=false
            AND vo.status='approved'
            AND cs.active=true
            AND cs.code IN ('nova-brandsgateway','symphonya')
        ), primary_source AS (
          SELECT canonical_public_id,normalized_payload,source_code,source_website,source_title
          FROM ranked
          WHERE source_rank=1
        )
        SELECT
          primary_source.canonical_public_id,
          primary_source.source_code,
          primary_source.source_website,
          primary_source.source_title,
          COALESCE(
            primary_image.image->>'src',
            primary_image.image->>'url',
            primary_image.image->>'image'
          ) AS source_image_url,
          CASE
            WHEN COALESCE(primary_image.image->>'position','') ~ '^[0-9]+([.][0-9]+)?$'
              THEN (primary_image.image->>'position')::numeric
            ELSE primary_image.ordinality - 1
          END AS source_position
        FROM primary_source
        LEFT JOIN LATERAL (
          SELECT image,ordinality
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(primary_source.normalized_payload->'images')='array'
                THEN primary_source.normalized_payload->'images'
              ELSE '[]'::jsonb
            END
          ) WITH ORDINALITY AS source_images(image,ordinality)
          ORDER BY
            CASE
              WHEN COALESCE(image->>'position','') ~ '^[0-9]+([.][0-9]+)?$'
                THEN (image->>'position')::numeric
              ELSE ordinality - 1
            END,
            ordinality
          LIMIT 1
        ) primary_image ON true
      `, [JSON.stringify(requested)]),
      { readOnly: true }
    );

    const primary = new Map<string, PublicCatalogSourceImage>();
    for (const row of result.rows) {
      const src = trustedCatalogSourceHttpsUrl(row.source_code, row.source_website, row.source_image_url);
      if (!src) continue;
      primary.set(row.canonical_public_id, {
        index: 0,
        position: numericPosition(row.source_position, 0),
        src,
        altText: optionalText(row.source_title)
      });
    }
    return primary;
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.catalog_source_primary_batch_failed",
      requestedCount: deduped.size,
      message: error instanceof Error ? error.message : String(error)
    }));
    return new Map();
  }
}

export async function getPublicCatalogSourceImageAtIndex(
  canonicalVariantId: string,
  index: number
): Promise<PublicCatalogSourceImage | undefined> {
  if (!Number.isSafeInteger(index) || index < 0 || index >= MAX_GALLERY_IMAGES) return undefined;
  const gallery = await getPublicCatalogSourceGallery(canonicalVariantId);
  return gallery[index];
}
