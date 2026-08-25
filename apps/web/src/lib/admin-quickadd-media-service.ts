import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { S3ObjectStorage, objectStorageConfigFromEnv } from "@buy-local-sparta/object-storage";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission } from "./admin-runtime";
import { mediaUploadMode } from "./media-upload-service";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
let storageSingleton: S3ObjectStorage | undefined;
const storage = () => storageSingleton ??= new S3ObjectStorage(objectStorageConfigFromEnv(process.env));
const uow = () => new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
const scope = (principal: SessionPrincipal) => platformScope(principal.userId, "sparta");
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";

function maxMediaBytes(): number {
  const parsed = Number(process.env.BLS_MEDIA_MAX_BYTES || 25 * 1024 * 1024);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 25 * 1024 * 1024;
}

function safeFilename(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").replaceAll("\\", "/").split("/").pop()?.trim().slice(0, 240) ?? "";
}

function enforceUploadOrigin(url: string): void {
  const expected = process.env.BLS_MEDIA_UPLOAD_ORIGIN?.trim();
  if (!expected) throw new Error("BLS_MEDIA_UPLOAD_ORIGIN is required");
  if (new URL(url).origin !== new URL(expected).origin) throw new Error("Signed upload origin does not match the configured media upload origin");
}

export async function createAdminQuickAddMediaIntent(principal: SessionPrincipal, input: {
  vendorId: string;
  canonicalVariantId: string;
  filename: string;
  contentType: string;
  byteSize: number;
  altText: string;
  rightsOwner: string;
}) {
  assertAdminPermission(principal, "catalog.write");
  if (mediaUploadMode() !== "direct") throw new Error("Secure production media upload is not currently available");
  const vendorId = clean(input.vendorId);
  const canonicalVariantId = clean(input.canonicalVariantId);
  const filename = safeFilename(input.filename);
  const contentType = clean(input.contentType).toLowerCase();
  const altText = clean(input.altText);
  const rightsOwner = clean(input.rightsOwner);
  const byteSize = Number(input.byteSize);
  if (!vendorId || !canonicalVariantId) throw new Error("Vendor and canonical product are required for image upload");
  if (!filename) throw new Error("Image filename is required");
  if (!IMAGE_TYPES.has(contentType)) throw new Error("Quick Add images must be JPEG, PNG or WebP");
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > maxMediaBytes()) throw new Error("Image size is outside the allowed limit");
  if (!altText) throw new Error("Image description is required");
  if (!rightsOwner) throw new Error("Image rights owner is required");

  const created = await uow().withTransaction(scope(principal), async (tx) => {
    const refs = await tx.query<SqlRow>(`
      SELECT vb.id::text vendor_uuid,cv.id::text canonical_uuid
      FROM public.vendor_businesses vb
      JOIN public.canonical_variants cv ON cv.market_id=vb.market_id AND cv.public_id=$2
      WHERE (vb.public_id=$1 OR vb.id::text=$1)
        AND EXISTS(
          SELECT 1 FROM public.vendor_offers vo
          WHERE vo.vendor_id=vb.id AND vo.canonical_variant_id=cv.id AND vo.status='approved'
        )
      LIMIT 1
    `, [vendorId, canonicalVariantId]);
    if (!refs.rowCount) throw new Error("Save the product assignment before uploading its images");
    const intentId = `mui_${randomUUID().replaceAll("-", "")}`;
    const objectKey = `private/vendor-media/${vendorId}/catalog/${randomUUID()}`;
    const expiresAt = Date.now() + 15 * 60 * 1000;
    await tx.query(`
      INSERT INTO public.media_upload_intents(
        public_id,vendor_id,canonical_variant_id,purpose,kind,object_key,original_filename,
        content_type,expected_byte_size,alt_text,rights_owner,status,expires_at,created_by,created_at
      ) VALUES(
        $1,$2::uuid,$3::uuid,'catalog','image',$4,$5,$6,$7,$8,$9,'initiated',$10,$11::uuid,now()
      )
    `, [intentId, refs.rows[0].vendor_uuid, refs.rows[0].canonical_uuid, objectKey, filename, contentType, byteSize, altText, rightsOwner, new Date(expiresAt), principal.userId]);
    return { intentId, objectKey, expiresAt };
  }, { isolation: "serializable" });

  const signed = await storage().createUploadUrl({ objectKey: created.objectKey, contentType });
  enforceUploadOrigin(signed.url);
  return { intentId: created.intentId, uploadUrl: signed.url, headers: signed.headers, expiresAt: created.expiresAt, maxBytes: maxMediaBytes() };
}

export async function completeAdminQuickAddMedia(principal: SessionPrincipal, intentIdInput: string) {
  assertAdminPermission(principal, "catalog.write");
  if (mediaUploadMode() !== "direct") throw new Error("Secure production media upload is not currently available");
  const intentId = clean(intentIdInput);
  if (!intentId) throw new Error("Media upload intent is required");

  const intent = await uow().withTransaction(scope(principal), async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT mui.id::text intent_uuid,mui.status,mui.object_key,mui.kind,mui.original_filename,
             mui.content_type,mui.expected_byte_size,mui.alt_text,mui.rights_owner,mui.expires_at,
             mui.media_asset_id::text media_uuid,mui.canonical_variant_id::text canonical_uuid,
             mui.vendor_id::text vendor_uuid,pm.public_id media_public_id
      FROM public.media_upload_intents mui
      LEFT JOIN public.product_media pm ON pm.id=mui.media_asset_id
      WHERE mui.public_id=$1 AND mui.created_by=$2::uuid AND mui.purpose='catalog'
    `, [intentId, principal.userId]);
    if (!result.rowCount) throw new Error("Media upload intent not found");
    return result.rows[0];
  }, { readOnly: true });

  if (String(intent.status) === "completed" && intent.media_public_id) return { assetId: String(intent.media_public_id), scanStatus: "pending" as const };
  if (String(intent.status) !== "initiated") throw new Error(`Media upload intent is ${String(intent.status)}`);
  if (new Date(String(intent.expires_at)).getTime() <= Date.now()) throw new Error("Media upload intent expired");

  try {
    const metadata = await storage().head(String(intent.object_key));
    if (!metadata) throw new Error("Uploaded image was not found in private storage");
    const actualType = (metadata.contentType ?? "").split(";")[0]!.trim().toLowerCase();
    if (Number(metadata.byteSize) !== Number(intent.expected_byte_size) || actualType !== String(intent.content_type).toLowerCase()) {
      throw new Error("Uploaded image metadata does not match the signed upload intent");
    }

    return await uow().withTransaction(scope(principal), async (tx) => {
      const locked = await tx.query<SqlRow>(`
        SELECT mui.id::text intent_uuid,mui.status,mui.object_key,mui.original_filename,mui.content_type,
               mui.expected_byte_size,mui.alt_text,mui.rights_owner,mui.canonical_variant_id::text canonical_uuid,
               mui.vendor_id::text vendor_uuid,pm.public_id media_public_id
        FROM public.media_upload_intents mui
        LEFT JOIN public.product_media pm ON pm.id=mui.media_asset_id
        WHERE mui.public_id=$1 AND mui.created_by=$2::uuid AND mui.purpose='catalog'
        FOR UPDATE OF mui
      `, [intentId, principal.userId]);
      if (!locked.rowCount) throw new Error("Media upload intent not found");
      const row = locked.rows[0];
      if (String(row.status) === "completed" && row.media_public_id) return { assetId: String(row.media_public_id), scanStatus: "pending" as const };
      if (String(row.status) !== "initiated") throw new Error(`Media upload intent is ${String(row.status)}`);

      const order = await tx.query<SqlRow>(`SELECT COALESCE(MAX(sort_order),-10)+10 next_sort FROM public.product_media WHERE canonical_variant_id=$1::uuid`, [row.canonical_uuid]);
      const assetUuid = randomUUID();
      const assetId = `media_${randomUUID().replaceAll("-", "")}`;
      await tx.query(`
        INSERT INTO public.product_media(
          id,public_id,canonical_variant_id,vendor_id,kind,object_key,alt_text,rights_owner,
          rights_status,moderation_status,sort_order,original_filename,content_type,byte_size,
          scan_status,storage_verified_at,next_scan_at,reviewed_by,reviewed_at,created_at
        ) VALUES(
          $1,$2,$3::uuid,$4::uuid,'image',$5,$6,$7,'approved','approved',$8,$9,$10,$11,
          'pending',now(),now(),$12::uuid,now(),now()
        )
      `, [assetUuid, assetId, row.canonical_uuid, row.vendor_uuid, row.object_key, row.alt_text, row.rights_owner, Number(order.rows[0]?.next_sort ?? 0), row.original_filename, row.content_type, Number(row.expected_byte_size), principal.userId]);
      await tx.query(`UPDATE public.media_upload_intents SET status='completed',storage_verified_at=now(),media_asset_id=$2::uuid,completed_at=now(),failure_reason=NULL WHERE id=$1::uuid`, [row.intent_uuid, assetUuid]);
      return { assetId, scanStatus: "pending" as const };
    }, { isolation: "serializable" });
  } catch (error) {
    await uow().withTransaction(scope(principal), async (tx) => {
      await tx.query(`UPDATE public.media_upload_intents SET status='failed',failure_reason=$3 WHERE public_id=$1 AND created_by=$2::uuid AND status='initiated'`, [intentId, principal.userId, error instanceof Error ? error.message.slice(0, 500) : "storage_verification_failed"]);
    }, { isolation: "serializable" }).catch(() => undefined);
    await storage().delete(String(intent.object_key)).catch(() => undefined);
    throw error;
  }
}
