import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
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
 const replacementCookie=next.cookieHeaders.map(x=>x.split(";")[0])
  .find(x=>x.startsWith("km_fiscal_operator_mfa="));
 assert.ok(replacementCookie);
 reviewer.cookies=reviewer.cookies.split("; ").filter(x=>!x.startsWith("km_fiscal_operator_mfa="))
  .join("; ")+"; "+replacementCookie;
 console.log("PASS: two-independent-superadmin recovery and safe re-enrollment");
}
