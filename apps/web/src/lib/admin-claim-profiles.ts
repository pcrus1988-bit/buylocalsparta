import { type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type AdminClaimProfile = Readonly<{
  id: string;
  tradingName: string;
  legalName: string;
  hubSlug: string;
  hubCity: string;
  contactEmail: string;
  status: string;
  vendorId?: string;
  ownerVerified: boolean;
  publicSlug?: string;
}>;

// CLAIM is a listing-only subscription. Do not misrepresent it as an activated commerce shop.
export async function adminClaimProfiles(principal: SessionPrincipal): Promise<AdminClaimProfile[]> {
  assertAdminPermission(principal, "vendor.manage");
  if (!productionDatabaseConfigured()) return [];
  const r = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT h.public_id,h.business_name,h.legal_name,h.hub_slug,h.hub_city,h.email,
           h.status,h.public_slug,v.public_id AS vendor_public_id,
           (u.status='active' AND u.email_verified_at IS NOT NULL) AS owner_verified
    FROM hub_expansion_prospects h
    LEFT JOIN users u ON u.id=h.owner_user_id
    LEFT JOIN vendor_businesses v ON v.id=h.vendor_id
    WHERE h.plan_code='claim' AND h.status='converted' AND h.owner_user_id IS NOT NULL
    ORDER BY h.updated_at DESC LIMIT 500
  `);
  return r.rows.map(row => ({
    id: String(row.public_id),
    tradingName: String(row.business_name),
    legalName: String(row.legal_name),
    hubSlug: String(row.hub_slug),
    hubCity: String(row.hub_city),
    contactEmail: String(row.email),
    status: String(row.status),
    vendorId: row.vendor_public_id ? String(row.vendor_public_id) : undefined,
    ownerVerified: row.owner_verified === true,
    publicSlug: row.public_slug ? String(row.public_slug) : undefined
  }));
}
