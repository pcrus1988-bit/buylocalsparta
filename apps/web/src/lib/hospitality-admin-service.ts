import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import type { HospitalityProvisionInput } from "./hospitality-provision-input";

export type HospitalityAdminPartner = Readonly<{
  id: string; slug: string; name: string; status: string;
  venues: number; members: number; drinkStockEnabled: boolean;
  fallback: {adminEnabled:boolean;checkoutLive:false;posUnavailable:boolean;merchantAuthorizationReviewed:boolean;
    settlementReviewed:boolean;fiscalReviewed:boolean;reason:string;updatedAt:string|null};
}>;

/** Admin console returns no private member records. */
export async function hospitalityAdminPartners(principal: SessionPrincipal): Promise<HospitalityAdminPartner[]> {
  assertAdminPermission(principal, "vendor.manage");
  if (!productionDatabaseConfigured()) return [];
  const result = await getProductionPostgresRuntime().sqlPool.query<{
    id: string; slug: string; name: string; status: string;
    venues: number; members: number; drinkstock_enabled: boolean;
    checkout_enabled:boolean|null;pos_unavailable:boolean|null;merchant_authorization_reviewed:boolean|null;
    settlement_reviewed:boolean|null;fiscal_reviewed:boolean|null;fallback_reason:string|null;fallback_updated_at:Date|null;
  }>(`
    SELECT p.id::text AS id, p.slug, p.name, p.status,
      COUNT(DISTINCT v.id)::int AS venues,
      COUNT(DISTINCT m.user_id)::int AS members,
      COALESCE(BOOL_OR(a.enabled), FALSE) AS drinkstock_enabled,
      f.enabled AS checkout_enabled,f.pos_unavailable,f.merchant_authorization_reviewed,
      f.settlement_reviewed,f.fiscal_reviewed,f.reason AS fallback_reason,f.updated_at AS fallback_updated_at
    FROM public.hospitality_partners p
    LEFT JOIN public.hospitality_venues v ON v.partner_id=p.id
    LEFT JOIN public.hospitality_partner_memberships m ON m.partner_id=p.id AND m.status='active'
    LEFT JOIN public.hospitality_partner_apps a ON a.partner_id=p.id AND a.app_key='drinkStock'
    LEFT JOIN public.drinkstock_checkout_fallback f ON f.partner_id=p.id
    GROUP BY p.id,p.slug,p.name,p.status,p.created_at,f.enabled,f.pos_unavailable,
      f.merchant_authorization_reviewed,f.settlement_reviewed,f.fiscal_reviewed,f.reason,f.updated_at
    ORDER BY p.created_at DESC LIMIT 100
  `);
  return result.rows.map(row => ({
    id: row.id, slug: row.slug, name: row.name, status: row.status,
    venues: Number(row.venues), members: Number(row.members),
    drinkStockEnabled: Boolean(row.drinkstock_enabled),
    fallback:{adminEnabled:Boolean(row.checkout_enabled),checkoutLive:false,
      posUnavailable:Boolean(row.pos_unavailable),merchantAuthorizationReviewed:Boolean(row.merchant_authorization_reviewed),
      settlementReviewed:Boolean(row.settlement_reviewed),fiscalReviewed:Boolean(row.fiscal_reviewed),
      reason:row.fallback_reason??"",updatedAt:row.fallback_updated_at?new Date(row.fallback_updated_at).toISOString():null}
  }));
}

/** Create one venue with its verified owner and enabled app in one transaction. */
export async function provisionHospitalityPartner(principal: SessionPrincipal, input: HospitalityProvisionInput) {
  assertAdminPermission(principal, "vendor.manage");
  if (!productionDatabaseConfigured()) throw new Error("HOSPITALITY_DATABASE_UNAVAILABLE");
  const client = await getProductionPostgresRuntime().sqlPool.connect();
  let committed = false;
  let partnerId = "";
  try {
    await client.query("BEGIN");
    const found = await client.query<{ public_id: string }>(`
      SELECT u.public_id::text AS public_id
      FROM public.users u
      WHERE u.email = $1::public.citext
        AND u.status='active'
        AND u.email_verified_at IS NOT NULL
        AND u.closed_at IS NULL
        AND length(u.password_hash)>0
        AND EXISTS(SELECT 1 FROM public.customer_profiles cp WHERE cp.user_id=u.id)
      LIMIT 1 FOR SHARE
    `, [input.ownerEmail]);
    const ownerId = found.rows[0]?.public_id;
    if (!ownerId) throw new Error("OWNER_ACCOUNT_NOT_VERIFIED");
    const partner = await client.query<{ id: string }>(`
      INSERT INTO public.hospitality_partners(slug,name,status)
      VALUES($1,$2,'active') RETURNING id::text AS id
    `, [input.slug,input.name]);
    partnerId = partner.rows[0]?.id ?? "";
    if (!partnerId) throw new Error("HOSPITALITY_PARTNER_CREATE_FAILED");
    await client.query(`
      INSERT INTO public.hospitality_partner_memberships(partner_id,user_id,role,status)
      VALUES($1::uuid,$2,'owner','active')
    `, [partnerId,ownerId]);
    await client.query(`
      INSERT INTO public.hospitality_partner_apps(partner_id,app_key,enabled)
      VALUES($1::uuid,'drinkStock',TRUE)
    `, [partnerId]);
    await client.query(`
      INSERT INTO public.hospitality_venues(partner_id,name,status)
      VALUES($1::uuid,$2,'active')
    `, [partnerId,input.venueName]);
    await client.query("COMMIT");
    committed = true;
  } catch(error) {
    if (!committed) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
    }
    throw error;
  } finally {
    client.release();
  }
  // Log after commit so the route never retries a committed write because of audit issues.
  let auditRecorded = true;
  try {
    await recordAdminAudit(principal,"hospitality.partner.provisioned","hospitality_partner",partnerId,
      "Verified owner and one venue provisioned",{slug:input.slug,venueCount:1,drinkStockEnabled:true});
  } catch {
    auditRecorded = false;
  }
  return {partnerId,slug:input.slug,created:true,auditRecorded};
}
