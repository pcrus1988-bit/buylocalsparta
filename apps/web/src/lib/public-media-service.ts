import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { S3ObjectStorage, objectStorageConfigFromEnv, type StoredObjectRead } from "@buy-local-sparta/object-storage";
import type { VendorProfileMediaRole } from "@buy-local-sparta/postgres-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { trustedCatalogSourceHttpsUrl } from "./trusted-catalog-source-url";

export type CatalogMediaRequest = Readonly<{
  canonicalVariantId: string;
  preferredVendorId?: string;
}>;

export type ApprovedCatalogImage = Readonly<{
  canonicalVariantId: string;
  mediaId: string;
  altText?: string;
}>;

export type ApprovedCatalogSourceImage = Readonly<{
  canonicalVariantId: string;
  src: string;
  altText?: string;
}>;

export type ApprovedVendorImage = Readonly<{ vendorId: string; mediaId: string; altText?: string }>;
export type ApprovedVendorProfileMedia = Readonly<{
  vendorId: string;
  mediaId: string;
  role: VendorProfileMediaRole;
  sortOrder: number;
  altText?: string;
}>;

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

type CatalogSourceImageRow = SqlRow & {
  canonical_public_id: string;
  source_url: string;
  source_code: string;
  source_website: string;
  alt_text?: string | null;
};

type PublicMediaRow = SqlRow & {
  media_uuid: string;
  media_public_id: string;
  object_key: string | null;
  content_type: string;
  byte_size: number | string;
};

type DatabaseMediaBlobRow = SqlRow & {
  image_bytes: Buffer | Uint8Array;
  content_type: string;
  byte_size: number | string;
  sha256: string;
};

type VendorImageRow = SqlRow & { vendor_public_id: string; media_public_id: string; alt_text?: string | null };
type VendorProfileMediaRow = SqlRow & { vendor_public_id: string; media_public_id: string; role: string; sort_order: number | string; alt_text?: string | null };

const PUBLIC_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PROFILE_ROLES = new Set<VendorProfileMediaRole>(["logo","storefront","team","gallery"]);
const CATALOG_MEDIA_BATCH_SIZE = 250;
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

  // Storefront/category pages can project far more than 250 canonical products at
  // once. Keep each SQL projection deliberately bounded, but batch the internal
  // server-side request instead of dropping every image when the catalogue is large.
  // This preserves the same rights/moderation/scan gates used by product detail pages.
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
  const requested = [...unique.values()];
  const images: ApprovedCatalogImage[] = [];

  for (let offset = 0; offset < requested.length; offset += CATALOG_MEDIA_BATCH_SIZE) {
    const payload = requested.slice(offset, offset + CATALOG_MEDIA_BATCH_SIZE).map((request) => ({
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

    images.push(...result.rows.map((row) => ({
      canonicalVariantId: requiredText(row.canonical_public_id, "canonical_public_id"),
      mediaId: requiredText(row.media_public_id, "media_public_id"),
      altText: optionalText(row.alt_text)
    })));
  }

  return images;
}

/**
 * Resolve approved source-hosted catalogue images without requiring object storage.
 *
 * Vendor XML feeds materialize reviewed source URLs in product_media. Public shop
 * and cart surfaces need this projection because those URLs are not guaranteed to
 * have a catalog_source_product_links row yet. The same scan/rights/moderation
 * gates used by stored public media still apply, and every returned URL is checked
 * against its governed catalogue source host before leaving the server.
 */
export async function approvedCatalogSourceImages(
  requests: readonly CatalogMediaRequest[]
): Promise<readonly ApprovedCatalogSourceImage[]> {
  if (!productionDatabaseConfigured() || requests.length === 0) return [];

  const unique = new Map<string, CatalogMediaRequest>();
  for (const request of requests) {
    if (!request.canonicalVariantId.trim()) continue;
    unique.set(request.canonicalVariantId, request);
  }
  if (unique.size === 0) return [];

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
  const requested = [...unique.values()];
  const images: ApprovedCatalogSourceImage[] = [];

  for (let offset = 0; offset < requested.length; offset += CATALOG_MEDIA_BATCH_SIZE) {
    const payload = requested.slice(offset, offset + CATALOG_MEDIA_BATCH_SIZE).map((request) => ({
      canonical_variant_id: request.canonicalVariantId,
      preferred_vendor_id: request.preferredVendorId ?? null
    }));

    const result = await uow.withTransaction(
      { actorUserId: "public-storefront", marketId: "sparta", platformAccess: true },
      (tx) => tx.query<CatalogSourceImageRow>(`
        WITH requested AS (
          SELECT canonical_variant_id, preferred_vendor_id
          FROM jsonb_to_recordset($1::jsonb) AS r(canonical_variant_id text, preferred_vendor_id text)
        )
        SELECT DISTINCT ON (r.canonical_variant_id)
               r.canonical_variant_id AS canonical_public_id,
               pm.source_url,
               cs.code AS source_code,
               cs.website AS source_website,
               pm.alt_text
        FROM requested r
        JOIN canonical_variants cv ON cv.public_id=r.canonical_variant_id
        JOIN markets m ON m.id=cv.market_id
        JOIN product_media pm ON pm.canonical_variant_id=cv.id
        JOIN catalog_sources cs ON cs.id=pm.source_id AND cs.active=true
        LEFT JOIN vendor_businesses v ON v.id=pm.vendor_id
        WHERE m.code='sparta'
          AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
          AND pm.kind='image'
          AND pm.scan_status='clean'
          AND pm.rights_status='approved'
          AND pm.moderation_status='approved'
          AND pm.source_url IS NOT NULL
        ORDER BY r.canonical_variant_id,
                 CASE WHEN r.preferred_vendor_id IS NOT NULL AND v.public_id=r.preferred_vendor_id THEN 0 ELSE 1 END,
                 pm.sort_order ASC,
                 pm.reviewed_at DESC NULLS LAST,
                 pm.created_at ASC,
                 pm.id
      `, [JSON.stringify(payload)]),
      { readOnly: true }
    );

    for (const row of result.rows) {
      const src = trustedCatalogSourceHttpsUrl(row.source_code, row.source_website, row.source_url);
      if (!src) continue;
      images.push({
        canonicalVariantId: requiredText(row.canonical_public_id, "canonical_public_id"),
        src,
        altText: optionalText(row.alt_text)
      });
    }
  }

  return images;
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

export async function approvedVendorProfileMedia(vendorIds: readonly string[]): Promise<readonly ApprovedVendorProfileMedia[]> {
  if (!productionDatabaseConfigured() || vendorIds.length === 0) return [];
  const directStorageEnabled = governedPublicMediaEnabled();
  const unique = [...new Set(vendorIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  if (unique.length > 250) throw new Error("Public storefront media projection accepts at most 250 vendors per request");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
  const result = await uow.withTransaction({ actorUserId: "public-storefront", marketId: "sparta", platformAccess: true }, (tx) => tx.query<VendorProfileMediaRow>(`
    SELECT v.public_id AS vendor_public_id,pm.public_id AS media_public_id,vpm.role,vpm.sort_order,pm.alt_text
    FROM vendor_profile_media vpm
    JOIN vendor_businesses v ON v.id=vpm.vendor_id
    JOIN markets m ON m.id=v.market_id
    JOIN product_media pm ON pm.id=vpm.media_id
    LEFT JOIN bls_private.vendor_storefront_media_blobs blob ON blob.media_id=pm.id
    WHERE v.public_id = ANY($1::text[])
      AND m.code='sparta'
      AND (
        v.status='active'
        OR (v.demo_mode=true AND v.status NOT IN ('active','restricted','suspended','closed'))
        OR (v.status='invited' AND v.public_directory_visible=true AND v.public_id LIKE 'vendor_research_%')
      )
      AND vpm.publication_status='published'
      AND pm.kind='image'
      AND pm.scan_status='clean'
      AND pm.rights_status='approved'
      AND pm.moderation_status='approved'
      AND (blob.media_id IS NOT NULL OR ($2::boolean AND pm.object_key IS NOT NULL))
      AND pm.content_type IN ('image/jpeg','image/png','image/webp')
    ORDER BY v.public_id,
      CASE vpm.role WHEN 'logo' THEN 0 WHEN 'storefront' THEN 1 WHEN 'team' THEN 2 ELSE 3 END,
      vpm.sort_order,vpm.published_at DESC,pm.public_id
  `, [unique, directStorageEnabled]), { readOnly: true });

  return result.rows.map((row) => ({
    vendorId: requiredText(row.vendor_public_id, "vendor_public_id"),
    mediaId: requiredText(row.media_public_id, "media_public_id"),
    role: profileRole(row.role),
    sortOrder: safeInteger(row.sort_order, "sort_order"),
    altText: optionalText(row.alt_text)
  }));
}

export async function readApprovedPublicMedia(mediaId: string): Promise<ApprovedPublicMediaRead | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const directStorageEnabled = governedPublicMediaEnabled();
  if (!/^media_[A-Za-z0-9_-]{8,128}$/.test(mediaId)) return undefined;

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
  const result = await uow.withTransaction({ actorUserId: "public-media", marketId: "sparta", platformAccess: true }, (tx) => tx.query<PublicMediaRow>(`
    SELECT eligible.media_uuid,eligible.media_public_id,eligible.object_key,eligible.content_type,eligible.byte_size
    FROM (
      SELECT pm.id::text AS media_uuid,pm.public_id AS media_public_id,pm.object_key,pm.content_type,pm.byte_size,0 AS eligibility_rank
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
        AND $2::boolean
        AND pm.object_key IS NOT NULL
        AND pm.content_type IN ('image/jpeg','image/png','image/webp')
      UNION ALL
      SELECT pm.id::text AS media_uuid,pm.public_id AS media_public_id,pm.object_key,pm.content_type,pm.byte_size,1 AS eligibility_rank
      FROM product_media pm
      JOIN vendor_profile_media vpm ON vpm.media_id=pm.id
      JOIN vendor_businesses v ON v.id=vpm.vendor_id
      JOIN markets m ON m.id=v.market_id
      WHERE pm.public_id=$1
        AND m.code='sparta'
        AND (
          v.status='active'
          OR (v.demo_mode=true AND v.status NOT IN ('active','restricted','suspended','closed'))
          OR (v.status='invited' AND v.public_directory_visible=true AND v.public_id LIKE 'vendor_research_%')
        )
        AND vpm.publication_status='published'
        AND pm.canonical_variant_id IS NULL
        AND pm.kind='image'
        AND pm.scan_status='clean'
        AND pm.rights_status='approved'
        AND pm.moderation_status='approved'
        AND (pm.object_key IS NOT NULL OR EXISTS (SELECT 1 FROM bls_private.vendor_storefront_media_blobs blob WHERE blob.media_id=pm.id))
        AND pm.content_type IN ('image/jpeg','image/png','image/webp')
      UNION ALL
      SELECT pm.id::text AS media_uuid,pm.public_id AS media_public_id,pm.object_key,pm.content_type,pm.byte_size,2 AS eligibility_rank
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
        AND $2::boolean
        AND pm.object_key IS NOT NULL
        AND pm.content_type IN ('image/jpeg','image/png','image/webp')
    ) eligible
    ORDER BY eligible.eligibility_rank
    LIMIT 1
  `, [mediaId, directStorageEnabled]), { readOnly: true });

  const row = result.rows[0];
  if (!row) return undefined;
  const contentType = requiredText(row.content_type, "content_type");
  if (!PUBLIC_IMAGE_TYPES.has(contentType)) return undefined;
  const byteSize = safeInteger(row.byte_size, "byte_size");
  const mediaPublicId = requiredText(row.media_public_id, "media_public_id");

  if (!row.object_key) {
    const blob = await uow.withTransaction(
      { actorUserId: "public-media", marketId: "sparta", platformAccess: true },
      (tx) => tx.query<DatabaseMediaBlobRow>(`
        SELECT image_bytes,content_type,byte_size,sha256
        FROM bls_private.vendor_storefront_media_blobs
        WHERE media_id=$1::uuid
        LIMIT 1
      `, [requiredText(row.media_uuid, "media_uuid")]),
      { readOnly: true }
    );
    const stored = blob.rows[0];
    if (!stored) return undefined;
    const bytes = Buffer.from(stored.image_bytes);
    const blobType = requiredText(stored.content_type, "blob.content_type");
    const blobSize = safeInteger(stored.byte_size, "blob.byte_size");
    if (blobType !== contentType || blobSize !== byteSize || bytes.byteLength !== byteSize) {
      throw new Error("Approved database media metadata no longer matches reviewed media");
    }
    return {
      objectKey: `private-db/vendor-storefront/${mediaPublicId}`,
      stream: singleChunk(bytes),
      etag: `"${requiredText(stored.sha256, "blob.sha256")}"`,
      byteSize,
      mediaId: mediaPublicId,
      contentType: contentType as ApprovedPublicMediaRead["contentType"]
    };
  }

  if (!directStorageEnabled) return undefined;
  const object = await storage().read(row.object_key);
  const storedType = object.contentType?.split(";")[0]?.trim().toLowerCase();
  if (storedType && storedType !== contentType) throw new Error("Approved media object content type no longer matches its reviewed metadata");
  if (object.byteSize !== undefined && object.byteSize !== byteSize) throw new Error("Approved media object size no longer matches reviewed metadata");

  return {
    ...object,
    mediaId: mediaPublicId,
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

function profileRole(value: unknown): VendorProfileMediaRole {
  const role = requiredText(value, "profile_role") as VendorProfileMediaRole;
  if (!PROFILE_ROLES.has(role)) throw new Error("Invalid profile role in public media projection");
  return role;
}

async function* singleChunk(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes;
}
