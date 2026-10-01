import { createHash, randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope, type VendorProfileMediaRole } from "@buy-local-sparta/postgres-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const PROFILE_ROLES = new Set<VendorProfileMediaRole>(["logo", "storefront", "team", "gallery"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const ADMIN_STOREFRONT_DATABASE_UPLOAD_MAX_BYTES = 3_500_000;

export async function createAdminVendorProfileDatabaseUpload(principal: SessionPrincipal, input: {
  vendorId: string;
  profileRole: VendorProfileMediaRole;
  file: File;
  altText: string;
  rightsOwner: string;
}) {
  if (!productionDatabaseConfigured()) throw new Error("Storefront image upload requires PostgreSQL");
  const vendorId = input.vendorId.trim();
  const role = input.profileRole;
  const altText = input.altText.trim();
  const rightsOwner = input.rightsOwner.trim();
  const contentType = input.file.type.trim().toLowerCase();
  const filename = safeFilename(input.file.name);

  if (!vendorId) throw new Error("Vendor is required");
  if (!PROFILE_ROLES.has(role)) throw new Error("Invalid vendor storefront media role");
  if (!IMAGE_TYPES.has(contentType)) throw new Error("Storefront media must be JPEG, PNG or WebP");
  if (!filename) throw new Error("Original filename is required");
  if (!altText || altText.length > 240) throw new Error("Image alt text is required and must be at most 240 characters");
  if (!rightsOwner || rightsOwner.length > 200) throw new Error("Rights owner is required and must be at most 200 characters");
  if (!Number.isSafeInteger(input.file.size) || input.file.size <= 0 || input.file.size > ADMIN_STOREFRONT_DATABASE_UPLOAD_MAX_BYTES) {
    throw new Error("Image must be no larger than 3.5 MB while secure object storage is offline");
  }

  const bytes = Buffer.from(await input.file.arrayBuffer());
  if (bytes.byteLength !== input.file.size) throw new Error("Uploaded image size changed while reading the file");
  if (!matchesImageSignature(contentType, bytes)) throw new Error("The selected file does not match its declared image type");
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const actor = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1 LIMIT 1", [principal.userId]);
    if (!actor.rowCount) throw new Error("Admin actor not found");

    const vendor = await tx.query<SqlRow>(`SELECT v.id::text AS id,v.public_id
      FROM vendor_businesses v
      JOIN markets m ON m.id=v.market_id
      WHERE (v.public_id=$1 OR v.id::text=$1) AND m.code='sparta'
      LIMIT 1`, [vendorId]);
    if (!vendor.rowCount) throw new Error("Vendor shop not found");

    const vendorUuid = requiredText(vendor.rows[0].id, "vendor.id");
    const assetUuid = randomUUID();
    const assetId = `media_${randomUUID().replaceAll("-", "")}`;
    const assignmentId = `vpm_${randomUUID().replaceAll("-", "")}`;
    const now = new Date();

    await tx.query(`INSERT INTO product_media(
        id,public_id,canonical_variant_id,vendor_id,kind,object_key,alt_text,rights_owner,
        rights_status,moderation_status,sort_order,created_at,original_filename,content_type,
        byte_size,sha256,scan_status,storage_verified_at,scan_attempts,next_scan_at,scan_error
      ) VALUES(
        $1,$2,NULL,$3::uuid,'image',NULL,$4,$5,
        'pending','pending',0,$6,$7,$8,
        $9,$10,'clean',$6,0,NULL,NULL
      )`, [
      assetUuid,
      assetId,
      vendorUuid,
      altText,
      rightsOwner,
      now,
      filename,
      contentType,
      bytes.byteLength,
      sha256
    ]);

    await tx.query(`INSERT INTO bls_private.vendor_storefront_media_blobs(
        media_id,image_bytes,content_type,byte_size,sha256,validation_method,created_at
      ) VALUES($1,$2,$3,$4,$5,'magic-bytes-v1',$6)`, [
      assetUuid,
      bytes,
      contentType,
      bytes.byteLength,
      sha256,
      now
    ]);

    let sortOrder = 0;
    if (role === "gallery") {
      const order = await tx.query<SqlRow>(
        "SELECT COALESCE(MAX(sort_order),0)+10 AS next_sort FROM vendor_profile_media WHERE vendor_id=$1::uuid AND role='gallery'",
        [vendorUuid]
      );
      sortOrder = Number(order.rows[0]?.next_sort ?? 10);
    }

    await tx.query(`INSERT INTO vendor_profile_media(
        id,public_id,vendor_id,media_id,role,sort_order,publication_status,created_by,created_at,updated_at
      ) VALUES($1,$2,$3::uuid,$4::uuid,$5,$6,'draft',$7::uuid,$8,$8)`, [
      randomUUID(),
      assignmentId,
      vendorUuid,
      assetUuid,
      role,
      sortOrder,
      requiredText(actor.rows[0].id, "actor.id"),
      now
    ]);

    return {
      assetId,
      assignmentId,
      vendorId: requiredText(vendor.rows[0].public_id, "vendor.public_id"),
      scanStatus: "clean" as const,
      storage: "database_fallback" as const,
      validation: "magic-bytes-v1" as const
    };
  }, { isolation: "serializable" });
}

function matchesImageSignature(contentType: string, bytes: Buffer): boolean {
  if (contentType === "image/jpeg") {
    return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    const signature = [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }
  if (contentType === "image/webp") {
    return bytes.length >= 12
      && bytes.subarray(0, 4).toString("ascii") === "RIFF"
      && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

function safeFilename(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").replaceAll("\\", "/").split("/").pop()?.trim().slice(0, 240) ?? "";
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Invalid ${label}`);
  return value;
}
