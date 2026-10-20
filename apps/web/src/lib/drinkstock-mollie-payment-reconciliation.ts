import {createHash} from "node:crypto";
import {getProductionPostgresRuntime,productionDatabaseConfigured} from "./postgres-runtime";
import {verifyPartnerDrinkStockPayment} from "./drinkstock-mollie-merchant-payments";
export class DrinkStockPaymentVerifyError extends Error{
 readonly code:string;readonly status:number;
 constructor(code:string,status:number){super(code);this.code=code;this.status=status;}
}
const PID=/^tr_[A-Za-z0-9]{1,100}$/;
export function readDrinkStockMollieWebhook(body:string):string{
 if(body.length<4||body.length>250)throw new DrinkStockPaymentVerifyError("INVALID_WEBHOOK",400);
 const values=new URLSearchParams(body);
 if([...values.keys()].length!==1||!values.has("id"))throw new DrinkStockPaymentVerifyError("INVALID_WEBHOOK",400);
 const id=values.get("id")??"";
 if(!PID.test(id))throw new DrinkStockPaymentVerifyError("INVALID_WEBHOOK",400);
 return id;
}
type LinkedAttempt={
 id:string;order_id:string;partner_id:string;venue_id:string;payment_id:string;
 profile_id:string;amount_cents:number;state:string;order_state:string;
 payment_state:string;order_amount_cents:number;order_currency:string;
};
const attemptSql=`
 SELECT a.id::text,a.order_id::text,a.partner_id::text,a.venue_id::text,
 a.payment_id,a.profile_id,a.amount_cents,a.state,
 o.order_state,o.payment_state,o.amount_gross_cents AS order_amount_cents,
 o.currency AS order_currency
 FROM public.drinkstock_merchant_payment_attempts a
 JOIN public.drinkstock_orders o ON o.id=a.order_id AND o.partner_id=a.partner_id AND o.venue_id=a.venue_id
 WHERE a.payment_id=$1 AND a.provider='mollie'
`;
/** Read Mollie server-to-server, never trust webhook body apart from the ID.
 * A verified charge is recorded even when fiscal issuance has not occurred,
 * but the ticket is NOT dispatched to the bar until a certified fiscal job
 * issues the receipt and promotes its order_state from awaiting_payment.
 */
export async function reconcileDrinkStockMollieWebhook(
 paymentId:string,
 verify:typeof verifyPartnerDrinkStockPayment=verifyPartnerDrinkStockPayment
){
 if(!PID.test(paymentId))throw new DrinkStockPaymentVerifyError("INVALID_WEBHOOK",400);
 if(!productionDatabaseConfigured())throw new DrinkStockPaymentVerifyError("DATABASE_UNAVAILABLE",503);
 const pool=getProductionPostgresRuntime().sqlPool;
 const lookup=await pool.query<LinkedAttempt>(attemptSql,[paymentId]);
 const attempt=lookup.rows[0];
 if(!attempt)return {recognized:false,processed:false};
 if(Number(attempt.amount_cents)!==Number(attempt.order_amount_cents)||attempt.order_currency!=="EUR")
  throw new DrinkStockPaymentVerifyError("PAYMENT_ORDER_AMOUNT_MISMATCH",409);
 // This MUST fetch the payment from the partner-owned Mollie OAuth account,
 // verify live status, profile, order metadata, currency, amount and provider ID.
 await verify(attempt.partner_id,paymentId,{
  orderId:attempt.order_id,profileId:attempt.profile_id,grossCents:Number(attempt.amount_cents)
 });
 const db=await pool.connect();let committed=false;
 try{
  await db.query("BEGIN");await db.query("SET LOCAL statement_timeout='8s'");
  const reread=await db.query<LinkedAttempt>(attemptSql+" FOR UPDATE OF a,o",[paymentId]);
  const current=reread.rows[0];
  if(!current||current.order_id!==attempt.order_id||
    current.partner_id!==attempt.partner_id||current.venue_id!==attempt.venue_id||
    current.profile_id!==attempt.profile_id||
    Number(current.amount_cents)!==Number(attempt.amount_cents)||
    Number(current.order_amount_cents)!==Number(attempt.amount_cents)||
    current.order_currency!=="EUR")
    throw new DrinkStockPaymentVerifyError("PAYMENT_ATTEMPT_CHANGED",409);
  if(current.state!=="created"){
   await db.query("COMMIT");committed=true;
   return {recognized:true,processed:false,replayed:true,fiscalIssued:false};
  }
  if(current.payment_state!=="pending"||current.order_state!=="awaiting_payment")
   throw new DrinkStockPaymentVerifyError("PAYMENT_ORDER_STATE_MISMATCH",409);
  const digest=createHash("sha256").update(JSON.stringify({
   provider:"mollie",providerPaymentId:paymentId,orderId:attempt.order_id,
   amountCents:Number(attempt.amount_cents),currency:"EUR",status:"paid",
   profileId:attempt.profile_id
  })).digest("hex");
  await db.query(`
   INSERT INTO public.drinkstock_payment_events(
    order_id,provider,provider_event_id,event_type,amount_cents,payload_sha256)
   VALUES($1::uuid,'mollie',$2,'payment_verified',$3,$4)
   ON CONFLICT(provider,provider_event_id) DO NOTHING
  `,[attempt.order_id,paymentId,Number(attempt.amount_cents),digest]);
  await db.query(`
   UPDATE public.drinkstock_orders SET payment_state='paid',
     fiscal_state='pending',updated_at=now()
   WHERE id=$1::uuid AND partner_id=$2::uuid AND venue_id=$3::uuid
    AND payment_state='pending' AND order_state='awaiting_payment'
  `,[attempt.order_id,attempt.partner_id,attempt.venue_id]);
  await db.query(`
   UPDATE public.drinkstock_merchant_payment_attempts SET state='fiscal_pending',verified_at=now()
   WHERE id=$1::uuid
  `,[attempt.id]);
  await db.query("COMMIT");committed=true;
  return {recognized:true,processed:true,fiscalIssued:false};
 }catch(e){if(!committed)try{await db.query("ROLLBACK");}catch{}throw e;}
 finally{db.release();}
}
