import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

type SourceGalleryRow = SqlRow & {
  normalized_payload: unknown;
  source_website: string | null;
  source_title: string | null;
};

export type PublicCatalogSourceImage = Readonly<{
  index: number;
  position: number;
  src: string;
  altText?: string;
}>;

const MAX_GALLERY_IMAGES = 12;

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
    if (!row) return [];
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

export async function getPublicCatalogSourceImageAtIndex(
  canonicalVariantId: string,
  index: number
): Promise<PublicCatalogSourceImage | undefined> {
  if (!Number.isSafeInteger(index) || index < 0 || index >= MAX_GALLERY_IMAGES) return undefined;
  const gallery = await getPublicCatalogSourceGallery(canonicalVariantId);
  return gallery[index];
}
