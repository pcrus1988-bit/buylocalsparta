import { randomUUID } from "node:crypto";
import { serverObjectStorageFromEnv } from "@buy-local-sparta/object-storage";
import { hasAdminPermission } from "./admin-runtime";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { normalizeVendorExternalWebsiteUrl, publicVendorExternalWebsiteUrl } from "./vendor-external-website";

export type HubClaimPublicProfile = Readonly<{
  id: string; hubSlug: string; hubCity: string; hubRegion: string;
  businessName: string; category: string; phone: string; website?: string; websiteEmbedEnabled: boolean;
  description?: string; openingHours?: string; publicEmail?: string; instagramUrl?: string;
  logoMediaId?: string; coverMediaId?: string;
  address: string; postcode: string;
}>;

export type HubClaimInvitation = Readonly<{
  id: string; hubCity: string; businessName: string;
  status: "approved" | "converted"; phone: string; address: string; claimedByUser: boolean;
  eligibleEmail: boolean;
}>;

const SQL_PROFILE = `
  SELECT h.public_id AS id,h.hub_slug,h.hub_city,h.hub_region,
         h.business_name,h.primary_category,h.phone,h.website_url,
         COALESCE((to_jsonb(h)->>'website_embed_enabled')::boolean,false) AS website_embed_enabled,
         h.address_line,h.postal_code,
         to_jsonb(h)->>'claim_description' AS claim_description,
         to_jsonb(h)->>'claim_opening_hours' AS claim_opening_hours,
         to_jsonb(h)->>'claim_public_email' AS claim_public_email,
         to_jsonb(h)->>'claim_instagram_url' AS claim_instagram_url,
         to_jsonb(h)->>'claim_logo_media_id' AS claim_logo_media_id,
         to_jsonb(h)->>'claim_cover_media_id' AS claim_cover_media_id
  FROM hub_expansion_prospects h
  WHERE h.plan_code='claim' AND h.status='converted'
    AND h.owner_user_id IS NOT NULL
`;

function asProfile(row: SqlRow): HubClaimPublicProfile {
  return {
    id: String(row.id), hubSlug: String(row.hub_slug),
    hubCity: String(row.hub_city), hubRegion: String(row.hub_region),
    businessName: String(row.business_name), category: String(row.primary_category),
    phone: String(row.phone), website: row.website_url ? String(row.website_url) : undefined,
    websiteEmbedEnabled: Boolean(publicVendorExternalWebsiteUrl({ enabled: row.website_embed_enabled === true, url: row.website_url })),
    address: String(row.address_line), postcode: String(row.postal_code),
    description: optionalText(row.claim_description),
    openingHours: optionalText(row.claim_opening_hours),
    publicEmail: optionalText(row.claim_public_email),
    instagramUrl: optionalText(row.claim_instagram_url),
    logoMediaId: optionalText(row.claim_logo_media_id),
    coverMediaId: optionalText(row.claim_cover_media_id)
  };
}

function optionalText(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }

function validId(id: string): boolean { return /^hubprospect_[a-zA-Z0-9_-]{6,90}$/.test(id); }

export async function getPublicHubClaim(hubSlug: string, id: string): Promise<HubClaimPublicProfile | undefined> {
  if (!validId(id) || !/^[a-z0-9-]{2,80}$/.test(hubSlug)) return undefined;
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(
    SQL_PROFILE + " AND h.public_id=$1 AND h.hub_slug=$2 LIMIT 1", [id, hubSlug]
  );
  return result.rowCount ? asProfile(result.rows[0]) : undefined;
}

export async function listPublicHubClaims(limit = 100): Promise<HubClaimPublicProfile[]> {
  const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(
    SQL_PROFILE + " ORDER BY h.updated_at DESC LIMIT $1", [boundedLimit]
  );
  return result.rows.map(asProfile);
}

export async function getHubClaimInvitation(id: string, principal?: SessionPrincipal): Promise<HubClaimInvitation | undefined> {
  if (!validId(id)) return undefined;
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT h.public_id,h.business_name,h.hub_city,h.phone,h.address_line,h.status::text AS status,
           h.owner_user_id,h.email,
           u.public_id AS owner_public_id
    FROM hub_expansion_prospects h
    LEFT JOIN users u ON u.id=h.owner_user_id
    WHERE h.public_id=$1 AND h.plan_code='claim' AND h.status IN ('approved','converted')
    LIMIT 1
  `, [id]);
  if (!result.rowCount) return undefined;
  const row = result.rows[0];
  return {
    id: String(row.public_id), businessName: String(row.business_name),
    hubCity: String(row.hub_city), phone: String(row.phone), address: String(row.address_line), status: String(row.status) as "approved" | "converted",
    claimedByUser: Boolean(principal && String(row.owner_public_id ?? "") === principal.userId),
    eligibleEmail: Boolean(principal?.roles.includes("customer") &&
      principal.email && String(row.email).trim().toLowerCase() === principal.email.trim().toLowerCase())
  };
}

export async function acceptApprovedHubClaim(id: string, principal: SessionPrincipal): Promise<void> {
  if (!validId(id) || !principal.roles.includes("customer")) throw new Error("CLAIM_NOT_ALLOWED");
  const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
  await uow.withTransaction(
    { platformAccess: true, marketId: "sparta", requestId: "accept-hub-claim:" + id },
    async (tx) => {
      const user = await tx.query<SqlRow>(
        "SELECT id::text AS id,email::text AS email FROM users WHERE public_id=$1 AND status='active' AND email_verified_at IS NOT NULL LIMIT 1",
        [principal.userId]
      );
      if (!user.rowCount || !principal.email ||
          String(user.rows[0].email).trim().toLowerCase() !== principal.email.trim().toLowerCase()) {
        throw new Error("VERIFIED_ACCOUNT_REQUIRED");
      }
      const claim = await tx.query<SqlRow>(`
        SELECT id::text AS id,status::text AS status,plan_code,email,owner_user_id::text AS owner_user_id
        FROM hub_expansion_prospects WHERE public_id=$1 FOR UPDATE
      `, [id]);
      if (!claim.rowCount || claim.rows[0].plan_code !== "claim") throw new Error("CLAIM_NOT_FOUND");
      const row = claim.rows[0];
      if (String(row.email).trim().toLowerCase() !== String(user.rows[0].email).trim().toLowerCase()) {
        throw new Error("CLAIM_EMAIL_MISMATCH");
      }
      if (row.owner_user_id && String(row.owner_user_id) !== String(user.rows[0].id)) {
        throw new Error("CLAIM_ALREADY_OWNED");
      }
      if (row.status === "converted" && String(row.owner_user_id) === String(user.rows[0].id)) return;
      if (row.status !== "approved") throw new Error("CLAIM_NOT_APPROVED");
      await tx.query(
        "UPDATE hub_expansion_prospects SET owner_user_id=$2::uuid,status='converted',updated_at=now() WHERE id=$1::uuid",
        [row.id, user.rows[0].id]
      );
      console.info(JSON.stringify({ event: "hub_claim.accepted", prospectId: id }));
    },
    { isolation: "serializable" }
  );
}

export async function listOwnedHubClaims(principal: SessionPrincipal): Promise<HubClaimPublicProfile[]> {
  if (!principal.roles.includes("customer")) return [];
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    ${SQL_PROFILE}
    AND h.owner_user_id = (SELECT u.id FROM users u WHERE u.public_id=$1
      AND u.status='active' AND u.email_verified_at IS NOT NULL)
    ORDER BY h.updated_at DESC LIMIT 25
  `, [principal.userId]);
  return result.rows.map(asProfile);
}

function checkedText(value: FormDataEntryValue | null, name: string, max: number): string {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (text.length < 2 || text.length > max) throw new Error("INVALID_CLAIM_" + name);
  return text;
}

export async function updateOwnedHubClaim(id: string, principal: SessionPrincipal, form: FormData): Promise<void> {
  if (!validId(id) || !principal.roles.includes("customer")) throw new Error("CLAIM_NOT_ALLOWED");
  const category = checkedText(form.get("category"), "CATEGORY", 100);
  const phone = checkedText(form.get("phone"), "PHONE", 32);
  if (!/^[+0-9 ()-]{8,32}$/.test(phone)) throw new Error("INVALID_CLAIM_PHONE");
  const websiteInput = form.get("website");
  const websiteText = typeof websiteInput === "string" ? websiteInput.trim() : "";
  let website: string | null = null;
  if (websiteText) {
    if (websiteText.length > 240) throw new Error("INVALID_CLAIM_WEBSITE");
    try {
      const parsed = new URL(websiteText);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("INVALID_CLAIM_WEBSITE");
      website = parsed.toString();
    } catch { throw new Error("INVALID_CLAIM_WEBSITE"); }
  }
  const description = String(form.get("description") ?? "").trim();
  const openingHours = String(form.get("openingHours") ?? "").trim();
  const publicEmail = String(form.get("publicEmail") ?? "").trim().toLowerCase();
  const instagramInput = String(form.get("instagramUrl") ?? "").trim();
  if (description.length > 750 || openingHours.length > 500) throw new Error("CLAIM_TEXT_TOO_LONG");
  if (publicEmail && (publicEmail.length > 160 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(publicEmail))) throw new Error("INVALID_CLAIM_PUBLIC_EMAIL");
  let instagramUrl: string | null = null;
  if (instagramInput) {
    try {
      const parsed = new URL(instagramInput);
      if (parsed.protocol !== "https:" || !["instagram.com", "www.instagram.com"].includes(parsed.hostname.toLowerCase()) ||
          parsed.username || parsed.password || parsed.port || instagramInput.length > 240) throw new Error("INVALID_CLAIM_INSTAGRAM");
      instagramUrl = parsed.toString();
    } catch { throw new Error("INVALID_CLAIM_INSTAGRAM"); }
  }
  const websiteEmbedEnabled = form.get("websiteEmbedEnabled") === "on";
  if (websiteEmbedEnabled) {
    if (!website) throw new Error("CLAIM_WEBSITE_REQUIRED");
    normalizeVendorExternalWebsiteUrl(website);
  }
  const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
  await uow.withTransaction(
    { platformAccess: true, marketId: "sparta", requestId: "edit-hub-claim:" + id },
    async (tx) => {
      const owner = await tx.query<SqlRow>(`
        SELECT h.id::text AS id FROM hub_expansion_prospects h
        JOIN users u ON u.id=h.owner_user_id
        WHERE h.public_id=$1 AND h.plan_code='claim' AND h.status='converted'
          AND u.public_id=$2 AND u.status='active' AND u.email_verified_at IS NOT NULL
        LIMIT 1 FOR UPDATE OF h
      `, [id, principal.userId]);
      if (!owner.rowCount) throw new Error("CLAIM_NOT_OWNED");
      // The schema migration may follow a web deploy. Keep existing CLAIM edits
      // working and fail closed on enabling the iframe until the new column exists.
      const column = await tx.query<SqlRow>(`
        SELECT EXISTS (
          SELECT 1 FROM pg_attribute
          WHERE attrelid='public.hub_expansion_prospects'::regclass
            AND attname='website_embed_enabled' AND NOT attisdropped
        ) AS available
      `);
      const profileColumns = await tx.query<SqlRow>(`
        SELECT count(*)::integer AS available FROM pg_attribute
        WHERE attrelid='public.hub_expansion_prospects'::regclass
          AND attname = ANY($1::text[]) AND NOT attisdropped
      `, [["claim_description", "claim_opening_hours", "claim_public_email", "claim_instagram_url"]]);
      if (Number(profileColumns.rows[0]?.available) !== 4) throw new Error("CLAIM_PROFILE_MIGRATION_REQUIRED");
      if (column.rows[0]?.available !== true && websiteEmbedEnabled) throw new Error("CLAIM_IFRAME_PENDING_DATABASE_MIGRATION");
      if (column.rows[0]?.available === true) {
        await tx.query(`
          UPDATE hub_expansion_prospects
          SET primary_category=$2,phone=$3,website_url=$4,website_embed_enabled=$5,
              claim_description=$6,claim_opening_hours=$7,claim_public_email=$8,claim_instagram_url=$9,
              updated_at=now()
          WHERE id=$1::uuid
        `, [owner.rows[0].id, category, phone, website, websiteEmbedEnabled, description || null, openingHours || null, publicEmail || null, instagramUrl]);
      } else {
        await tx.query(`
          UPDATE hub_expansion_prospects
          SET primary_category=$2,phone=$3,website_url=$4,
              claim_description=$5,claim_opening_hours=$6,claim_public_email=$7,claim_instagram_url=$8,
              updated_at=now()
          WHERE id=$1::uuid
        `, [owner.rows[0].id, category, phone, website, description || null, openingHours || null, publicEmail || null, instagramUrl]);
      }
      console.info(JSON.stringify({ event: "hub_claim.profile_updated", prospectId: id }));
    },
    { isolation: "serializable" }
  );
}

export type HubClaimMediaItem = Readonly<{
  id: string; claimId: string; mediaId: string; role: "logo" | "cover";
  status: "pending_review" | "published" | "archived" | "rejected";
  scanStatus: string; filename: string; createdAt: string;
}>;

function assertClaimAdmin(principal: SessionPrincipal) {
  if (!principal.roles.includes("super_admin") && !hasAdminPermission(principal, "vendor.manage")) {
    throw new Error("CLAIM_ADMIN_REQUIRED");
  }
}

function mediaRow(row: SqlRow): HubClaimMediaItem {
  return {
    id: String(row.public_id), claimId: String(row.claim_public_id),
    mediaId: String(row.media_public_id), role: String(row.role) as "logo" | "cover",
    status: String(row.publication_status) as HubClaimMediaItem["status"],
    scanStatus: String(row.scan_status), filename: String(row.original_filename || "image"),
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

const CLAIM_MEDIA_QUERY = `
  SELECT cm.public_id,h.public_id AS claim_public_id,pm.public_id AS media_public_id,
         cm.role,cm.publication_status,pm.scan_status,pm.original_filename,cm.created_at
  FROM hub_claim_profile_media cm
  JOIN hub_expansion_prospects h ON h.id=cm.claim_id
  JOIN product_media pm ON pm.id=cm.media_id
`;

export async function listOwnedHubClaimMedia(principal: SessionPrincipal): Promise<HubClaimMediaItem[]> {
  if (!principal.roles.includes("customer")) return [];
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(CLAIM_MEDIA_QUERY + `
    JOIN users u ON u.id=h.owner_user_id
    WHERE h.plan_code='claim' AND h.status='converted'
      AND u.public_id=$1 AND u.status='active' AND u.email_verified_at IS NOT NULL
    ORDER BY cm.created_at DESC LIMIT 80`, [principal.userId]);
  return result.rows.map(mediaRow);
}

export async function listHubClaimMediaForAdmin(publicId: string, principal: SessionPrincipal): Promise<HubClaimMediaItem[]> {
  assertClaimAdmin(principal);
  if (!validId(publicId)) return [];
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(CLAIM_MEDIA_QUERY + `
    WHERE h.public_id=$1 AND h.plan_code='claim'
    ORDER BY cm.created_at DESC LIMIT 80`, [publicId]);
  return result.rows.map(mediaRow);
}

function authenticImage(type: string, bytes: Uint8Array): boolean {
  if (type === "image/jpeg") return bytes.length > 3 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff;
  if (type === "image/png") return bytes.length > 8 && [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
  if (type === "image/webp") return bytes.length > 12
    && String.fromCharCode(...bytes.slice(0,4))==="RIFF" && String.fromCharCode(...bytes.slice(8,12))==="WEBP";
  return false;
}

/** Small verified picture intake. The existing product_media worker scans these assets.
 * Pending files never become public before the separate admin publication step. */
export async function uploadOwnedHubClaimMedia(id: string, principal: SessionPrincipal, form: FormData): Promise<void> {
  if (!validId(id) || !principal.roles.includes("customer")) throw new Error("CLAIM_NOT_ALLOWED");
  const role = String(form.get("role") ?? "");
  if (role !== "logo" && role !== "cover") throw new Error("INVALID_CLAIM_MEDIA_ROLE");
  const file = form.get("file");
  if (!(file instanceof File) || file.size <= 0 || file.size > 3 * 1024 * 1024) {
    throw new Error("CLAIM_IMAGE_3MB_LIMIT");
  }
  const contentType = file.type.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!authenticImage(contentType, bytes)) throw new Error("CLAIM_IMAGE_MUST_BE_JPEG_PNG_WEBP");
  const altText = checkedText(form.get("altText"), "IMAGE_ALT", 240);
  const rightsOwner = checkedText(form.get("rightsOwner"), "IMAGE_RIGHTS", 200);
  if (form.get("rightsConfirmed") !== "on") throw new Error("CLAIM_IMAGE_RIGHTS_CONFIRMATION_REQUIRED");
  const filename = file.name.replace(/[\u0000-\u001f\u007f]/g, "").replaceAll("\\", "/").split("/").pop()?.slice(0, 200) || "claim-image";

  // Check account/ownership before writing to private storage.
  const owner = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT h.id::text AS claim_uuid,u.id::text AS user_uuid
    FROM hub_expansion_prospects h JOIN users u ON u.id=h.owner_user_id
    WHERE h.public_id=$1 AND h.plan_code='claim' AND h.status='converted'
      AND u.public_id=$2 AND u.status='active' AND u.email_verified_at IS NOT NULL
    LIMIT 1`, [id, principal.userId]);
  if (!owner.rowCount) throw new Error("CLAIM_NOT_OWNED");

  const objectKey = "private/hub-claim/" + id + "/" + role + "/" + randomUUID();
  const storage = serverObjectStorageFromEnv({ defaultBucket: "buy-local-sparta-private" });
  await storage.put({ objectKey, contentType, body: bytes });
  try {
    const metadata = await storage.head(objectKey);
    if (!metadata || metadata.byteSize !== bytes.length || metadata.contentType !== contentType) {
      throw new Error("CLAIM_IMAGE_STORAGE_VERIFICATION_FAILED");
    }
    const mediaUuid = randomUUID();
    const mediaPublicId = "media_" + randomUUID().replaceAll("-", "");
    const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
    await uow.withTransaction({ actorUserId: principal.userId, platformAccess: true, marketId: "sparta", requestId: "claim-media:"+id }, async tx => {
      const locked = await tx.query<SqlRow>(`
        SELECT h.id::text AS claim_uuid,u.id::text AS user_uuid
        FROM hub_expansion_prospects h JOIN users u ON u.id=h.owner_user_id
        WHERE h.public_id=$1 AND h.plan_code='claim' AND h.status='converted'
          AND u.public_id=$2 AND u.status='active' AND u.email_verified_at IS NOT NULL
        FOR UPDATE OF h`, [id, principal.userId]);
      if (!locked.rowCount) throw new Error("CLAIM_NOT_OWNED");
      const pending = await tx.query<SqlRow>(`
        SELECT count(*)::integer AS count FROM hub_claim_profile_media
        WHERE claim_id=$1::uuid AND role=$2 AND publication_status='pending_review'`,
        [locked.rows[0].claim_uuid, role]);
      if (Number(pending.rows[0]?.count) >= 3) throw new Error("CLAIM_IMAGE_REVIEW_QUEUE_LIMIT");
      await tx.query(`
        INSERT INTO product_media(
          id,public_id,canonical_variant_id,vendor_id,kind,object_key,alt_text,rights_owner,
          rights_status,moderation_status,original_filename,content_type,byte_size,
          scan_status,storage_verified_at,next_scan_at,created_at
        ) VALUES($1,$2,NULL,NULL,'image',$3,$4,$5,'pending','pending',$6,$7,$8,'pending',now(),now(),now())`,
        [mediaUuid,mediaPublicId,objectKey,altText,rightsOwner,filename,contentType,bytes.length]);
      await tx.query(`
        INSERT INTO hub_claim_profile_media(public_id,claim_id,media_id,role,created_by)
        VALUES($1,$2::uuid,$3::uuid,$4,$5::uuid)`,
        ["hcpm_"+randomUUID().replaceAll("-",""),locked.rows[0].claim_uuid,mediaUuid,role,locked.rows[0].user_uuid]);
    }, { isolation: "serializable" });
  } catch (error) {
    await storage.delete(objectKey).catch(()=>undefined);
    throw error;
  }
}

/** Admin publication requires a completed clean worker scan; owner upload alone cannot publish. */
export async function reviewHubClaimMedia(principal: SessionPrincipal, assignmentId: string, action: "publish" | "reject"): Promise<void> {
  assertClaimAdmin(principal);
  if (!/^hcpm_[a-z0-9]{32}$/.test(assignmentId)) throw new Error("CLAIM_IMAGE_NOT_FOUND");
  const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
  await uow.withTransaction({ actorUserId: principal.userId, platformAccess: true, marketId: "sparta", requestId: "review-claim-media:"+assignmentId }, async tx => {
    const actor = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 LIMIT 1", [principal.userId]);
    if (!actor.rowCount) throw new Error("CLAIM_ADMIN_USER_NOT_FOUND");
    const result = await tx.query<SqlRow>(`
      SELECT cm.id::text AS assignment_uuid,cm.claim_id::text AS claim_uuid,cm.role,cm.publication_status,
             pm.id::text AS media_uuid,pm.public_id AS media_public_id,pm.scan_status
      FROM hub_claim_profile_media cm
      JOIN hub_expansion_prospects h ON h.id=cm.claim_id AND h.plan_code='claim'
      JOIN product_media pm ON pm.id=cm.media_id
      WHERE cm.public_id=$1
      FOR UPDATE OF cm,pm,h`, [assignmentId]);
    if (!result.rowCount || result.rows[0].publication_status !== "pending_review") throw new Error("CLAIM_MEDIA_NOT_PENDING");
    const row = result.rows[0];
    if (action === "publish") {
      if (row.scan_status !== "clean") throw new Error("CLAIM_MEDIA_SCAN_NOT_CLEAN");
      await tx.query(`
        UPDATE product_media SET rights_status='approved',moderation_status='approved',
          reviewed_by=$2::uuid,reviewed_at=now() WHERE id=$1::uuid`, [row.media_uuid,actor.rows[0].id]);
      await tx.query(`
        UPDATE hub_claim_profile_media SET publication_status='archived'
        WHERE claim_id=$1::uuid AND role=$2 AND publication_status='published'`,
        [row.claim_uuid,row.role]);
      await tx.query(`
        UPDATE hub_claim_profile_media SET publication_status='published',reviewed_by=$2::uuid,reviewed_at=now()
        WHERE id=$1::uuid`, [row.assignment_uuid,actor.rows[0].id]);
      const column = row.role === "logo" ? "claim_logo_media_id" : "claim_cover_media_id";
      await tx.query(`UPDATE hub_expansion_prospects SET ${column}=$2,updated_at=now() WHERE id=$1::uuid`,
        [row.claim_uuid,row.media_public_id]);
    } else {
      await tx.query(`
        UPDATE product_media SET moderation_status='rejected',reviewed_by=$2::uuid,reviewed_at=now()
        WHERE id=$1::uuid`, [row.media_uuid,actor.rows[0].id]);
      await tx.query(`
        UPDATE hub_claim_profile_media SET publication_status='rejected',reviewed_by=$2::uuid,reviewed_at=now()
        WHERE id=$1::uuid`, [row.assignment_uuid,actor.rows[0].id]);
    }
  }, { isolation: "serializable" });
}
