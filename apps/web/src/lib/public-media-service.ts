import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { S3ObjectStorage, objectStorageConfigFromEnv, type StoredObjectRead } from "@buy-local-sparta/object-storage";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type CatalogMediaRequest = Readonly<{
  canonicalVariantId: string;
  preferredVendorId?: string;
}>;

export type ApprovedCatalogImage = Readonly<{
  canonicalVariantId: string;
  mediaId: string;
  altText?: string;
}>;

export type ApprovedVendorImage = Readonly<{ vendorId: string; mediaId: string; altText?: string }>;

export type ApprovedPublicMediaRead = StoredObjectRead & Readonly<{
  mediaId: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
}>;

type CatalogImageRow = SqlRow & {
  canonical_public_id: string;
  media_public_id: string;
  alt_text?: string | null;
};

type PublicMediaRow = SqlRow & {
  media_public_id: string;
  object_key: string;
  content_type: string;
  byte_size: number | string;
};

type VendorImageRow = SqlRow & { vendor_public_id: string; media_public_id: string; alt_text?: string | null };

const PUBLIC_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
let storageSingleton: S3ObjectStorage | undefined;

function storage(): S3ObjectStorage {
  return storageSingleton ??= new S3ObjectStorage(objectStorageConfigFromEnv(process.env));
}

export function governedPublicMediaEnabled(): boolean {
  return Boolean(
    process.env.DATABASE_URL?.trim()
    && process.env.BLS_MEDIA_PIPELINE_ENABLED === "true"
    && (process.env.BLS_OBJECT_STORAGE_BUCKET?.trim() || process.env.OBJECT_STORAGE_BUCKET?.trim())
    && (process.env.BLS_OBJECT_STORAGE_REGION?.trim() || process.env.AWS_REGION?.trim())
  );
}

export async function approvedCatalogImages(requests: readonly CatalogMediaRequest[]): Promise<readonly ApprovedCatalogImage[]> {
  if (!governedPublicMediaEnabled() || requests.length === 0) return [];

  const unique = new Map<string, CatalogMediaRequest>();
  for (const request of requests) {
    if (!request.canonicalVariantId.trim()) continue;
    unique.set(request.canonicalVariantId, request);
  }
  if (unique.size === 0) return [];
  if (unique.size > 250) throw new Error("Public media projection accepts at most 250 canonical products per request");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
  const payload = [...unique.values()].map((request) => ({
    canonical_variant_id: request.canonicalVariantId,
    preferred_vendor_id: request.preferredVendorId ?? null
  }));

  const result = await uow.withTransaction({ actorUserId: "public-storefront", marketId: "sparta", platformAccess: true }, (tx) => tx.query<CatalogImageRow>(`
    WITH requested AS (
      SELECT canonical_variant_id, preferred_vendor_id
      FROM jsonb_to_recordset($1::jsonb) AS r(canonical_variant_id text, preferred_vendor_id text)
    )
    SELECT DISTINCT ON (r.canonical_variant_id)
           r.canonical_variant_id AS canonical_public_id,
           pm.public_id AS media_public_id,
           pm.alt_text
    FROM requested r
    JOIN canonical_variants cv ON cv.public_id=r.canonical_variant_id
    JOIN markets m ON m.id=cv.market_id
    JOIN product_media pm ON pm.canonical_variant_id=cv.id
    LEFT JOIN vendor_businesses v ON v.id=pm.vendor_id
    WHERE m.code='sparta'
      AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
      AND pm.kind='image'
      AND pm.scan_status='clean'
      AND pm.rights_status='approved'
      AND pm.moderation_status='approved'
      AND pm.object_key IS NOT NULL
      AND pm.content_type IN ('image/jpeg','image/png','image/webp')
    ORDER BY r.canonical_variant_id,
             CASE WHEN r.preferred_vendor_id IS NOT NULL AND v.public_id=r.preferred_vendor_id THEN 0 ELSE 1 END,
             pm.reviewed_at DESC NULLS LAST,
             pm.created_at DESC,
             pm.public_id
  `, [JSON.stringify(payload)]), { readOnly: true });

  return result.rows.map((row) => ({
    canonicalVariantId: requiredText(row.canonical_public_id, "canonical_public_id"),
    mediaId: requiredText(row.media_public_id, "media_public_id"),
    altText: optionalText(row.alt_text)
  }));
}

export async function approvedVendorImages(vendorIds: readonly string[]): Promise<readonly ApprovedVendorImage[]> {
  if (!governedPublicMediaEnabled() || vendorIds.length === 0) return [];
  const unique = [...new Set(vendorIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  if (unique.length > 250) throw new Error("Public vendor media projection accepts at most 250 vendors per request");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
  const result = await uow.withTransaction({ actorUserId: "public-storefront", marketId: "sparta", platformAccess: true }, (tx) => tx.query<VendorImageRow>(`
    SELECT DISTINCT ON (v.public_id)
           v.public_id AS vendor_public_id,pm.public_id AS media_public_id,pm.alt_text
    FROM vendor_businesses v
    JOIN markets m ON m.id=v.market_id
    JOIN product_media pm ON pm.vendor_id=v.id
    JOIN canonical_variants cv ON cv.id=pm.canonical_variant_id
    JOIN vendor_offers vo ON vo.vendor_id=v.id AND vo.canonical_variant_id=cv.id AND vo.status='approved'
    JOIN vendor_locations vl ON vl.id=vo.location_id AND vl.active=true
    WHERE v.public_id = ANY($1::text[])
      AND m.code='sparta' AND v.status='active'
      AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
      AND pm.kind='image'
      AND pm.scan_status='clean'
      AND pm.rights_status='approved'
      AND pm.moderation_status='approved'
      AND pm.object_key IS NOT NULL
      AND pm.content_type IN ('image/jpeg','image/png','image/webp')
    ORDER BY v.public_id,pm.reviewed_at DESC NULLS LAST,pm.created_at DESC,pm.public_id
  `, [unique]), { readOnly: true });

  return result.rows.map((row) => ({
    vendorId: requiredText(row.vendor_public_id, "vendor_public_id"),
    mediaId: requiredText(row.media_public_id, "media_public_id"),
    altText: optionalText(row.alt_text)
  }));
}

export async function readApprovedPublicMedia(mediaId: string): Promise<ApprovedPublicMediaRead | undefined> {
  if (!governedPublicMediaEnabled()) return undefined;
  if (!/^media_[A-Za-z0-9_-]{8,128}$/.test(mediaId)) return undefined;

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
  const result = await uow.withTransaction({ actorUserId: "public-media", marketId: "sparta", platformAccess: true }, (tx) => tx.query<PublicMediaRow>(`
    SELECT eligible.media_public_id,eligible.object_key,eligible.content_type,eligible.byte_size
    FROM (
      SELECT pm.public_id AS media_public_id,pm.object_key,pm.content_type,pm.byte_size,0 AS eligibility_rank
      FROM product_media pm
      JOIN canonical_variants cv ON cv.id=pm.canonical_variant_id
      JOIN markets m ON m.id=cv.market_id
      WHERE pm.public_id=$1
        AND m.code='sparta'
        AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
        AND pm.kind='image'
        AND pm.scan_status='clean'
        AND pm.rights_status='approved'
        AND pm.moderation_status='approved'
        AND pm.object_key IS NOT NULL
        AND pm.content_type IN ('image/jpeg','image/png','image/webp')
      UNION ALL
      SELECT pm.public_id AS media_public_id,pm.object_key,pm.content_type,pm.byte_size,1 AS eligibility_rank
      FROM product_media pm
      JOIN vendor_businesses v ON v.id=pm.vendor_id
      JOIN markets m ON m.id=v.market_id
      JOIN merchant_stories ms ON ms.vendor_id=v.id AND ms.og_image=pm.public_id
      WHERE pm.public_id=$1
        AND m.code='sparta'
        AND v.status='active'
        AND pm.canonical_variant_id IS NULL
        AND ms.status='published'
        AND ms.vendor_approved_at IS NOT NULL
        AND ms.published_at IS NOT NULL
        AND ms.published_at <= now()
        AND pm.kind='image'
        AND pm.scan_status='clean'
        AND pm.rights_status='approved'
        AND pm.moderation_status='approved'
        AND pm.object_key IS NOT NULL
        AND pm.content_type IN ('image/jpeg','image/png','image/webp')
    ) eligible
    ORDER BY eligible.eligibility_rank
    LIMIT 1
  `, [mediaId]), { readOnly: true });

  const row = result.rows[0];
  if (!row) return undefined;
  const contentType = requiredText(row.content_type, "content_type");
  if (!PUBLIC_IMAGE_TYPES.has(contentType)) return undefined;
  const byteSize = safeInteger(row.byte_size, "byte_size");
  const objectKey = requiredText(row.object_key, "object_key");
  const object = await storage().read(objectKey);
  const storedType = object.contentType?.split(";")[0]?.trim().toLowerCase();
  if (storedType && storedType !== contentType) throw new Error("Approved media object content type no longer matches its reviewed metadata");
  if (object.byteSize !== undefined && object.byteSize !== byteSize) throw new Error("Approved media object size no longer matches its reviewed metadata");

  return {
    ...object,
    mediaId: requiredText(row.media_public_id, "media_public_id"),
    contentType: contentType as ApprovedPublicMediaRead["contentType"],
    byteSize
  };
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Invalid ${label} in public media projection`);
  return value;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function safeInteger(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${label} in public media projection`);
  return parsed;
}
