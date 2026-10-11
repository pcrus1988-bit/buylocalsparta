import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { optionalClaimText, validHubClaimSocial, validHubClaimWebsite } from "./hub-claim-fields";

export type HubClaimPublicProfile = Readonly<{
  id: string; hubSlug: string; hubCity: string; hubRegion: string;
  businessName: string; category: string; phone: string; website?: string;
  address: string; postcode: string;
  description?: string; openingHours?: string; instagramUrl?: string; facebookUrl?: string;
  iframeEnabled?: boolean;
}>;

export type HubClaimInvitation = Readonly<{
  id: string; hubCity: string; businessName: string;
  status: "approved" | "converted"; phone: string; address: string; claimedByUser: boolean;
  eligibleEmail: boolean;
}>;

const SQL_PROFILE = `
  SELECT h.public_id AS id,h.hub_slug,h.hub_city,h.hub_region,
         h.business_name,h.primary_category,h.phone,h.website_url,
         h.address_line,h.postal_code,
         COALESCE(cp.description,'') AS description,COALESCE(cp.opening_hours,'') AS opening_hours,
         cp.instagram_url,cp.facebook_url,COALESCE(cp.iframe_enabled,false) AS iframe_enabled
  FROM hub_expansion_prospects h
  LEFT JOIN hub_claim_profiles cp ON cp.prospect_id=h.id
  WHERE h.plan_code='claim' AND h.status='converted'
    AND h.owner_user_id IS NOT NULL
`;

function asProfile(row: SqlRow): HubClaimPublicProfile {
  return {
    id: String(row.id), hubSlug: String(row.hub_slug),
    hubCity: String(row.hub_city), hubRegion: String(row.hub_region),
    businessName: String(row.business_name), category: String(row.primary_category),
    phone: String(row.phone), website: row.website_url ? String(row.website_url) : undefined,
    address: String(row.address_line), postcode: String(row.postal_code),
    description: String(row.description ?? ""), openingHours: String(row.opening_hours ?? ""),
    instagramUrl: row.instagram_url ? String(row.instagram_url) : undefined,
    facebookUrl: row.facebook_url ? String(row.facebook_url) : undefined,
    iframeEnabled: Boolean(row.iframe_enabled)
  };
}

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
  const websiteText = optionalClaimText(form.get("website"), 240);
  const website = websiteText ? validHubClaimWebsite(websiteText) : null;
  if (websiteText && !website) throw new Error("CLAIM_WEBSITE_MUST_BE_PUBLIC_HTTPS");
  const description = optionalClaimText(form.get("description"), 1200);
  const openingHours = optionalClaimText(form.get("openingHours"), 700);
  const instagramRaw = optionalClaimText(form.get("instagramUrl"), 240);
  const facebookRaw = optionalClaimText(form.get("facebookUrl"), 240);
  const instagramUrl = instagramRaw ? validHubClaimSocial(instagramRaw, "instagram") : null;
  const facebookUrl = facebookRaw ? validHubClaimSocial(facebookRaw, "facebook") : null;
  if (instagramRaw && !instagramUrl || facebookRaw && !facebookUrl) throw new Error("CLAIM_SOCIAL_URL_INVALID");
  const iframeEnabled = form.get("iframeEnabled") === "on" && Boolean(website);
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
      await tx.query(`
        UPDATE hub_expansion_prospects
        SET primary_category=$2,phone=$3,website_url=$4,updated_at=now()
        WHERE id=$1::uuid
      `, [owner.rows[0].id, category, phone, website]);
      await tx.query(`
        INSERT INTO hub_claim_profiles (prospect_id,description,opening_hours,instagram_url,facebook_url,iframe_enabled,updated_at)
        VALUES ($1::uuid,$2,$3,$4,$5,$6,now())
        ON CONFLICT (prospect_id) DO UPDATE SET
        description=EXCLUDED.description,opening_hours=EXCLUDED.opening_hours,
        instagram_url=EXCLUDED.instagram_url,facebook_url=EXCLUDED.facebook_url,
        iframe_enabled=EXCLUDED.iframe_enabled,updated_at=now()
      `, [owner.rows[0].id, description, openingHours, instagramUrl, facebookUrl, iframeEnabled]);
      console.info(JSON.stringify({ event: "hub_claim.profile_updated", prospectId: id }));
    },
    { isolation: "serializable" }
  );
}

export type HubClaimMedia = Readonly<{ id: string; role: "logo" | "storefront" | "gallery"; altText: string; status: "pending" | "approved" | "rejected" }>;
export type HubClaimInquiry = Readonly<{ id: string; name: string; email: string; message: string; createdAt: string; read: boolean }>;

export async function listHubClaimMedia(id: string, publicOnly = false): Promise<HubClaimMedia[]> {
  if (!validId(id)) return [];
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT m.public_id AS id,m.role,m.alt_text,m.status
    FROM hub_claim_media m JOIN hub_expansion_prospects h ON h.id=m.prospect_id
    WHERE h.public_id=$1 AND h.plan_code='claim' AND h.status='converted' AND h.owner_user_id IS NOT NULL
      ${publicOnly ? "AND m.status='approved'" : ""}
    ORDER BY m.submitted_at DESC LIMIT 50
  `, [id]);
  return result.rows.map(row => ({ id: String(row.id), role: String(row.role) as HubClaimMedia["role"], altText: String(row.alt_text), status: String(row.status) as HubClaimMedia["status"] }));
}

export async function listOwnedHubClaimInquiries(id: string, principal: SessionPrincipal): Promise<HubClaimInquiry[]> {
  if (!validId(id) || !principal.roles.includes("customer")) return [];
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT i.id::text AS id,i.sender_name,i.sender_email,i.message,i.created_at,i.read_at
    FROM hub_claim_inquiries i JOIN hub_expansion_prospects h ON h.id=i.prospect_id
    JOIN users u ON u.id=h.owner_user_id
    WHERE h.public_id=$1 AND h.plan_code='claim' AND h.status='converted'
      AND u.public_id=$2 AND u.status='active' AND u.email_verified_at IS NOT NULL
    ORDER BY i.created_at DESC LIMIT 50
  `, [id,principal.userId]);
  return result.rows.map(row=>({
    id:String(row.id),name:String(row.sender_name),email:String(row.sender_email),
    message:String(row.message),createdAt:new Date(String(row.created_at)).toISOString(),read:Boolean(row.read_at)
  }));
}
