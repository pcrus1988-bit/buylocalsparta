import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { trustedCatalogSourceHttpsUrl } from "./trusted-catalog-source-url";

type SourceGalleryRow = SqlRow & {
  normalized_payload: unknown;
  source_image_url: string | null;
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
  const payloadImages = Array.isArray(payload.images) ? payload.images : [];
  const rawImages = row.source_image_url
    ? [{ src: row.source_image_url, position: 0 }, ...payloadImages]
    : payloadImages;
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
        WITH candidates AS (
          SELECT csp.normalized_payload,
                 csp.source_image_url,
                 cs.code AS source_code,
                 cs.website AS source_website,
                 csp.title AS source_title,
                 CASE WHEN $2::text IS NOT NULL AND vb.public_id=$2 THEN 0 ELSE 1 END AS vendor_rank,
                 csp.created_at AS source_created_at,
                 vo.updated_at AS commerce_updated_at,
                 0 AS source_rank
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
            AND cs.code IN ('nova-brandsgateway','symphonya','zendrop')

          UNION ALL

          SELECT csp.normalized_payload,
                 csp.source_image_url,
                 cs.code AS source_code,
                 cs.website AS source_website,
                 csp.title AS source_title,
                 0 AS vendor_rank,
                 csp.created_at AS source_created_at,
                 vcp.updated_at AS commerce_updated_at,
                 1 AS source_rank
          FROM canonical_variants cv
          JOIN markets m ON m.id=cv.market_id
          JOIN vitex_commerce_products vcp ON vcp.canonical_variant_id=cv.id AND vcp.active=true
          JOIN catalog_sources cs ON cs.market_id=cv.market_id AND cs.code='vitex-commerce-media' AND cs.active=true
          JOIN catalog_source_products csp
            ON csp.source_id=cs.id
           AND csp.source_product_key=vcp.import_fingerprint
          WHERE cv.public_id=$1
            AND m.code='sparta'
            AND cv.active=true
            AND cv.suppressed=false
            AND cv.recalled=false
        )
        SELECT normalized_payload,source_image_url,source_code,source_website,source_title
        FROM candidates
        ORDER BY source_rank,vendor_rank,source_created_at DESC,commerce_updated_at DESC
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
            csp.source_image_url AS source_image_fallback_url,
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
          SELECT canonical_public_id,normalized_payload,source_image_fallback_url,source_code,source_website,source_title
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
            primary_image.image->>'image',
            primary_source.source_image_fallback_url
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

async function getPublicCatalogPrimarySourceImage(
  canonicalVariantId: string
): Promise<PublicCatalogSourceImage | undefined> {
  const canonicalId = canonicalVariantId.trim();
  if (!canonicalId) return undefined;

  const result = await getProductionPostgresRuntime().nativePool.query<SourceGalleryRow>(`
    SELECT
      latest.normalized_payload,
      latest.source_image_url,
      source.code AS source_code,
      source.website AS source_website,
      latest.title AS source_title
    FROM canonical_variants cv
    JOIN markets m ON m.id=cv.market_id
    JOIN catalog_source_product_links csl
      ON csl.canonical_variant_id=cv.id
     AND csl.link_status='approved'
    JOIN catalog_source_products linked ON linked.id=csl.source_product_id
    JOIN catalog_sources source
      ON source.id=linked.source_id
     AND source.active=true
    JOIN LATERAL (
      SELECT candidate.*
      FROM catalog_source_products candidate
      JOIN catalog_source_snapshots snapshot ON snapshot.id=candidate.snapshot_id
      WHERE candidate.source_id=linked.source_id
        AND candidate.source_product_key=linked.source_product_key
      ORDER BY snapshot.observed_at DESC NULLS LAST,candidate.created_at DESC,candidate.id DESC
      LIMIT 1
    ) latest ON true
    WHERE cv.public_id=$1
      AND m.code='sparta'
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
    ORDER BY csl.confidence DESC,csl.updated_at DESC,csl.id DESC
    LIMIT 1
  `, [canonicalId]);

  const row = result.rows[0];
  return row ? sourceImagesFromRow(row)[0] : undefined;
}

export async function getPublicCatalogSourceImageAtIndex(
  canonicalVariantId: string,
  index: number
): Promise<PublicCatalogSourceImage | undefined> {
  if (!Number.isSafeInteger(index) || index < 0 || index >= MAX_GALLERY_IMAGES) return undefined;

  // The primary image is used by product HTML, structured data and image sitemaps.
  // Resolve it through the lightweight approved canonical-source link projection
  // instead of opening a transaction for the full gallery on every crawler hit.
  if (index === 0) {
    const linkedPrimary = await getPublicCatalogPrimarySourceImage(canonicalVariantId);
    if (linkedPrimary) return linkedPrimary;

    // Newly materialized dropship products can already have an authoritative
    // supplier-offer -> source-product link before the canonical source identity
    // link is backfilled. Use that governed path as the primary-image fallback so
    // Zendrop cards/details do not render broken images during ingestion.
    return (await getPublicCatalogSourceGallery(canonicalVariantId))[0];
  }

  const gallery = await getPublicCatalogSourceGallery(canonicalVariantId);
  return gallery[index];
}
