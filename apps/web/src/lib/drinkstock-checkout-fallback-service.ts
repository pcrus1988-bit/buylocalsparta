import type {SessionPrincipal} from "@buy-local-sparta/core";
import {assertAdminPermission,recordAdminAudit} from "./admin-runtime";
import {getProductionPostgresRuntime,productionDatabaseConfigured} from "./postgres-runtime";
import {checkoutFallbackDecision,type CheckoutFallbackCommand} from "./drinkstock-checkout-fallback-policy";

export class CheckoutFallbackError extends Error{
 constructor(public readonly code:string,public readonly status:number){super(code);}
}
type FallbackRow={enabled:boolean;pos_unavailable:boolean;merchant_authorization_reviewed:boolean;
 settlement_reviewed:boolean;fiscal_reviewed:boolean;reason:string;updated_at:Date};
export type CheckoutFallbackSnapshot=Readonly<{
 adminEnabled:boolean;checkoutLive:false;status:"disabled"|"approved_pending_adapter";
 posUnavailable:boolean;merchantAuthorizationReviewed:boolean;
 settlementReviewed:boolean;fiscalReviewed:boolean;
 reason:string;updatedAt:string|null;
}>;
export function mapFallback(row:FallbackRow|undefined):CheckoutFallbackSnapshot{
 const decision=checkoutFallbackDecision(Boolean(row?.enabled));
 return {...decision,posUnavailable:Boolean(row?.pos_unavailable),
  merchantAuthorizationReviewed:Boolean(row?.merchant_authorization_reviewed),
  settlementReviewed:Boolean(row?.settlement_reviewed),
  fiscalReviewed:Boolean(row?.fiscal_reviewed),
  reason:row?.reason??"",updatedAt:row?.updated_at?new Date(row.updated_at).toISOString():null};
}

/** Only server-authorized administrators can grant or revoke entitlement.
 * A separate payment/checkout adapter must explicitly pass all production
 * readiness gates before using the grant to take payments.
 */
export async function changeCheckoutFallback(principal:SessionPrincipal,action:CheckoutFallbackCommand){
 assertAdminPermission(principal,"vendor.manage");
 if(!productionDatabaseConfigured())throw new CheckoutFallbackError("CHECKOUT_DATABASE_UNAVAILABLE",503);
 const db=await getProductionPostgresRuntime().sqlPool.connect();
 let committed=false,changed=false;
 try{
  await db.query("BEGIN");
  await db.query("SET LOCAL statement_timeout='8s'");
  const scope=await db.query<{id:string}>(`
   SELECT p.id::text AS id FROM public.hospitality_partners p
   JOIN public.hospitality_partner_apps a ON a.partner_id=p.id AND a.app_key='drinkStock' AND a.enabled
   WHERE p.id=$1::uuid AND p.status='active'
    AND EXISTS (SELECT 1 FROM public.hospitality_venues v WHERE v.partner_id=p.id AND v.status='active')
   FOR UPDATE OF p
  `,[action.partnerId]);
  if(!scope.rows.length)throw new CheckoutFallbackError("HOSPITALITY_PARTNER_NOT_ELIGIBLE",404);
  const earlier=await db.query<{after_enabled:boolean;reason:string;reviewed:Record<string,unknown>}>(`
   SELECT after_enabled,reason,reviewed FROM public.drinkstock_checkout_fallback_events
   WHERE partner_id=$1::uuid AND request_key=$2::uuid
  `,[action.partnerId,action.requestKey]);
  if(earlier.rows.length){
   const e=earlier.rows[0]!;
   if(Boolean(e.after_enabled)!==action.enabled||e.reason!==action.reason||
      JSON.stringify(e.reviewed)!==JSON.stringify(action.reviews)){
    // JSONB serialization may reorder keys: compare canonical fields.
    const keys=["posUnavailable","merchantAuthorizationReviewed","settlementReviewed","fiscalReviewed"] as const;
    if(Boolean(e.after_enabled)!==action.enabled||e.reason!==action.reason||
       keys.some(k=>e.reviewed[k]!==action.reviews[k]))
      throw new CheckoutFallbackError("CHECKOUT_REQUEST_KEY_CONFLICT",409);
   }
   await db.query("COMMIT");committed=true;
   return {partnerId:action.partnerId,replayed:true,
     checkout:await checkoutFallbackByPartner(action.partnerId),auditRecorded:true};
  }
  const existing=await db.query<{enabled:boolean}>(`
    SELECT enabled FROM public.drinkstock_checkout_fallback WHERE partner_id=$1::uuid
  `,[action.partnerId]);
  const before=Boolean(existing.rows[0]?.enabled);
  await db.query(`
   INSERT INTO public.drinkstock_checkout_fallback(
     partner_id,enabled,pos_unavailable,merchant_authorization_reviewed,
     settlement_reviewed,fiscal_reviewed,reason,updated_by,updated_at)
   VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,now())
   ON CONFLICT(partner_id) DO UPDATE SET
     enabled=EXCLUDED.enabled,pos_unavailable=EXCLUDED.pos_unavailable,
     merchant_authorization_reviewed=EXCLUDED.merchant_authorization_reviewed,
     settlement_reviewed=EXCLUDED.settlement_reviewed,
     fiscal_reviewed=EXCLUDED.fiscal_reviewed,reason=EXCLUDED.reason,
     updated_by=EXCLUDED.updated_by,updated_at=now()
  `,[action.partnerId,action.enabled,action.reviews.posUnavailable,
     action.reviews.merchantAuthorizationReviewed,action.reviews.settlementReviewed,
     action.reviews.fiscalReviewed,action.reason,principal.userId]);
  await db.query(`
   INSERT INTO public.drinkstock_checkout_fallback_events(
     partner_id,request_key,actor_user_id,before_enabled,after_enabled,reason,reviewed)
   VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7::jsonb)
  `,[action.partnerId,action.requestKey,principal.userId,before,action.enabled,
     action.reason,JSON.stringify(action.reviews)]);
  await db.query("COMMIT");committed=true;changed=true;
 }catch(e){
  if(!committed)try{await db.query("ROLLBACK");}catch{}
  throw e;
 }finally{db.release();}
 let auditRecorded=true;
 if(changed)try{
  await recordAdminAudit(principal,
   action.enabled?"hospitality.checkout_fallback.granted":"hospitality.checkout_fallback.revoked",
   "hospitality_partner",action.partnerId,
   "Admin-only POS-unavailable KONTA MOY checkout entitlement (no payment activation)",
   {posUnavailable:action.reviews.posUnavailable,
    merchantAuthorizationReviewed:action.reviews.merchantAuthorizationReviewed,
    settlementReviewed:action.reviews.settlementReviewed,
    fiscalReviewed:action.reviews.fiscalReviewed,checkoutLive:false});
 }catch{auditRecorded=false;}
 return {partnerId:action.partnerId,replayed:false,
  checkout:await checkoutFallbackByPartner(action.partnerId),auditRecorded};
}
/** Separate read helper intentionally exposes no actor or payment metadata. */
export async function checkoutFallbackByPartner(partnerId:string):Promise<CheckoutFallbackSnapshot>{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(partnerId)||
   !productionDatabaseConfigured())return mapFallback(undefined);
 const result=await getProductionPostgresRuntime().sqlPool.query<FallbackRow>(`
 SELECT f.enabled,f.pos_unavailable,f.merchant_authorization_reviewed,
  f.settlement_reviewed,f.fiscal_reviewed,f.reason,f.updated_at
 FROM public.drinkstock_checkout_fallback f
 JOIN public.hospitality_partners p ON p.id=f.partner_id AND p.status='active'
 JOIN public.hospitality_partner_apps a ON a.partner_id=p.id AND a.app_key='drinkStock' AND a.enabled
 WHERE f.partner_id=$1::uuid LIMIT 1
 `,[partnerId]);
 return mapFallback(result.rows[0]);
}
