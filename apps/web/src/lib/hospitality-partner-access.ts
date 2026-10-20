import { getAccountSession } from "./account-session";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type HospitalityPartnerAccess=Readonly<{
 partnerId:string;partnerName:string;role:"owner"|"manager"|"staff"|"viewer";venueCount:number;
}>;
export type HospitalityVenue=Readonly<{
 venueId:string;name:string;status:"active"|"inactive";barAssigned:boolean;waiterAssigned:boolean;
}>;
export async function hospitalityIdentity(){
 const principal=await getAccountSession();
 if(!principal?.userId||!principal.roles.includes("customer"))return undefined;
 return principal;
}
export async function accessibleDrinkStockPartners(userId:string):Promise<HospitalityPartnerAccess[]>{
 if(!userId||!productionDatabaseConfigured())return [];
 const result=await getProductionPostgresRuntime().sqlPool.query<{
  partner_id:string;partner_name:string;role:HospitalityPartnerAccess["role"];venue_count:number;
 }>(`
 SELECT p.id::text AS partner_id,p.name AS partner_name,m.role,
 COUNT(DISTINCT v.id)::int AS venue_count
 FROM public.hospitality_partner_memberships m
 JOIN public.hospitality_partners p ON p.id=m.partner_id AND p.status='active'
 JOIN public.hospitality_partner_apps a
  ON a.partner_id=p.id AND a.app_key='drinkStock' AND a.enabled=TRUE
 LEFT JOIN public.hospitality_venues v ON v.partner_id=p.id AND v.status='active'
  AND (m.role<>'staff' OR EXISTS(
    SELECT 1 FROM public.drinkstock_venue_staff_stations s
    WHERE s.partner_id=v.partner_id AND s.venue_id=v.id AND s.user_id=m.user_id))
 WHERE m.user_id=$1 AND m.status='active'
 GROUP BY p.id,p.name,m.role
 HAVING m.role<>'staff' OR COUNT(DISTINCT v.id)>0
 ORDER BY p.name
 `,[userId]);
 return result.rows.map(row=>({partnerId:row.partner_id,partnerName:row.partner_name,
  role:row.role,venueCount:Number(row.venue_count)}));
}
/** Staff cannot discover another venue merely through partner membership. */
export async function drinkStockPartnerVenues(userId:string,partnerId:string):Promise<HospitalityVenue[]>{
 if(!userId||!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(partnerId)||!productionDatabaseConfigured())return [];
 const result=await getProductionPostgresRuntime().sqlPool.query<{
  venue_id:string;name:string;status:HospitalityVenue["status"];bar_assigned:boolean;waiter_assigned:boolean;
 }>(`
 SELECT v.id::text AS venue_id,v.name,v.status,
 EXISTS(SELECT 1 FROM public.drinkstock_venue_staff_stations s
  WHERE s.partner_id=v.partner_id AND s.venue_id=v.id AND s.user_id=$1 AND s.station='bar') AS bar_assigned,
 EXISTS(SELECT 1 FROM public.drinkstock_venue_staff_stations s
  WHERE s.partner_id=v.partner_id AND s.venue_id=v.id AND s.user_id=$1 AND s.station='waiter') AS waiter_assigned
 FROM public.hospitality_venues v
 WHERE v.partner_id=$2::uuid
 AND EXISTS(
  SELECT 1 FROM public.hospitality_partner_memberships m
  JOIN public.hospitality_partners p ON p.id=m.partner_id AND p.status='active'
  JOIN public.hospitality_partner_apps a ON a.partner_id=m.partner_id AND a.app_key='drinkStock' AND a.enabled=TRUE
  WHERE m.user_id=$1 AND m.partner_id=v.partner_id AND m.status='active'
   AND (m.role<>'staff' OR EXISTS(
    SELECT 1 FROM public.drinkstock_venue_staff_stations s
    WHERE s.partner_id=v.partner_id AND s.venue_id=v.id AND s.user_id=m.user_id))
 )
 ORDER BY v.name
 `,[userId,partnerId]);
 return result.rows.map(r=>({venueId:r.venue_id,name:r.name,status:r.status,
  barAssigned:Boolean(r.bar_assigned),waiterAssigned:Boolean(r.waiter_assigned)}));
}
