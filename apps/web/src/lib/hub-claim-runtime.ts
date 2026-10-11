import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { normalizeVendorExternalWebsiteUrl, publicVendorExternalWebsiteUrl } from "./vendor-external-website";

export type HubClaimPublicProfile = Readonly<{
  id: string; slug: string; hubSlug: string; hubCity: string; hubRegion: string;
  businessName: string; category: string; phone: string; website?: string; websiteEmbedEnabled: boolean;
  address: string; postcode: string;
  description: string; openingHours: string;
  instagramUrl?: string; facebookUrl?: string;
}>;

export type HubClaimInvitation = Readonly<{
  id: string; hubCity: string; businessName: string;
  status: "approved" | "converted"; phone: string; address: string; claimedByUser: boolean;
  eligibleEmail: boolean;
}>;

const SQL_PROFILE = `
  SELECT h.public_id AS id,h.public_slug AS slug,h.hub_slug,h.hub_city,h.hub_region,
         h.business_name,h.primary_category,h.phone,h.website_url,
         COALESCE((to_jsonb(h)->>'website_embed_enabled')::boolean,false) AS website_embed_enabled,
         h.address_line,h.postal_code,
         COALESCE(cp.description,'') AS claim_description,
         COALESCE(cp.opening_hours,'') AS claim_opening_hours,
         cp.instagram_url AS claim_instagram_url, cp.facebook_url AS claim_facebook_url
  FROM hub_expansion_prospects h
  LEFT JOIN hub_claim_profiles cp ON cp.prospect_id=h.id
  WHERE h.plan_code='claim' AND h.status='converted'
    AND h.owner_user_id IS NOT NULL
`;

function asProfile(row: SqlRow): HubClaimPublicProfile {
  return {
    id: String(row.id), slug: String(row.slug), hubSlug: String(row.hub_slug),
    hubCity: String(row.hub_city), hubRegion: String(row.hub_region),
    businessName: String(row.business_name), category: String(row.primary_category),
    phone: String(row.phone), website: row.website_url ? String(row.website_url) : undefined,
    websiteEmbedEnabled: Boolean(publicVendorExternalWebsiteUrl({ enabled: row.website_embed_enabled === true, url: row.website_url })),
    address: String(row.address_line), postcode: String(row.postal_code),
    description: String(row.claim_description ?? ""), openingHours: String(row.claim_opening_hours ?? ""),
    instagramUrl: row.claim_instagram_url ? String(row.claim_instagram_url) : undefined,
    facebookUrl: row.claim_facebook_url ? String(row.claim_facebook_url) : undefined
  };
}

function validId(id: string): boolean { return /^hubprospect_[a-zA-Z0-9_-]{6,90}$/.test(id); }

export async function getPublicHubClaim(hubSlug: string, idOrSlug: string): Promise<HubClaimPublicProfile | undefined> {
  if (!/^[a-z0-9-]{2,80}$/.test(hubSlug)) return undefined;
  // Legacy public IDs are accepted only for permanent redirects; new links use slugs.
  // Select a fixed indexed column instead of an OR query to keep canonical lookups fast.
  const lookupColumn = validId(idOrSlug) ? "h.public_id"
    : /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(idOrSlug) ? "h.public_slug" : undefined;
  if (!lookupColumn) return undefined;
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(
    SQL_PROFILE + ` AND ${lookupColumn}=$1 AND h.hub_slug=$2 LIMIT 1`, [idOrSlug, hubSlug]
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

/** Public directory presence is independent of marketplace checkout activation. */
export async function listPublicClaimHubSlugs(): Promise<string[]> {
  // Only converted, owner-linked CLAIM registrations count as public presence.
  // Never infer activity from pending or merely approved applications.
  const result = await getProductionPostgresRuntime().sqlPool.query<{ hub_slug: string }>(`
    SELECT DISTINCT h.hub_slug
    FROM hub_expansion_prospects h
    WHERE h.plan_code='claim' AND h.status='converted'
      AND h.owner_user_id IS NOT NULL
  `);
  return result.rows.map((row) => row.hub_slug);
}

export async function listPublicHubClaimsByHub(hubSlug: string, limit = 50): Promise<HubClaimPublicProfile[]> {
  if (!/^[a-z0-9-]{2,80}$/.test(hubSlug)) return [];
  const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(
    SQL_PROFILE + " AND h.hub_slug=$1 ORDER BY h.updated_at DESC LIMIT $2",
    [hubSlug, boundedLimit]
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

function optionalClaimText(value: FormDataEntryValue | null, name: string, max: number): string {
  if (value === null) return "";
  if (typeof value !== "string") throw new Error("INVALID_CLAIM_" + name);
  const normalized = value.trim();
  if (normalized.length > max) throw new Error("INVALID_CLAIM_" + name);
  return normalized;
}

function optionalClaimSocialUrl(value: FormDataEntryValue | null, provider: "instagram" | "facebook"): string | null {
  const raw = optionalClaimText(value, provider.toUpperCase(), 240);
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("INVALID_CLAIM_" + provider.toUpperCase()); }
  const allowed = provider === "instagram" ? ["instagram.com"] : ["facebook.com", "fb.com"];
  const hostname = url.hostname.toLowerCase().replace(/^www[.]/, "");
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
      !allowed.includes(hostname)) throw new Error("INVALID_CLAIM_" + provider.toUpperCase());
  url.hash = "";
  return url.toString();
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
  const description = optionalClaimText(form.get("description"), "DESCRIPTION", 1200);
  const openingHours = optionalClaimText(form.get("openingHours"), "OPENING_HOURS", 700);
  const instagramUrl = optionalClaimSocialUrl(form.get("instagramUrl"), "instagram");
  const facebookUrl = optionalClaimSocialUrl(form.get("facebookUrl"), "facebook");
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
      if (column.rows[0]?.available === true) {
        await tx.query(`
          UPDATE hub_expansion_prospects
          SET primary_category=$2,phone=$3,website_url=$4,website_embed_enabled=$5,updated_at=now()
          WHERE id=$1::uuid
        `, [owner.rows[0].id, category, phone, website, websiteEmbedEnabled]);
      } else {
        if (websiteEmbedEnabled) throw new Error("CLAIM_IFRAME_PENDING_DATABASE_MIGRATION");
        await tx.query(`
          UPDATE hub_expansion_prospects
          SET primary_category=$2,phone=$3,website_url=$4,updated_at=now()
          WHERE id=$1::uuid
        `, [owner.rows[0].id, category, phone, website]);
      }
      await tx.query(`
        INSERT INTO hub_claim_profiles (prospect_id,description,opening_hours,instagram_url,facebook_url,updated_at)
        VALUES ($1::uuid,$2,$3,$4,$5,now())
        ON CONFLICT (prospect_id) DO UPDATE SET
          description=EXCLUDED.description,opening_hours=EXCLUDED.opening_hours,
          instagram_url=EXCLUDED.instagram_url,facebook_url=EXCLUDED.facebook_url,updated_at=now()
      `, [owner.rows[0].id, description, openingHours, instagramUrl, facebookUrl]);
      console.info(JSON.stringify({ event: "hub_claim.profile_updated", prospectId: id }));
    },
    { isolation: "serializable" }
  );
}
