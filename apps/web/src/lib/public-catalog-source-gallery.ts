import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

type SourceGalleryRow = SqlRow & {
  normalized_payload: unknown;
  source_website: string | null;
  source_title: string | null;
};

type BatchSourceGalleryRow = SourceGalleryRow & {
  canonical_public_id: string;
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

function sameSourceHttpsUrl(sourceWebsite: unknown, candidate: unknown): string | undefined {
  const website = optionalText(sourceWebsite);
  const value = optionalText(candidate);
  if (!website || !value) return undefined;
  try {
    const source = new URL(website);
    const asset = new URL(value, source);
    if (asset.protocol !== "https:") return undefined;
    const normalizeHost = (host: string) => host.toLowerCase().replace(/^www\./, "");
    if (normalizeHost(source.hostname) !== normalizeHost(asset.hostname)) return undefined;
    return asset.toString();
  } catch {
    return undefined;
  }
}

function sourceImagesFromRow(row: SourceGalleryRow): readonly PublicCatalogSourceImage[] {
  const payload = objectValue(row.normalized_payload);
  const rawImages = Array.isArray(payload.images) ? payload.images : [];
  const sourceTitle = optionalText(row.source_title);
  const candidates = rawImages
    .map((entry, index) => {
      const image = objectValue(entry);
      const src = sameSourceHttpsUrl(row.source_website, image.src ?? image.url ?? image.image);
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
          AND cs.code='nova-brandsgateway'
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
 * in one database round trip. Card rendering can then point browsers straight at
 * the validated HTTPS asset instead of sending every image through a same-origin
 * serverless lookup + redirect first.
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
      (tx) => tx.query<BatchSourceGalleryRow>(`
        WITH requested AS (
          SELECT canonical_public_id,preferred_vendor_public_id
          FROM jsonb_to_recordset($1::jsonb)
            AS r(canonical_public_id text,preferred_vendor_public_id text)
        ), ranked AS (
          SELECT
            requested.canonical_public_id,
            csp.normalized_payload,
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
            AND cs.code='nova-brandsgateway'
        )
        SELECT canonical_public_id,normalized_payload,source_website,source_title
        FROM ranked
        WHERE source_rank=1
      `, [JSON.stringify(requested)]),
      { readOnly: true }
    );

    const primary = new Map<string, PublicCatalogSourceImage>();
    for (const row of result.rows) {
      const image = sourceImagesFromRow(row)[0];
      if (image) primary.set(row.canonical_public_id, image);
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
