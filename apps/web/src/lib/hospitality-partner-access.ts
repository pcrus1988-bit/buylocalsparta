import { getAccountSession } from "./account-session";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type HospitalityPartnerAccess = Readonly<{
  partnerId: string;
  partnerName: string;
  role: "owner" | "manager" | "staff" | "viewer";
  venueCount: number;
}>;
export type HospitalityVenue = Readonly<{ venueId: string; name: string; status: "active" | "inactive" }>;

/** User identity and partner membership are independent requirements. */
export async function hospitalityIdentity() {
  const principal = await getAccountSession();
  if (!principal?.userId || !principal.roles.includes("customer")) return undefined;
  return principal;
}

export async function accessibleDrinkStockPartners(userId: string): Promise<HospitalityPartnerAccess[]> {
  if (!userId || !productionDatabaseConfigured()) return [];
  const result = await getProductionPostgresRuntime().sqlPool.query<{
    partner_id: string; partner_name: string; role: HospitalityPartnerAccess["role"]; venue_count: number;
  }>("\nSELECT p.id::text AS partner_id, p.name AS partner_name,\n  m.role, COUNT(DISTINCT v.id)::int AS venue_count\nFROM public.hospitality_partner_memberships m\nJOIN public.hospitality_partners p ON p.id=m.partner_id AND p.status='active'\nJOIN public.hospitality_partner_apps a\n  ON a.partner_id=p.id AND a.app_key='drinkStock' AND a.enabled=TRUE\nLEFT JOIN public.hospitality_venues v ON v.partner_id=p.id AND v.status='active'\nWHERE m.user_id=$1 AND m.status='active'\nGROUP BY p.id,p.name,m.role ORDER BY p.name ASC", [userId]);
  return result.rows.map(row => ({
    partnerId: String(row.partner_id),
    partnerName: String(row.partner_name),
    role: row.role,
    venueCount: Number(row.venue_count)
  }));
}

/** A caller-supplied partnerId never grants authority. Every read checks membership. */
export async function drinkStockPartnerVenues(userId: string, partnerId: string): Promise<HospitalityVenue[]> {
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(partnerId) || !productionDatabaseConfigured()) return [];
  const result = await getProductionPostgresRuntime().sqlPool.query<{
    venue_id: string; name: string; status: HospitalityVenue["status"];
  }>("\nSELECT v.id::text AS venue_id, v.name, v.status\nFROM public.hospitality_venues v\nWHERE v.partner_id=$2::uuid\n  AND EXISTS (\n    SELECT 1 FROM public.hospitality_partner_memberships m\n    JOIN public.hospitality_partners p ON p.id=m.partner_id AND p.status='active'\n    JOIN public.hospitality_partner_apps a\n      ON a.partner_id=m.partner_id AND a.app_key='drinkStock' AND a.enabled=TRUE\n    WHERE m.user_id=$1 AND m.partner_id=v.partner_id AND m.status='active'\n  )\nORDER BY v.name ASC", [userId, partnerId]);
  return result.rows.map(row => ({venueId: String(row.venue_id), name: String(row.name), status: row.status}));
}
