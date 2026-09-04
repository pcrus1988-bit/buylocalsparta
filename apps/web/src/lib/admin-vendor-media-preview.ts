import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { S3ObjectStorage, objectStorageConfigFromEnv, type StoredObjectRead } from "@buy-local-sparta/object-storage";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
let storageSingleton: S3ObjectStorage | undefined;

export type AdminVendorMediaPreview = StoredObjectRead & Readonly<{
  mediaId: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
}>;

type PreviewRow = SqlRow & {
  media_public_id: string;
  object_key: string;
  content_type: string;
  byte_size: number | string;
};

function storage(): S3ObjectStorage {
  return storageSingleton ??= new S3ObjectStorage(objectStorageConfigFromEnv(process.env));
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.length) throw new Error(`Invalid ${field} in admin media preview`);
  return value;
}

function safeInteger(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field} in admin media preview`);
  return parsed;
}

export async function readAdminVendorMediaPreview(principal: SessionPrincipal, mediaId: string): Promise<AdminVendorMediaPreview | undefined> {
  assertAdminPermission(principal, "vendor.manage");
  if (!productionDatabaseConfigured()) return undefined;
  if (!/^media_[A-Za-z0-9_-]{8,128}$/.test(mediaId)) return undefined;

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
  const result = await uow.withTransaction(platformScope(principal.userId), (tx) => tx.query<PreviewRow>(`
    SELECT pm.public_id AS media_public_id,pm.object_key,pm.content_type,pm.byte_size
    FROM product_media pm
    JOIN vendor_profile_media vpm ON vpm.media_id=pm.id
    JOIN vendor_businesses v ON v.id=vpm.vendor_id
    JOIN markets m ON m.id=v.market_id
    WHERE pm.public_id=$1
      AND m.code='sparta'
      AND pm.canonical_variant_id IS NULL
      AND pm.kind='image'
      AND pm.scan_status='clean'
      AND pm.object_key IS NOT NULL
      AND pm.content_type IN ('image/jpeg','image/png','image/webp')
      AND vpm.publication_status<>'archived'
    ORDER BY vpm.updated_at DESC,vpm.created_at DESC
    LIMIT 1
  `, [mediaId]), { readOnly: true });

  const row = result.rows[0];
  if (!row) return undefined;
  const contentType = requiredText(row.content_type, "content_type");
  if (!IMAGE_TYPES.has(contentType)) return undefined;
  const byteSize = safeInteger(row.byte_size, "byte_size");
  const objectKey = requiredText(row.object_key, "object_key");
  const object = await storage().read(objectKey);
  const storedType = object.contentType?.split(";")[0]?.trim().toLowerCase();
  if (storedType && storedType !== contentType) throw new Error("Stored image content type no longer matches reviewed metadata");
  if (object.byteSize !== undefined && object.byteSize !== byteSize) throw new Error("Stored image size no longer matches reviewed metadata");

  return {
    ...object,
    mediaId: requiredText(row.media_public_id, "media_public_id"),
    contentType: contentType as AdminVendorMediaPreview["contentType"],
    byteSize
  };
}
