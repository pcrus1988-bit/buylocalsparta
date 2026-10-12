import assert from "node:assert/strict";
import {createHash,createHmac,randomBytes} from "node:crypto";
import {fiscalTotp} from "../apps/web/src/lib/fiscal-operator-mfa-crypto.ts";
const digest=x=>createHash("sha256").update(x).digest("hex");
/** Runs only inside fiscal-http-e2e's synthetic local DB and server. */
export async function runFiscalRecoveryHttpAcceptance({send,db,base,reviewer,merchant,federated,mfaPath,suffix,reviewUserEmail}){
 const path="/timologio-admin/api/mfa/recovery";
 const evidenceRef="REC-CI-OFFLINE-"+suffix.toUpperCase();
 const ownerId=await db.query("SELECT id::text FROM fiscal_users WHERE email=$1",[reviewUserEmail]);
 assert.equal(ownerId.rowCount,1);
 const contactOwnerId=ownerId.rows[0].id;
 await db.query(
  `INSERT INTO fiscal_security_alert_contacts(
     audience,recipient_email,verified_at,verified_by,verification_method)
   VALUES('soc',$1,now(),'ci_independent_security_officer','organization_security_registry')`,
  ["soc-security-"+suffix+"@example.test"]);
 const beforeContact=await send(path,{action:"request",evidenceRef},reviewer);
 assert.equal(beforeContact.status,503,
  "Recovery must fail closed until the account owner and SOC BOTH have verified contacts");
 const noPrematureCase=await db.query(
  "SELECT count(*)::int AS n FROM fiscal_mfa_recovery_cases WHERE target_kind='fiscal_admin' AND target_ref=$1",
  [contactOwnerId]);
 assert.equal(noPrematureCase.rows[0].n,0,"A missing alert destination rolls back the recovery case");
 await db.query(
  `INSERT INTO fiscal_security_alert_contacts(
     audience,actor_kind,actor_ref,recipient_email,verified_at,verified_by,verification_method)
   VALUES('account_owner','fiscal_admin',$1,$2,now(),
      'ci_independent_security_officer','independent_offline_callback')`,
  [contactOwnerId,reviewUserEmail]);
 const blockedAlertMonitor=await fetch(base+"/timologio-admin/api/mfa/alerts",{
  headers:{cookie:reviewer.cookies},signal:AbortSignal.timeout(12000)});
 assert.equal(blockedAlertMonitor.status,403,"Native fiscal_admin cannot view all security notifications");
 const deniedMerchantAlerts=await fetch(base+"/timologio-admin/api/mfa/alerts",{
  headers:{cookie:merchant.cookies},signal:AbortSignal.timeout(12000)});
 assert.equal(deniedMerchantAlerts.status,401,"Merchants cannot view private security alert operations");
 const verifiedMonitor=await fetch(base+"/timologio-admin/api/mfa/alerts",{
  headers:{cookie:federated.cookies},signal:AbortSignal.timeout(12000)});
 assert.equal(verifiedMonitor.status,200,"Recently stepped-up SSO super-admin may inspect security alert status");
 const cleanMonitor=await verifiedMonitor.json();
 assert.equal(cleanMonitor.schemaReady,true);
 assert.equal(cleanMonitor.deliveryReceiptsReady,true);
 assert.equal(JSON.stringify(cleanMonitor).includes("@example.test"),false,
  "The private security dashboard cannot leak owner or SOC email addresses");
 const unauthorizedDispatch=await fetch(base+"/timologio/api/security-alert-dispatch",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:"{}",signal:AbortSignal.timeout(10000)});
 assert.equal(unauthorizedDispatch.status,401,
  "No user session can invoke the private security alert dispatcher");

 const unauth=await send(path,{action:"request",evidenceRef},merchant);
 assert.equal(unauth.status,401,"Merchant cannot request administrator recovery");
 const origin=await send(path,{action:"request",evidenceRef},{...reviewer,origin:"https://untrusted.invalid"});
 assert.equal(origin.status,403);
 const csrf=await send(path,{action:"request",evidenceRef},{...reviewer,csrf:"0".repeat(64)});
 assert.equal(csrf.status,403);
 const forged=await send(path,{action:"request",evidenceRef,targetRef:"another-operator"},reviewer);
 assert.equal(forged.status,400,"Cannot select a different recovery target");
 const requested=await send(path,{action:"request",evidenceRef},reviewer);
 assert.equal(requested.status,200,"Active operator may self-request lost device recovery");
 const caseId=requested.body.caseId;
 assert.match(caseId,/^[a-f0-9-]{36}$/);
 assert.equal((await send(path,{action:"request",evidenceRef},reviewer)).status,409,
   "Only one outstanding self-request per operator");
 assert.equal((await send(path,{action:"approve",caseId,evidenceRef,attested:true},reviewer)).status,403,
   "Fiscal-admin cannot approve; requester must not self-approve");
 const approvalsView=await fetch(base+path,{headers:{cookie:federated.cookies},
   signal:AbortSignal.timeout(12000)});
 assert.equal(approvalsView.status,200,"Recently verified super-admin may view pending cases");
 const approvalInventory=await approvalsView.json();
 const caseVisible=approvalInventory.approvable.find((item)=>item.id===caseId);
 assert.ok(caseVisible,"An eligible reviewer can see the pending case ID");
 assert.equal(Object.hasOwn(caseVisible,"evidenceRef"),false,
   "Independent evidence reference must never be disclosed to the approver's browser");
 assert.equal((await send(path,{action:"approve",caseId,evidenceRef:"REC-CI-MISMATCHED",attested:true},federated)).status,403,
   "Evidence must match the offline review identifier");
 assert.equal((await send(path,{action:"approve",caseId,evidenceRef,attested:false},federated)).status,400);
 const first=await send(path,{action:"approve",caseId,evidenceRef,attested:true},federated);
 assert.equal(first.status,200);
 assert.equal(first.body.approvals,1);
 assert.equal(first.body.state,"pending","First approval cannot invalidate TOTP");
 assert.equal((await send(path,{action:"approve",caseId,evidenceRef,attested:true},federated)).status,409,
   "Same first approver cannot approve twice");
 const firstFactor=await db.query(
  "SELECT status FROM fiscal_operator_mfa_factors WHERE actor_kind='fiscal_admin' AND actor_ref=(SELECT id::text FROM fiscal_users WHERE email=$1)",
  [reviewUserEmail]);
 assert.equal(firstFactor.rows[0].status,"active");
 // A distinct real SSO session and TOTP enrollment is needed for the second signer.
 const ref="recovery-second-super-"+suffix;
 const token=randomBytes(32).toString("hex"),csrfToken=randomBytes(32).toString("hex");
 await db.query(
  `INSERT INTO fiscal_superadmin_sessions(token_hash,csrf_hash,marketplace_user_id,marketplace_email,expires_at)
    VALUES($1,$2,$3,$4,now()+interval '2 hours')`,
  [digest(token),digest(csrfToken),ref,"recovery-second-"+suffix+"@example.test"]);
 const second={cookies:"km_fiscal_superadmin_sso="+token+"; km_fiscal_superadmin_csrf="+csrfToken,csrf:csrfToken};
 const missingSecondMfa=await send(path,{action:"approve",caseId,evidenceRef,attested:true},second);
 assert.equal(missingSecondMfa.status,403,"Second operator requires independent recent step-up");
 const setup=await send(mfaPath,{action:"start"},second);
 assert.equal(setup.status,200);
 const code=fiscalTotp(setup.body.secret,Math.floor(Date.now()/30000));
 const activated=await send(mfaPath,{action:"activate",code},second);
 assert.equal(activated.status,200);
 const mfaCookie=activated.cookieHeaders.map(x=>x.split(";")[0])
  .find(x=>x.startsWith("km_fiscal_operator_mfa="));
 assert.ok(mfaCookie);
 second.cookies+="; "+mfaCookie;
 const completed=await send(path,{action:"approve",caseId,evidenceRef,attested:true},second);
 assert.equal(completed.status,200,"Second distinct SSO+TOTP operator may complete recovery");
 assert.equal(completed.body.state,"completed");
 assert.equal(completed.body.approvals,2);
 const state=await db.query(
  `SELECT status FROM fiscal_operator_mfa_factors WHERE actor_kind='fiscal_admin'
    AND actor_ref=(SELECT id::text FROM fiscal_users WHERE email=$1)`,[reviewUserEmail]);
 assert.equal(state.rows[0].status,"pending","Old factor must be invalidated");
 const oldSessions=await db.query(
  `SELECT count(*)::int AS n FROM fiscal_operator_mfa_sessions
   WHERE actor_kind='fiscal_admin' AND actor_ref=(SELECT id::text FROM fiscal_users WHERE email=$1)
    AND revoked_at IS NULL`,[reviewUserEmail]);
 assert.equal(oldSessions.rows[0].n,0,"Recovery atomically revokes all prior step-up sessions");
 const oldAuth=await fetch(base+mfaPath,{headers:{cookie:reviewer.cookies},signal:AbortSignal.timeout(12000)});
 const oldStatus=await oldAuth.json();
 assert.equal(oldStatus.active,false);assert.equal(oldStatus.steppedUp,false);
 assert.equal((await send(path,{action:"approve",caseId,evidenceRef,attested:true},second)).status,409,
   "Completed recovery cannot be replayed");
 const fresh=await send(mfaPath,{action:"start"},reviewer);
 assert.equal(fresh.status,200,"Target can re-enroll without losing the primary session");
 const freshCode=fiscalTotp(fresh.body.secret,Math.floor(Date.now()/30000));
 const next=await send(mfaPath,{action:"activate",code:freshCode},reviewer);
 assert.equal(next.status,200);
 const queue=await db.query(
  `SELECT o.event_code,o.status,o.attempts,count(*)::int AS count,
      bool_and(c.verified_at IS NOT NULL AND c.revoked_at IS NULL) AS verified
   FROM fiscal_security_alert_outbox o
   JOIN fiscal_security_alert_contacts c ON c.id=o.contact_id
   WHERE o.case_id=$1 GROUP BY o.event_code,o.status,o.attempts ORDER BY o.event_code`,
  [caseId]);
 assert.deepEqual(queue.rows.map(x=>[x.event_code,x.status,x.attempts,x.count]),[
  ["approval_recorded","pending",0,4],
  ["completed","pending",0,2],
  ["requested","pending",0,2]
 ],"Every recovery event must atomically queue independent SOC and owner notifications");
 assert.ok(queue.rows.every(x=>x.verified));

 // Resend server acceptance != actual mail server delivery. Synthetic provider
 // acceptance makes it possible to test the genuinely signed webhook separately
 // from external email sending (which must never run in disposable CI).
 const selected=await db.query(
  `SELECT id FROM fiscal_security_alert_outbox
    WHERE case_id=$1 AND status='pending' ORDER BY created_at,id LIMIT 1`,[caseId]);
 assert.ok(selected.rows[0],"Recovery must enqueue private alerts");
 const notificationId=selected.rows[0].id;
 const emailId="ci_resend_delivery_"+suffix.replace(/[^a-zA-Z0-9]/g,"").slice(0,25);
 // A correctly signed early webhook must not persist an unrelated/unbound
 // event. Subsequent provider GET reconciliation recovers its last_event.
 const earlyId="msg_ci_early_"+suffix;
 const earlyTimestamp=String(Math.floor(Date.now()/1000));
 const earlyPayload=JSON.stringify({type:"email.delivered",
  created_at:new Date().toISOString(),data:{email_id:emailId}});
 const earlySignature="v1,"+createHmac("sha256",Buffer.alloc(32,173))
  .update(earlyId+"."+earlyTimestamp+"."+earlyPayload).digest("base64");
 const early=await fetch(base+"/timologio/api/security-alert-webhook",{
  method:"POST",headers:{"content-type":"application/json","svix-id":earlyId,
   "svix-timestamp":earlyTimestamp,"svix-signature":earlySignature},
  body:earlyPayload,signal:AbortSignal.timeout(10000)});
 assert.equal(early.status,200);
 assert.equal((await early.json()).ignored,true,
  "Early valid webhook is not persisted without a known FISCAL provider ID");

 await db.query(
  `UPDATE fiscal_security_alert_outbox SET status='sending',
    attempts=1,last_attempt_at=now(),lease_until=now()+interval '90 seconds',
    lease_token_hash=$2 WHERE id=$1`,[notificationId,"a".repeat(64)]);
 await db.query(
  `UPDATE fiscal_security_alert_outbox SET status='provider_accepted',
    provider_message_id=$2,provider_accepted_at=now(),
    lease_until=NULL,lease_token_hash=NULL WHERE id=$1`,[notificationId,emailId]);
 const webhookPath="/timologio/api/security-alert-webhook";
 const signingSecret=Buffer.alloc(32,173);
 let nextEvent=1;
 async function signedWebhook(type,providerId=emailId,tamper=false,explicitId){
  const svixId=explicitId??("msg_ci_mfa_"+suffix+"_"+nextEvent++);
  const timestamp=String(Math.floor(Date.now()/1000));
  const raw=JSON.stringify({type,created_at:new Date().toISOString(),data:{email_id:providerId}});
  const validSignature="v1,"+createHmac("sha256",signingSecret)
   .update(svixId+"."+timestamp+"."+raw).digest("base64");
  const response=await fetch(base+webhookPath,{method:"POST",headers:{
   "content-type":"application/json","svix-id":svixId,
   "svix-timestamp":timestamp,
   "svix-signature":tamper?"v1,BADSIGNATURE":validSignature
  },body:raw,signal:AbortSignal.timeout(10000)});
  let body;
  try{body=await response.json()}catch{body=null}
  return {status:response.status,body,svixId};
 }
 const badSignature=await signedWebhook("email.delivered",emailId,true);
 assert.equal(badSignature.status,401,"Forged provider notification must be rejected");
 const delivered=await signedWebhook("email.delivered");
 assert.equal(delivered.status,200);
 assert.equal(delivered.body.ok,true);
 const duplicate=await signedWebhook("email.delivered",emailId,false,delivered.svixId);
 assert.equal(duplicate.status,200,"Duplicate signed webhook must be idempotent");
 assert.equal(duplicate.body.duplicate,true);
 const unrelated=await signedWebhook("email.delivered","ci_resend_unrelated_12345");
 assert.equal(unrelated.status,200);
 assert.equal(unrelated.body.ignored,true,"Other mail streams must not enter FISCAL notification ledger");
 const bounced=await signedWebhook("email.bounced");
 assert.equal(bounced.status,200,"A later bounce must record a distinct failure");
 const receipts=await db.query(
  "SELECT event_type FROM fiscal_security_alert_delivery_events WHERE outbox_id=$1 ORDER BY event_type",
  [notificationId]);
 assert.deepEqual(receipts.rows.map(r=>r.event_type),["email.bounced","email.delivered"]);
 const monitorAfter=await fetch(base+"/timologio-admin/api/mfa/alerts",{
  headers:{cookie:federated.cookies},signal:AbortSignal.timeout(12000)});
 assert.equal(monitorAfter.status,200);
 const monitorState=await monitorAfter.json();
 assert.equal(monitorState.counts.deliveryProblem,1,
  "Signed bounce must take precedence over prior delivery in operations");
 assert.equal(monitorState.alerts.find(x=>x.id===notificationId)?.deliveryState,"failed");
 assert.equal(JSON.stringify(monitorState).includes(emailId),false,
  "Provider identifiers must not leak to security dashboard clients");
 const replacementCookie=next.cookieHeaders.map(x=>x.split(";")[0])
  .find(x=>x.startsWith("km_fiscal_operator_mfa="));
 assert.ok(replacementCookie);
 reviewer.cookies=reviewer.cookies.split("; ").filter(x=>!x.startsWith("km_fiscal_operator_mfa="))
  .join("; ")+"; "+replacementCookie;
 console.log("PASS: two-independent-superadmin recovery and safe re-enrollment");
}
