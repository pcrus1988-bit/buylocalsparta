import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {fiscalTotp} from "../apps/web/src/lib/fiscal-operator-mfa-crypto.ts";
const digest=x=>createHash("sha256").update(x).digest("hex");
/** Runs only inside fiscal-http-e2e's synthetic local DB and server. */
export async function runFiscalRecoveryHttpAcceptance({send,db,base,reviewer,merchant,federated,mfaPath,suffix,reviewUserEmail}){
 const path="/timologio-admin/api/mfa/recovery";
 const evidenceRef="REC-CI-OFFLINE-"+suffix.toUpperCase();
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
 console.log("PASS: two-independent-superadmin recovery and safe re-enrollment");
}
