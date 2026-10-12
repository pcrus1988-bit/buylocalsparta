/** Private bounded receipt reconciliation for previously accepted FISCAL alert IDs.
 * Run only through authorized standalone dispatcher; never enumerate Resend mail.
 */
import {createHash,randomBytes} from "node:crypto";
import {fiscalPool} from "./fiscal-runtime";
import {fiscalSecurityDeliveryConfig} from "./fiscal-security-alert-outbox";
import {retrieveFiscalResendStatus,fiscalReconcileIntervalSeconds,
 type FiscalReconcileStatus} from "./fiscal-security-alert-provider-status";

type Row={outbox_id:string;attempts:number;created_at:Date;
 provider_message_id:string;recipient_email:string;lease_token_hash:string};
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
export const fiscalReconcileEnabled=()=>
 process.env.FISCAL_SECURITY_ALERT_RECONCILIATION_ENABLED==="true";

async function claimReconciliations():Promise<Row[]>{
 const db=await fiscalPool().connect();
 try{
  await db.query("BEGIN");
  await db.query(
   `UPDATE fiscal_security_alert_reconciliation SET
    state=CASE WHEN attempts>=12 OR created_at<now()-interval '23 hours'
      THEN 'exhausted' ELSE 'pending' END,
    last_error_code='LEASE_EXPIRED',
    lease_until=NULL,lease_token_hash=NULL,next_attempt_at=now()
    WHERE state='checking' AND lease_until<now()`);
  await db.query(
   `UPDATE fiscal_security_alert_reconciliation SET
      state='exhausted',last_error_code='RECONCILE_WINDOW_EXPIRED'
    WHERE state='pending' AND
      (attempts>=12 OR created_at<now()-interval '23 hours')`);
  await db.query(
   `UPDATE fiscal_security_alert_reconciliation r SET
    state='exhausted',last_error_code='CONTACT_REVOKED'
    FROM fiscal_security_alert_outbox o
    JOIN fiscal_security_alert_contacts c ON c.id=o.contact_id
    WHERE r.outbox_id=o.id AND c.revoked_at IS NOT NULL
      AND r.state='pending'`);
  const selected=await db.query<Omit<Row,"lease_token_hash">>(
   `SELECT r.outbox_id,r.attempts,r.created_at,
       o.provider_message_id,c.recipient_email
    FROM fiscal_security_alert_reconciliation r
    JOIN fiscal_security_alert_outbox o ON o.id=r.outbox_id
    JOIN fiscal_security_alert_contacts c ON c.id=o.contact_id
    WHERE r.state='pending' AND r.next_attempt_at<=now()
      AND r.attempts<12 AND r.created_at>now()-interval '23 hours'
      AND o.status='provider_accepted' AND o.provider_message_id IS NOT NULL
      AND c.revoked_at IS NULL
    ORDER BY r.next_attempt_at ASC,r.outbox_id ASC
    LIMIT 3 FOR UPDATE OF r SKIP LOCKED`);
  const work:Row[]=[];
  for(const item of selected.rows){
   const token=hash(randomBytes(32).toString("hex"));
   await db.query(
    `UPDATE fiscal_security_alert_reconciliation SET
     state='checking',attempts=attempts+1,last_checked_at=now(),
     lease_until=now()+interval '90 seconds',lease_token_hash=$2
     WHERE outbox_id=$1`,[item.outbox_id,token]);
   work.push({...item,attempts:item.attempts+1,lease_token_hash:token});
  }
  await db.query("COMMIT");
  return work;
 }catch(e){await db.query("ROLLBACK").catch(()=>undefined);throw e;}
 finally{db.release();}
}
const failedEvent=(name:string)=>["bounced","complained","failed","suppressed"].includes(name);
async function finishReconciliation(item:Row,outcome:FiscalReconcileStatus){
 const db=await fiscalPool().connect();
 try{
  await db.query("BEGIN");
  const check=await db.query(
   `SELECT 1 FROM fiscal_security_alert_reconciliation
     WHERE outbox_id=$1 AND state='checking' AND lease_token_hash=$2
       AND lease_until>now() FOR UPDATE`,
   [item.outbox_id,item.lease_token_hash]);
  if(!check.rowCount){await db.query("COMMIT");return "lease_lost";}
  const elapsed=Date.now()-new Date(item.created_at).getTime();
  const expired=elapsed>=23*60*60*1000||item.attempts>=12;
  let lastEvent="unknown",lastError:string|null=null;
  if(outcome.kind==="observed"){
   lastEvent=outcome.lastEvent;
   if(outcome.receiptType){
    // Provider account status is independently authenticated via API key but
    // is NOT a signed Svix event; the receipt records this distinction.
    const providerEventId="api_"+item.outbox_id.replace(/-/g,"")+"_"+lastEvent;
    const newReceipt=await db.query(
     `INSERT INTO fiscal_security_alert_delivery_events(
        outbox_id,provider_event_id,event_type,verification_source,provider_event_at)
      VALUES($1,$2,$3,'provider_api',NULL)
      ON CONFLICT(provider_event_id) DO NOTHING RETURNING id`,
     [item.outbox_id,providerEventId,outcome.receiptType]);
    if(newReceipt.rowCount)
     await db.query(
      `INSERT INTO fiscal_audit_events(actor_kind,actor_ref,action,details)
       VALUES('system','fiscal_alert_reconciler','security.mfa_alert_provider_status_observed',$1::jsonb)`,
      [JSON.stringify({outboxId:item.outbox_id,eventType:outcome.receiptType,
       receiptId:newReceipt.rows[0].id})]);
   }
  }else lastError=outcome.code;
  const closed=expired||outcome.kind==="security_error"||
    (outcome.kind==="observed"&&failedEvent(lastEvent));
  const state=closed?(outcome.kind==="security_error"||expired?"exhausted":"complete"):"pending";
  await db.query(
   `UPDATE fiscal_security_alert_reconciliation SET
      state=$3,lease_until=NULL,lease_token_hash=NULL,
      last_observed_event=$4,last_error_code=$5,
      next_attempt_at=CASE WHEN $3='pending'
        THEN now()+($6::int*interval '1 second')
        ELSE next_attempt_at END
    WHERE outbox_id=$1 AND lease_token_hash=$2 AND state='checking'`,
   [item.outbox_id,item.lease_token_hash,state,lastEvent,
    outcome.kind==="security_error"?outcome.code:
      expired?"RECONCILE_WINDOW_EXPIRED":lastError,
    fiscalReconcileIntervalSeconds(lastEvent,item.attempts)]);
  if(state==="exhausted")
   await db.query(
    `INSERT INTO fiscal_audit_events(actor_kind,actor_ref,action,details)
     VALUES('system','fiscal_alert_reconciler',
       'security.mfa_alert_reconciliation_exhausted',$1::jsonb)`,
    [JSON.stringify({outboxId:item.outbox_id,reason:
      outcome.kind==="security_error"?outcome.code:"RECONCILE_WINDOW_EXPIRED"})]);
  await db.query("COMMIT");
  return state;
 }catch(e){await db.query("ROLLBACK").catch(()=>undefined);throw e;}
 finally{db.release();}
}
export async function reconcileFiscalAlertDelivery(){
 if(!fiscalReconcileEnabled())return {enabled:false,checked:0,receiptEvents:0,exhausted:0};
 const {apiKey}=fiscalSecurityDeliveryConfig();
 const items=await claimReconciliations();
 const stats={enabled:true,checked:0,receiptEvents:0,exhausted:0};
 for(const item of items){
  const outcome=await retrieveFiscalResendStatus({
   messageId:item.provider_message_id,recipient:item.recipient_email,apiKey
  });
  const state=await finishReconciliation(item,outcome);
  if(state==="lease_lost")continue;
  stats.checked++;
  if(outcome.kind==="observed"&&outcome.receiptType)stats.receiptEvents++;
  if(state==="exhausted")stats.exhausted++;
 }
 return stats;
}
