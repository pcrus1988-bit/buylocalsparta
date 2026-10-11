import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { serverObjectStorageFromEnv } from "@buy-local-sparta/object-storage";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const BUCKET = "buy-local-sparta-private";
const MAX_BYTES = 4 * 1024 * 1024;
const ROLES = ["logo", "storefront", "gallery"] as const;
type Role = typeof ROLES[number];

export type HubClaimMedia = Readonly<{
  id: string;
  role: Role;
  altText: string;
  status: "pending" | "approved" | "rejected";
  reason?: string;
}>;

function storage() { return serverObjectStorageFromEnv({ defaultBucket: BUCKET }); }
function profileId(value: string) {
  if (!/^hubprospect_[a-zA-Z0-9_-]{6,90}$/.test(value)) throw new Error("Invalid CLAIM listing");
  return value;
}
function mimeMatches(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/png") return bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
  if (type === "image/webp") return bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0,4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8,12)) === "WEBP";
  return false;
}
function asMedia(row: SqlRow): HubClaimMedia {
  return {
    id: String(row.public_id),
    role: String(row.role) as Role,
    altText: String(row.alt_text),
    status: String(row.status) as HubClaimMedia["status"],
    reason: row.rejection_reason ? String(row.rejection_reason) : undefined
  };
}

export async function listOwnedHubClaimMedia(principal: SessionPrincipal): Promise<HubClaimMedia[]> {
  if (!principal.roles.includes("customer")) return [];
  const r = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT m.public_id,m.role,m.alt_text,m.status,m.rejection_reason
    FROM hub_claim_media m JOIN hub_expansion_prospects h ON h.id=m.prospect_id
    JOIN users u ON u.id=h.owner_user_id
    WHERE u.public_id=$1 AND u.status='active' AND u.email_verified_at IS NOT NULL
      AND h.plan_code='claim' AND h.status='converted'
    ORDER BY m.submitted_at DESC LIMIT 40
  `, [principal.userId]);
  return r.rows.map(asMedia);
}

export async function listPublicHubClaimMedia(id: string): Promise<HubClaimMedia[]> {
  if (!/^hubprospect_[a-zA-Z0-9_-]{6,90}$/.test(id)) return [];
  const r = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT m.public_id,m.role,m.alt_text,m.status
    FROM hub_claim_media m JOIN hub_expansion_prospects h ON h.id=m.prospect_id
    WHERE h.public_id=$1 AND h.plan_code='claim' AND h.status='converted'
      AND h.owner_user_id IS NOT NULL AND m.status='approved'
    ORDER BY CASE m.role WHEN 'logo' THEN 0 WHEN 'storefront' THEN 1 ELSE 2 END,
      m.submitted_at DESC LIMIT 12
  `, [id]);
  return r.rows.map(asMedia);
}

export async function uploadOwnedHubClaimMedia(principal: SessionPrincipal, input: {
  claimId: string; role: string; contentType: string;
  bytes: Uint8Array; altText: string; rightsOwner: string;
}): Promise<void> {
  if (!principal.roles.includes("customer")) throw new Error("CLAIM sign-in required");
  const id = profileId(input.claimId);
  if (!ROLES.includes(input.role as Role)) throw new Error("Invalid CLAIM image role");
  const role = input.role as Role;
  const altText = input.altText.trim();
  const rightsOwner = input.rightsOwner.trim();
  if (altText.length < 2 || altText.length > 240 || rightsOwner.length < 2 || rightsOwner.length > 200) {
    throw new Error("Fill in image description and rights owner");
  }
  if (input.bytes.length === 0 || input.bytes.length > MAX_BYTES || !mimeMatches(input.contentType, input.bytes)) {
    throw new Error("Please use a valid JPEG, PNG or WebP image up to 4 MB");
  }
  const pool = getProductionPostgresRuntime().sqlPool;
  const owner = await pool.query<SqlRow>(`
    SELECT h.id::text AS id FROM hub_expansion_prospects h JOIN users u ON u.id=h.owner_user_id
    WHERE h.public_id=$1 AND h.plan_code='claim' AND h.status='converted'
      AND u.public_id=$2 AND u.status='active' AND u.email_verified_at IS NOT NULL
    LIMIT 1
  `, [id, principal.userId]);
  if (!owner.rowCount) throw new Error("CLAIM_NOT_OWNED");
  const key = "private/hub-claim/" + id + "/" + randomUUID();
  const object = storage();
  await object.put({ objectKey: key, contentType: input.contentType, body: input.bytes });
  try {
    const head = await object.head(key);
    if (!head || head.byteSize !== input.bytes.length || head.contentType !== input.contentType) {
      throw new Error("Private upload verification failed");
    }
    const uow = new PostgresUnitOfWork(pool);
    await uow.withTransaction({ platformAccess: true, marketId: "sparta", requestId: "hub-claim-media:" + id }, async (tx) => {
      const verified = await tx.query<SqlRow>(`
        SELECT h.id::text AS id FROM hub_expansion_prospects h JOIN users u ON u.id=h.owner_user_id
        WHERE h.public_id=$1 AND h.id=$2::uuid AND h.plan_code='claim' AND h.status='converted'
          AND u.public_id=$3 AND u.status='active' AND u.email_verified_at IS NOT NULL FOR UPDATE OF h
      `, [id, String(owner.rows[0].id), principal.userId]);
      if (!verified.rowCount) throw new Error("CLAIM_NOT_OWNED");
      const count = await tx.query<SqlRow>(`
        SELECT count(*)::int AS total FROM hub_claim_media
        WHERE prospect_id=$1::uuid AND status='pending'
      `, [owner.rows[0].id]);
      if (Number(count.rows[0]?.total ?? 0) >= 8) throw new Error("Too many images awaiting review");
      await tx.query(`
        INSERT INTO hub_claim_media
          (public_id,prospect_id,role,content_type,object_key,alt_text,rights_owner)
        VALUES ($1,$2::uuid,$3,$4,$5,$6,$7)
      `, ["hcm_" + randomUUID().replaceAll("-", ""), owner.rows[0].id, role,
        input.contentType, key, altText, rightsOwner]);
    }, { isolation: "serializable" });
  } catch (error) {
    await object.delete(key).catch(() => undefined);
    throw error;
  }
}

export async function readHubClaimMediaObject(id: string, admin = false) {
  if (!/^hcm_[a-zA-Z0-9_-]{12,90}$/.test(id)) return undefined;
  const query = `
    SELECT m.object_key,m.content_type
    FROM hub_claim_media m JOIN hub_expansion_prospects h ON h.id=m.prospect_id
    WHERE m.public_id=$1 AND h.plan_code='claim'
      ${admin ? "" : "AND h.status='converted' AND h.owner_user_id IS NOT NULL AND m.status='approved'"}
    LIMIT 1
  `;
  const r = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(query, [id]);
  if (!r.rowCount) return undefined;
  const row = r.rows[0];
  if (!["image/jpeg","image/png","image/webp"].includes(String(row.content_type))) return undefined;
  const object = await storage().read(String(row.object_key));
  return { contentType: String(row.content_type), stream: object.stream };
}

export async function pendingHubClaimMedia() {
  const r = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT m.public_id,m.role,m.alt_text,m.rights_owner,h.business_name,
      h.public_id AS claim_id,h.hub_city
    FROM hub_claim_media m JOIN hub_expansion_prospects h ON h.id=m.prospect_id
    WHERE m.status='pending' AND h.plan_code='claim'
    ORDER BY m.submitted_at LIMIT 100
  `);
  return r.rows.map(row => ({
    id: String(row.public_id), role: String(row.role), altText: String(row.alt_text),
    rightsOwner: String(row.rights_owner), businessName: String(row.business_name),
    claimId: String(row.claim_id), hubCity: String(row.hub_city)
  }));
}

export async function reviewHubClaimMedia(id: string, decision: "approved" | "rejected", reviewer: string) {
  if (!/^hcm_[a-zA-Z0-9_-]{12,90}$/.test(id)) throw new Error("Invalid media id");
  const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
  await uow.withTransaction({ platformAccess: true, marketId: "sparta", requestId: "review-hub-claim-media:" + id }, async tx => {
    const current = await tx.query<SqlRow>(`
      SELECT m.id::text AS id,m.role,m.prospect_id::text AS prospect_id,m.status
      FROM hub_claim_media m JOIN hub_expansion_prospects h ON h.id=m.prospect_id
      WHERE m.public_id=$1 AND h.plan_code='claim' FOR UPDATE OF m
    `, [id]);
    if (!current.rowCount || current.rows[0].status !== "pending") throw new Error("Pending image not found");
    const row = current.rows[0];
    if (decision === "approved" && row.role !== "gallery") {
      await tx.query(`
        UPDATE hub_claim_media SET status='rejected',reviewed_at=now(),
          reviewed_by=$3,rejection_reason='Replaced by approved image'
        WHERE prospect_id=$1::uuid AND role=$2 AND status='approved'
      `, [row.prospect_id, row.role, reviewer]);
    }
    await tx.query(`
      UPDATE hub_claim_media SET status=$2,reviewed_at=now(),reviewed_by=$3,
        rejection_reason=CASE WHEN $2='rejected' THEN 'Not approved by KONTA MOY' ELSE NULL END
      WHERE id=$1::uuid AND status='pending'
    `, [row.id, decision, reviewer]);
  }, { isolation: "serializable" });
}
