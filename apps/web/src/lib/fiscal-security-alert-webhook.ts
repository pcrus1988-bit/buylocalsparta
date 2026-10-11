/** Dedicated signed Resend webhook receipt processor; never accepts unsigned JSON. */
import {ResendWebhookVerifier} from "@buy-local-sparta/resend-notifications";
import type {ResendWebhookEvent} from "@buy-local-sparta/resend-notifications";
import {fiscalPool} from "./fiscal-runtime";

const eventTypes=new Set([
 "email.delivered","email.delivery_delayed","email.bounced",
 "email.complained","email.failed","email.suppressed"
]);
const messageId=/^[a-zA-Z0-9_-]{4,160}$/;
export function verifyFiscalSecurityAlertWebhook(input:{
 payload:string;id:string|undefined;timestamp:string|undefined;signature:string|undefined;
 now?:number
}):ResendWebhookEvent {
 if(process.env.FISCAL_STANDALONE_MODE!=="true"||
    process.env.FISCAL_SECURITY_ALERT_DELIVERY_ENABLED!=="true"||
    process.env.FISCAL_SECURITY_ALERT_WEBHOOK_ENABLED!=="true")
  throw new Error("FISCAL_SECURITY_ALERT_WEBHOOK_DISABLED");
 const secret=process.env.FISCAL_SECURITY_ALERT_WEBHOOK_SECRET?.trim()??"";
 if(!/^whsec_[A-Za-z0-9+/=]{24,}$/.test(secret))
  throw new Error("FISCAL_SECURITY_ALERT_WEBHOOK_NOT_CONFIGURED");
 return new ResendWebhookVerifier(secret,300).verify(input);
}

export async function recordFiscalSecurityAlertWebhook(event:ResendWebhookEvent){
 if(!eventTypes.has(event.type))return {ok:true,ignored:true};
 if(!event.emailId||!messageId.test(event.emailId)||
    typeof event.id!=="string"||event.id.length<3||event.id.length>160 ||
    !Number.isFinite(event.createdAt))
  throw new Error("FISCAL_SECURITY_ALERT_WEBHOOK_INVALID");
 const db=await fiscalPool().connect();
 try{
  await db.query("BEGIN");
  const matching=await db.query<{id:string}>(
   `SELECT id FROM fiscal_security_alert_outbox
    WHERE provider_message_id=$1 AND status='provider_accepted' LIMIT 1
    FOR KEY SHARE`,[event.emailId]);
  if(!matching.rowCount){
   await db.query("COMMIT");
   return {ok:true,ignored:true};
  }
  const receipt=await db.query(
   `INSERT INTO fiscal_security_alert_delivery_events(
     outbox_id,provider_event_id,event_type,provider_event_at)
    VALUES($1,$2,$3,$4)
    ON CONFLICT(provider_event_id) DO NOTHING RETURNING id`,
   [matching.rows[0].id,event.id,event.type,new Date(event.createdAt)]);
  if(receipt.rowCount){
   await db.query(
    `INSERT INTO fiscal_audit_events(actor_kind,actor_ref,action,details)
     VALUES('system','fiscal_alert_webhook','security.mfa_alert_delivery_event',$1::jsonb)`,
    [JSON.stringify({outboxId:matching.rows[0].id,eventType:event.type,receiptId:receipt.rows[0].id})]);
  }
  await db.query("COMMIT");
  return {ok:true,duplicate:!receipt.rowCount};
 }catch(error){await db.query("ROLLBACK").catch(()=>undefined);throw error;}
 finally{db.release();}
}
