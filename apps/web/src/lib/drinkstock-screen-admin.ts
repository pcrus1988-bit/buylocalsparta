import type {SessionPrincipal} from "@buy-local-sparta/core";
import {assertAdminPermission,recordAdminAudit} from "./admin-runtime";
import {getProductionPostgresRuntime,productionDatabaseConfigured} from "./postgres-runtime";
import {validateSessionAction,SessionError,type ScreenFeedMode} from "./drinkstock-session-service";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type AdminScreenRow={partnerId:string;partnerName:string;venueId:string;venueName:string;
 passId:string;feedMode:ScreenFeedMode;createdAt:string};
export function validateAdminFeedCommand(body:unknown){
 if(!body||typeof body!=="object"||Array.isArray(body))throw new SessionError("BAD_ACTION",400);
 const b=body as Record<string,unknown>;
 if(typeof b.partnerId!=="string"||!UUID.test(b.partnerId)||
 typeof b.venueId!=="string"||!UUID.test(b.venueId))throw new SessionError("NOT_FOUND",404);
 const action=validateSessionAction({action:"set_screen_feed",passId:b.passId,feedMode:b.feedMode,requestKey:b.requestKey});
 return {partnerId:b.partnerId,venueId:b.venueId,...action};
}
export async function adminDrinkStockScreens(principal:SessionPrincipal):Promise<AdminScreenRow[]>{
 assertAdminPermission(principal,"vendor.manage");
 if(!productionDatabaseConfigured())return [];
 const res=await getProductionPostgresRuntime().sqlPool.query<{
  partner_id:string;partner_name:string;venue_id:string;venue_name:string;
  pass_id:string;feed_mode:ScreenFeedMode;created_at:Date;
 }>(`SELECT p.id::text AS partner_id,p.name AS partner_name,
 v.id::text AS venue_id,v.name AS venue_name,
 pass.id::text AS pass_id,pass.feed_mode,pass.created_at
 FROM public.drinkstock_access_passes pass
 JOIN public.hospitality_venues v ON v.id=pass.venue_id AND v.partner_id=pass.partner_id
 JOIN public.hospitality_partners p ON p.id=pass.partner_id
 JOIN public.hospitality_partner_apps app ON app.partner_id=p.id AND app.app_key='drinkStock'
 WHERE pass.kind='screen' AND pass.revoked_at IS NULL
 ORDER BY p.name,v.name,pass.created_at DESC LIMIT 250`);
 return res.rows.map(x=>({partnerId:x.partner_id,partnerName:x.partner_name,venueId:x.venue_id,
  venueName:x.venue_name,passId:x.pass_id,feedMode:x.feed_mode,
  createdAt:new Date(x.created_at).toISOString()}));
}
export async function adminSetDrinkStockScreenFeed(principal:SessionPrincipal,body:unknown){
 assertAdminPermission(principal,"vendor.manage");
 const a=validateAdminFeedCommand(body);
 if(!productionDatabaseConfigured())throw new SessionError("DATABASE_UNAVAILABLE",503);
 const db=await getProductionPostgresRuntime().sqlPool.connect();
 let replayed=false;
 try{
  await db.query("BEGIN");await db.query("SET LOCAL statement_timeout='8s'");
  const existing=await db.query<{id:string}>(`SELECT id::text FROM public.drinkstock_session_actions
   WHERE partner_id=$1::uuid AND venue_id=$2::uuid AND request_key=$3::uuid`,[a.partnerId,a.venueId,a.requestKey]);
  if(existing.rows.length){replayed=true;await db.query("COMMIT");}
  else{
   const updated=await db.query<{id:string}>(`UPDATE public.drinkstock_access_passes p SET feed_mode=$4
    FROM public.hospitality_venues v
    JOIN public.hospitality_partners hp ON hp.id=v.partner_id
    JOIN public.hospitality_partner_apps app ON app.partner_id=v.partner_id AND app.app_key='drinkStock'
    WHERE p.id=$3::uuid AND p.venue_id=$2::uuid AND p.partner_id=$1::uuid
     AND v.id=p.venue_id AND v.partner_id=p.partner_id AND v.status='active'
     AND hp.status='active' AND app.enabled
     AND p.kind='screen' AND p.revoked_at IS NULL RETURNING p.id::text`,
    [a.partnerId,a.venueId,a.passId,a.feedMode]);
   if(!updated.rows.length)throw new SessionError("SCREEN_PASS_NOT_FOUND",404);
   await db.query(`INSERT INTO public.drinkstock_session_actions
    (partner_id,venue_id,session_id,request_key,action,actor_user_id,details)
    VALUES($1::uuid,$2::uuid,NULL,$3::uuid,'set_screen_feed',$4,$5::jsonb)`,
    [a.partnerId,a.venueId,a.requestKey,principal.userId,
     JSON.stringify({screenPassId:a.passId,feedMode:a.feedMode,by:"platform_admin"})]);
   await db.query("COMMIT");
  }
 }catch(e){try{await db.query("ROLLBACK");}catch{}throw e;}
 finally{db.release();}
 if(!replayed)try{await recordAdminAudit(principal,"hospitality.tv.mode.changed","hospitality_venue",a.venueId,
  "TV order feed mode changed",{partnerId:a.partnerId,screenPassId:a.passId,feedMode:a.feedMode});}catch{}
 return {updated:true,replayed,feedMode:a.feedMode};
}
