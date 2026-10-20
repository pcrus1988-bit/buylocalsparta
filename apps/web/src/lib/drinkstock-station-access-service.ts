import {getProductionPostgresRuntime,productionDatabaseConfigured} from "./postgres-runtime";
import type {DrinkStockStation,StationCommand} from "./drinkstock-station-policy";
import {isDrinkStockStation} from "./drinkstock-station-policy";
export class StationAccessError extends Error{
 readonly code:string;readonly status:number;
 constructor(code:string,status:number){super(code);this.code=code;this.status=status;}
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validScope(userId:string,partnerId:string,venueId:string){
 if(!userId||!UUID.test(partnerId)||!UUID.test(venueId))throw new StationAccessError("NOT_FOUND",404);
 if(!productionDatabaseConfigured())throw new StationAccessError("STATIONS_UNAVAILABLE",503);
}
type Db={query<T extends Record<string,unknown>>(sql:string,params?:readonly unknown[]):Promise<{rows:readonly T[];rowCount:number}>};
async function roleForVenue(db:Db,userId:string,partnerId:string,venueId:string,lock=false){
 const r=await db.query<{role:string}>(`
 SELECT m.role FROM public.hospitality_venues v
 JOIN public.hospitality_partners p ON p.id=v.partner_id AND p.status='active'
 JOIN public.hospitality_partner_apps a ON a.partner_id=p.id AND a.app_key='drinkStock' AND a.enabled
 JOIN public.hospitality_partner_memberships m ON m.partner_id=p.id AND m.user_id=$1 AND m.status='active'
 WHERE v.partner_id=$2::uuid AND v.id=$3::uuid AND v.status='active'
 ${lock?"FOR UPDATE OF v":""}
 `,[userId,partnerId,venueId]);
 if(!r.rows.length)throw new StationAccessError("NOT_FOUND",404);
 return r.rows[0]!.role;
}
/** Manager can use both stations; staff need explicit per-venue assignment. */
export async function requireStationAccess(
 db:Db,userId:string,partnerId:string,venueId:string,station:DrinkStockStation,lock=false
):Promise<string>{
 if(!isDrinkStockStation(station))throw new StationAccessError("INVALID_STATION",404);
 const role=await roleForVenue(db,userId,partnerId,venueId,lock);
 if(role==="owner"||role==="manager")return role;
 if(role!=="staff")throw new StationAccessError("STATION_FORBIDDEN",403);
 const r=await db.query<{user_id:string}>(`
 SELECT s.user_id FROM public.drinkstock_venue_staff_stations s
 WHERE s.partner_id=$1::uuid AND s.venue_id=$2::uuid AND s.user_id=$3 AND s.station=$4
 LIMIT 1
 `,[partnerId,venueId,userId,station]);
 if(!r.rows.length)throw new StationAccessError("STATION_NOT_ASSIGNED",403);
 return role;
}
export type StationStaffMember={userId:string;label:string;bar:boolean;waiter:boolean};
export async function stationStaffDirectory(userId:string,partnerId:string,venueId:string){
 validScope(userId,partnerId,venueId);
 const db=getProductionPostgresRuntime().sqlPool;
 const role=await roleForVenue(db,userId,partnerId,venueId);
 if(role!=="owner"&&role!=="manager")throw new StationAccessError("MANAGER_REQUIRED",403);
 const r=await db.query<{user_id:string;email:string|null;bar:boolean;waiter:boolean}>(`
 SELECT m.user_id,u.email::text AS email,
 EXISTS(SELECT 1 FROM public.drinkstock_venue_staff_stations s
   WHERE s.partner_id=m.partner_id AND s.venue_id=$2::uuid AND s.user_id=m.user_id AND s.station='bar') AS bar,
 EXISTS(SELECT 1 FROM public.drinkstock_venue_staff_stations s
   WHERE s.partner_id=m.partner_id AND s.venue_id=$2::uuid AND s.user_id=m.user_id AND s.station='waiter') AS waiter
 FROM public.hospitality_partner_memberships m
 LEFT JOIN public.users u ON u.public_id=m.user_id
 WHERE m.partner_id=$1::uuid AND m.role='staff' AND m.status='active'
 ORDER BY u.email NULLS LAST,m.user_id LIMIT 100
 `,[partnerId,venueId]);
 return {members:r.rows.map(m=>({userId:m.user_id,label:m.email??m.user_id,bar:Boolean(m.bar),waiter:Boolean(m.waiter)}))};
}
export async function changeStationAssignment(
 userId:string,partnerId:string,venueId:string,action:StationCommand
){
 validScope(userId,partnerId,venueId);
 const db=await getProductionPostgresRuntime().sqlPool.connect();
 let committed=false;
 try{
  await db.query("BEGIN");await db.query("SET LOCAL statement_timeout='8s'");
  const actorRole=await roleForVenue(db,userId,partnerId,venueId,true);
  if(!["owner","manager"].includes(actorRole))throw new StationAccessError("MANAGER_REQUIRED",403);
  const earlier=await db.query<{target_user_id:string;station:string;enabled:boolean}>(`
 SELECT target_user_id,station,enabled FROM public.drinkstock_staff_station_events
 WHERE venue_id=$1::uuid AND partner_id=$2::uuid AND request_key=$3::uuid
 `,[venueId,partnerId,action.requestKey]);
  if(earlier.rows.length){
   const prev=earlier.rows[0]!;
   if(prev.target_user_id!==action.targetUserId||prev.station!==action.station||prev.enabled!==action.enabled)
    throw new StationAccessError("STATION_REQUEST_CONFLICT",409);
   await db.query("COMMIT");committed=true;
   return {replayed:true,station:action.station,enabled:action.enabled};
  }
  if(action.enabled){
   const eligible=await db.query<{user_id:string}>(`
    SELECT user_id FROM public.hospitality_partner_memberships
    WHERE partner_id=$1::uuid AND user_id=$2 AND role='staff' AND status='active'
   `,[partnerId,action.targetUserId]);
   if(!eligible.rows.length)throw new StationAccessError("STAFF_MEMBER_NOT_ELIGIBLE",422);
   await db.query(`
    INSERT INTO public.drinkstock_venue_staff_stations(
     partner_id,venue_id,user_id,station,assigned_by)
    VALUES($1::uuid,$2::uuid,$3,$4,$5)
    ON CONFLICT(venue_id,user_id,station) DO NOTHING
   `,[partnerId,venueId,action.targetUserId,action.station,userId]);
  }else{
   await db.query(`
    DELETE FROM public.drinkstock_venue_staff_stations
    WHERE partner_id=$1::uuid AND venue_id=$2::uuid AND user_id=$3 AND station=$4
   `,[partnerId,venueId,action.targetUserId,action.station]);
  }
  await db.query(`
   INSERT INTO public.drinkstock_staff_station_events(
    partner_id,venue_id,target_user_id,actor_user_id,station,enabled,request_key)
   VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7::uuid)
  `,[partnerId,venueId,action.targetUserId,userId,action.station,action.enabled,action.requestKey]);
  await db.query("COMMIT");committed=true;
  return {replayed:false,station:action.station,enabled:action.enabled};
 }catch(e){if(!committed)try{await db.query("ROLLBACK");}catch{}throw e;}
 finally{db.release();}
}
