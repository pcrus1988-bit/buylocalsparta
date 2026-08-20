import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope, vendorScope, type VendorProfileMediaRole } from "@buy-local-sparta/postgres-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { mediaUploadMode } from "./media-upload-service";
import { postgresVendorRuntimeEnabled } from "./vendor-runtime";

export type VendorProfileMediaPublicationStatus = "draft" | "published" | "archived";
export type VendorProfileMediaAssignment = Readonly<{
  id: string;
  vendorId: string;
  mediaId: string;
  role: VendorProfileMediaRole;
  sortOrder: number;
  publicationStatus: VendorProfileMediaPublicationStatus;
  filename: string;
  altText?: string;
  scanStatus: string;
  rightsStatus: string;
  moderationStatus: string;
  rejectionReason?: string;
  createdAt: number;
  publishedAt?: number;
}>;

export const VENDOR_PROFILE_MEDIA_ROLES: readonly VendorProfileMediaRole[] = ["logo","storefront","team","gallery"];

export async function vendorProfileMediaWorkspace(principal: SessionPrincipal) {
  const vendorId = requiredVendorId(principal);
  if (!postgresVendorRuntimeEnabled()) {
    return { csrfToken: principal.csrfToken, vendorId, mediaUploadMode: mediaUploadMode(), assignments: [] as readonly VendorProfileMediaAssignment[] };
  }
  const assignments = await readAssignments(vendorScope(principal.userId, vendorId), vendorId);
  return { csrfToken: principal.csrfToken, vendorId, mediaUploadMode: mediaUploadMode(), assignments };
}

export async function archiveVendorProfileMedia(principal: SessionPrincipal, assignmentId: string): Promise<void> {
  const vendorId = requiredVendorId(principal);
  if (!postgresVendorRuntimeEnabled()) throw new Error("Vendor storefront media requires PostgreSQL runtime");
  const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
  await uow.withTransaction(vendorScope(principal.userId, vendorId), async (tx) => {
    const changed = await tx.query<SqlRow>(`UPDATE vendor_profile_media
      SET publication_status='archived',archived_at=now(),updated_at=now()
      WHERE public_id=$1 AND vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2)
        AND publication_status IN ('draft','published')
      RETURNING public_id`, [assignmentId, vendorId]);
    if (!changed.rowCount) throw new Error("Storefront media assignment not found or already archived");
  }, { isolation: "serializable" });
}

export async function adminVendorProfileMediaAssignments(principal: SessionPrincipal): Promise<readonly VendorProfileMediaAssignment[]> {
  if (!process.env.DATABASE_URL?.trim()) return [];
  return readAssignments(platformScope(principal.userId));
}

export async function adminVendorProfileMediaPublicationAction(principal: SessionPrincipal, input: { assignmentId: string; action: "publish" | "unpublish" }): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("Vendor storefront media publication requires PostgreSQL runtime");
  const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
  await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const actor = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1", [principal.userId]);
    if (!actor.rowCount) throw new Error("Admin actor not found");
    const current = await tx.query<SqlRow>(`SELECT vpm.id::text AS assignment_uuid,vpm.vendor_id::text AS vendor_uuid,vpm.role,vpm.publication_status,
        pm.scan_status,pm.rights_status,pm.moderation_status
      FROM vendor_profile_media vpm JOIN product_media pm ON pm.id=vpm.media_id
      WHERE vpm.public_id=$1 FOR UPDATE OF vpm`, [input.assignmentId]);
    if (!current.rowCount) throw new Error("Vendor storefront media assignment not found");
    const row = current.rows[0];
    const assignmentUuid = requiredText(row.assignment_uuid, "assignment_uuid");
    const vendorUuid = requiredText(row.vendor_uuid, "vendor_uuid");
    const role = requiredRole(row.role);

    if (input.action === "publish") {
      if (requiredText(row.scan_status, "scan_status") !== "clean"
        || requiredText(row.rights_status, "rights_status") !== "approved"
        || requiredText(row.moderation_status, "moderation_status") !== "approved") {
        throw new Error("Storefront media must pass scan, rights and moderation approval before publication");
      }
      if (role !== "gallery") {
        await tx.query(`UPDATE vendor_profile_media SET publication_status='archived',archived_at=now(),updated_at=now()
          WHERE vendor_id=$1 AND role=$2 AND publication_status='published' AND id<>$3`, [vendorUuid, role, assignmentUuid]);
      }
      await tx.query(`UPDATE vendor_profile_media SET publication_status='published',published_by=$2,published_at=now(),archived_at=NULL,updated_at=now()
        WHERE id=$1`, [assignmentUuid, requiredText(actor.rows[0].id, "actor.id")]);
      return;
    }

    await tx.query(`UPDATE vendor_profile_media SET publication_status='archived',archived_at=now(),updated_at=now()
      WHERE id=$1`, [assignmentUuid]);
  }, { isolation: "serializable" });
}

async function readAssignments(scope: Parameters<PostgresUnitOfWork["withTransaction"]>[0], vendorId?: string): Promise<readonly VendorProfileMediaAssignment[]> {
  const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
  const result = await uow.withTransaction(scope, (tx) => tx.query<SqlRow>(`SELECT vpm.public_id,v.public_id AS vendor_public_id,pm.public_id AS media_public_id,vpm.role,vpm.sort_order,vpm.publication_status,
      pm.original_filename,pm.alt_text,pm.scan_status,pm.rights_status,pm.moderation_status,pm.rejection_reason,vpm.created_at,vpm.published_at
    FROM vendor_profile_media vpm
    JOIN vendor_businesses v ON v.id=vpm.vendor_id
    JOIN product_media pm ON pm.id=vpm.media_id
    WHERE ($1::text IS NULL OR v.public_id=$1)
    ORDER BY v.public_id,
      CASE vpm.role WHEN 'logo' THEN 0 WHEN 'storefront' THEN 1 WHEN 'team' THEN 2 ELSE 3 END,
      vpm.sort_order,vpm.created_at DESC`, [vendorId ?? null]), { readOnly: true });
  return result.rows.map((row) => ({
    id: requiredText(row.public_id, "profile_media.public_id"),
    vendorId: requiredText(row.vendor_public_id, "vendor_public_id"),
    mediaId: requiredText(row.media_public_id, "media_public_id"),
    role: requiredRole(row.role),
    sortOrder: safeInteger(row.sort_order),
    publicationStatus: requiredPublicationStatus(row.publication_status),
    filename: optionalText(row.original_filename) ?? "storefront-image",
    altText: optionalText(row.alt_text),
    scanStatus: requiredText(row.scan_status, "scan_status"),
    rightsStatus: requiredText(row.rights_status, "rights_status"),
    moderationStatus: requiredText(row.moderation_status, "moderation_status"),
    rejectionReason: optionalText(row.rejection_reason),
    createdAt: epoch(row.created_at),
    publishedAt: row.published_at ? epoch(row.published_at) : undefined
  }));
}

function requiredVendorId(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}
function requiredRole(value: unknown): VendorProfileMediaRole {
  const role = requiredText(value, "profile_media.role") as VendorProfileMediaRole;
  if (!VENDOR_PROFILE_MEDIA_ROLES.includes(role)) throw new Error("Invalid vendor storefront media role");
  return role;
}
function requiredPublicationStatus(value: unknown): VendorProfileMediaPublicationStatus {
  const status = requiredText(value, "publication_status") as VendorProfileMediaPublicationStatus;
  if (!["draft","published","archived"].includes(status)) throw new Error("Invalid vendor storefront publication status");
  return status;
}
function requiredText(value: unknown, label: string): string { if (typeof value !== "string" || !value) throw new Error(`Invalid ${label}`); return value; }
function optionalText(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function safeInteger(value: unknown): number { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Invalid sort order"); return parsed; }
function epoch(value: unknown): number { const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime(); if (!Number.isFinite(parsed)) throw new Error("Invalid storefront media timestamp"); return parsed; }
