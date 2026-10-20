import {getProductionPostgresRuntime,productionDatabaseConfigured} from "./postgres-runtime";
export class VenueTaxContextError extends Error {
 readonly code:string;readonly status:number;
 constructor(code:string,status:number){super(code);this.code=code;this.status=status;}
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type TaxContextAction={confirmed:boolean;reason:string;requestKey:string};
export function parseTaxContextAction(raw:unknown):TaxContextAction{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new VenueTaxContextError("INVALID_TAX_ATTESTATION",400);
 const x=raw as Record<string,unknown>;
 if(Object.keys(x).sort().join(",")!=="confirmed,reason,requestKey"||
   typeof x.confirmed!=="boolean"||typeof x.reason!=="string"||
   x.reason.trim().length<20||x.reason.trim().length>600||
   typeof x.requestKey!=="string"||!UUID.test(x.requestKey))
  throw new VenueTaxContextError("INVALID_TAX_ATTESTATION",400);
 return {confirmed:x.confirmed,reason:x.reason.trim(),requestKey:x.requestKey};
}
/** Only the owner confirms a NORMAL, non-reduced mainland tax context.
 * This does not certify receipt hardware, modify VAT categories or authorize sales.
 */
export async function updateVenueStandardTaxContext(
 userId:string,partnerId:string,venueId:string,action:TaxContextAction
){
 if(!userId||!UUID.test(partnerId)||!UUID.test(venueId))throw new VenueTaxContextError("NOT_FOUND",404);
 if(!productionDatabaseConfigured())throw new VenueTaxContextError("DATABASE_UNAVAILABLE",503);
 const db=await getProductionPostgresRuntime().sqlPool.connect();let committed=false;
 try{
  await db.query("BEGIN");await db.query("SET LOCAL statement_timeout='8s'");
  const scope=await db.query<{role:string}>(`
   SELECT m.role FROM public.hospitality_venues v
   JOIN public.hospitality_partners p ON p.id=v.partner_id AND p.status='active'
   JOIN public.hospitality_partner_apps a ON a.partner_id=p.id AND a.app_key='drinkStock' AND a.enabled
   JOIN public.hospitality_partner_memberships m ON m.partner_id=p.id AND m.user_id=$1 AND m.status='active'
   WHERE v.id=$2::uuid AND v.partner_id=$3::uuid AND v.status='active'
   FOR UPDATE OF v
  `,[userId,venueId,partnerId]);
  if(!scope.rows.length)throw new VenueTaxContextError("NOT_FOUND",404);
  if(scope.rows[0]?.role!=="owner")throw new VenueTaxContextError("OWNER_REQUIRED",403);
  const replay=await db.query<{after_confirmed:boolean;review_reason:string}>(`
   SELECT after_confirmed,review_reason FROM public.drinkstock_venue_tax_context_events
   WHERE venue_id=$1::uuid AND partner_id=$2::uuid AND request_key=$3::uuid
  `,[venueId,partnerId,action.requestKey]);
  if(replay.rows.length){
   if(replay.rows[0]?.after_confirmed!==action.confirmed||replay.rows[0]?.review_reason!==action.reason)
    throw new VenueTaxContextError("TAX_REQUEST_CONFLICT",409);
   await db.query("COMMIT");committed=true;return {confirmed:action.confirmed,replayed:true};
  }
  const existing=await db.query<{standard_rate_confirmed:boolean}>(`
   SELECT standard_rate_confirmed FROM public.drinkstock_venue_tax_context
   WHERE venue_id=$1::uuid AND partner_id=$2::uuid
  `,[venueId,partnerId]);
  const before=Boolean(existing.rows[0]?.standard_rate_confirmed);
  await db.query(`
   INSERT INTO public.drinkstock_venue_tax_context(
    venue_id,partner_id,standard_rate_confirmed,service_mode,jurisdiction,
    review_reason,reviewed_by,updated_at)
   VALUES($1::uuid,$2::uuid,$3,'dine_in','standard',$4,$5,now())
   ON CONFLICT(venue_id) DO UPDATE SET
    standard_rate_confirmed=EXCLUDED.standard_rate_confirmed,
    review_reason=EXCLUDED.review_reason,reviewed_by=EXCLUDED.reviewed_by,updated_at=now()
  `,[venueId,partnerId,action.confirmed,action.reason,userId]);
  await db.query(`
   INSERT INTO public.drinkstock_venue_tax_context_events(
    venue_id,partner_id,request_key,actor_user_id,before_confirmed,after_confirmed,review_reason)
   VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7)
  `,[venueId,partnerId,action.requestKey,userId,before,action.confirmed,action.reason]);
  await db.query("COMMIT");committed=true;
  return {confirmed:action.confirmed,replayed:false};
 }catch(e){if(!committed)try{await db.query("ROLLBACK");}catch{}throw e;}
 finally{db.release();}
}
