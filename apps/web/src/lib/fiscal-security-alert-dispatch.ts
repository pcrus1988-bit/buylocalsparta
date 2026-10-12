/** Private FISCAL notification worker. Never called from a public user session. */
import {createHash,randomBytes,timingSafeEqual} from "node:crypto";
import {fiscalPool} from "./fiscal-runtime";
import {fiscalSecurityDeliveryConfig} from "./fiscal-security-alert-outbox";
import {reconcileFiscalAlertDelivery} from "./fiscal-security-alert-reconcile";
import {
 fiscalAlertClassifyProvider,fiscalAlertFinalDecision,fiscalAlertBackoffSeconds,
 type FiscalAlertDeliveryResult
} from "./fiscal-security-alert-delivery-policy";

const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const HEX=/^[a-f0-9]{64}$/i;
export function authorizeFiscalAlertDispatch(request:Request){
 if(process.env.FISCAL_STANDALONE_MODE!=="true")return false;
 const expected=process.env.FISCAL_SECURITY_ALERT_DISPATCH_TOKEN?.trim()??"";
 const header=request.headers.get("authorization")??"";
 const found=/^Bearer ([a-f0-9]{64})$/i.exec(header);
 if(!HEX.test(expected)||!found)return false;
 return timingSafeEqual(Buffer.from(hash(found[1])) ,Buffer.from(hash(expected)));
}
type WorkItem={id:string;case_id:string;event_code:string;attempts:number;
 created_at:Date;recipient_email:string;audience:"soc"|"account_owner";lease_hash:string};
async function claimBatch():Promise<WorkItem[]>{
 const db=await fiscalPool().connect();
 try{
  await db.query("BEGIN");
  // Stale crash leases are recoverable. Uncertain sends are retried only within
  // the Resend 24-hour idempotency window; older rows must be investigated.
  await db.query(
   `UPDATE fiscal_security_alert_outbox
    SET status=CASE WHEN attempts>=8 OR created_at<now()-interval '23 hours'
     THEN 'dead' ELSE 'pending' END,
     last_error_code='LEASE_EXPIRED',lease_until=NULL,lease_token_hash=NULL,
     next_attempt_at=now()
    WHERE status='sending' AND lease_until<now()`);
  await db.query(
   `UPDATE fiscal_security_alert_outbox SET status='dead',
     last_error_code='RETRY_WINDOW_EXPIRED'
    WHERE status='pending' AND created_at<now()-interval '23 hours'`);
  await db.query(
   `UPDATE fiscal_security_alert_outbox o SET status='dead',
     last_error_code='CONTACT_REVOKED'
    FROM fiscal_security_alert_contacts c
    WHERE o.contact_id=c.id AND c.revoked_at IS NOT NULL
      AND o.status='pending'`);
  const selected=await db.query<Omit<WorkItem,"lease_hash">>(
   `SELECT o.id,o.case_id,o.event_code,o.attempts,o.created_at,
      c.recipient_email,c.audience
    FROM fiscal_security_alert_outbox o
    JOIN fiscal_security_alert_contacts c ON c.id=o.contact_id
    WHERE o.status='pending' AND o.next_attempt_at<=now()
      AND o.attempts<8 AND o.created_at>now()-interval '23 hours'
      AND c.revoked_at IS NULL
    ORDER BY o.created_at ASC,o.id ASC LIMIT 3 FOR UPDATE OF o SKIP LOCKED`);
  const work:WorkItem[]=[];
  for(const row of selected.rows){
   const leaseHash=hash(randomBytes(32).toString("hex"));
   await db.query(
    `UPDATE fiscal_security_alert_outbox SET
      status='sending',attempts=attempts+1,last_attempt_at=now(),
      lease_until=now()+interval '90 seconds',lease_token_hash=$2
     WHERE id=$1`,[row.id,leaseHash]);
   work.push({...row,attempts:row.attempts+1,lease_hash:leaseHash});
  }
  await db.query("COMMIT");
  return work;
 }catch(e){await db.query("ROLLBACK").catch(()=>undefined);throw e;}
 finally{db.release();}
}
function safeMessage(item:WorkItem){
 const labels:Record<string,string>={
  requested:"Υποβλήθηκε αίτημα ανάκτησης MFA",
  approval_recorded:"Καταγράφηκε ανεξάρτητη έγκριση ανάκτησης MFA",
  completed:"Ολοκληρώθηκε διαδικασία ανάκτησης MFA",
  cancelled:"Ακυρώθηκε διαδικασία ανάκτησης MFA"
 };
 const event=labels[item.event_code]??"Καταγράφηκε συμβάν ασφάλειας MFA";
 return {
  from:fiscalSecurityDeliveryConfig().from,
  to:[item.recipient_email],
  subject:"KONTA MOY FISCAL · Ειδοποίηση ασφάλειας λογαριασμού",
  text:event+"\n\nΑριθμός υπόθεσης: "+item.case_id+
   "\nΑποδέκτης ενημέρωσης: "+(item.audience==="soc"?"Υπεύθυνος ασφάλειας":"Κάτοχος λογαριασμού")+
   "\n\nΑν δεν αναγνωρίζετε τη δραστηριότητα, επικοινωνήστε αμέσως με το αρμόδιο τμήμα ασφάλειας μέσω του ήδη γνωστού επίσημου καναλιού."+
   "\n\nΑυτή η ειδοποίηση δεν επιβεβαιώνει ταυτότητα και δεν εγκρίνει φορολογική έκδοση."
 };
}
async function sendOne(item:WorkItem):Promise<FiscalAlertDeliveryResult>{
 const config=fiscalSecurityDeliveryConfig();
 try{
  const response=await fetch("https://api.resend.com/emails",{
   method:"POST",headers:{
    "authorization":"Bearer "+config.apiKey,
    "content-type":"application/json",
    "Idempotency-Key":"fiscal-mfa-alert-"+item.id
   },
   body:JSON.stringify(safeMessage(item)),signal:AbortSignal.timeout(8000)
  });
  let body:unknown=null;
  try{body=await response.json();}catch{ /* Untrusted provider body is not logged. */ }
  return fiscalAlertClassifyProvider(response.status,body);
 }catch{return {kind:"retry",code:"NETWORK_UNAVAILABLE"};}
}
async function finishOne(item:WorkItem,outcome:FiscalAlertDeliveryResult){
 const elapsed=Date.now()-new Date(item.created_at).getTime();
 const decision=fiscalAlertFinalDecision(outcome,item.attempts,elapsed);
 const status=decision.kind==="accepted"?"provider_accepted":decision.kind==="dead"?"dead":"pending";
 const db=await fiscalPool().connect();
 try{
  await db.query("BEGIN");
  const result=await db.query(
   `UPDATE fiscal_security_alert_outbox SET status=$3,
      provider_message_id=$4,provider_accepted_at=CASE WHEN $3='provider_accepted' THEN now() ELSE NULL END,
      last_error_code=$5,lease_until=NULL,lease_token_hash=NULL,
      next_attempt_at=CASE WHEN $3='pending' THEN now()+($6::int*interval '1 second')
                           ELSE next_attempt_at END
    WHERE id=$1 AND lease_token_hash=$2 AND status='sending' RETURNING id`,
   [item.id,item.lease_hash,status,decision.kind==="accepted"?decision.providerId:null,
    decision.kind==="accepted"?null:decision.code,
    fiscalAlertBackoffSeconds(item.attempts)]);
  if(result.rowCount===1&&status==="provider_accepted"){
   // Only known FISCAL provider IDs will be retrieved from Resend.
   await db.query(
    `INSERT INTO fiscal_security_alert_reconciliation(outbox_id)
     VALUES($1) ON CONFLICT(outbox_id) DO NOTHING`,[item.id]);
  }
  if(result.rowCount===1&&status!=="pending"){
   await db.query(
    `INSERT INTO fiscal_audit_events(actor_kind,actor_ref,action,details)
     VALUES('system','fiscal_alert_dispatcher',$1,$2::jsonb)`,
    [status==="provider_accepted"?"security.mfa_alert_provider_accepted":"security.mfa_alert_dead_letter",
     JSON.stringify({outboxId:item.id,caseId:item.case_id,status})]);
  }
  await db.query("COMMIT");
  return result.rowCount===1?status:"lease_lost";
 }catch(e){await db.query("ROLLBACK").catch(()=>undefined);throw e;}
 finally{db.release();}
}
export async function runFiscalAlertDispatch(){
 fiscalSecurityDeliveryConfig();
 const work=await claimBatch();
 const counts={claimed:work.length,providerAccepted:0,retrying:0,dead:0,leaseLost:0};
 for(const item of work){
  const outcome=await sendOne(item);
  const state=await finishOne(item,outcome);
  if(state==="provider_accepted")counts.providerAccepted++;
  else if(state==="pending")counts.retrying++;
  else if(state==="dead")counts.dead++;
  else counts.leaseLost++;
 }
 const reconciliation=await reconcileFiscalAlertDelivery();
 return {...counts,reconciliation};
 // Never return recipient addresses, provider payloads or secrets.
}
