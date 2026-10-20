/**
 * HTTP acceptance tests against the ACTUAL independent Next.js runtime.
 * Only runs in GitHub CI with a disposable isolated fiscal_ci PostgreSQL database.
 * All accounts, tax IDs and products are synthetic. Never use in live staging.
 */
import assert from "node:assert/strict";
import {createServer} from "node:net";
import {spawn} from "node:child_process";
import {createHash,randomBytes,scryptSync} from "node:crypto";
import {fiscalTotp} from "../apps/web/src/lib/fiscal-operator-mfa-crypto.ts";
import pg from "pg";
import {runFiscalRecoveryHttpAcceptance} from "./fiscal-mfa-recovery-http-acceptance.mjs";

if(process.env.CI!=="true"||process.env.FISCAL_STANDALONE_MODE!=="true")
 throw new Error("FISCAL_HTTP_E2E_REQUIRES_EPHEMERAL_CI");
const fiscalUrl=process.env.FISCAL_DATABASE_URL??"";
if(!fiscalUrl)throw new Error("FISCAL_DATABASE_URL required");
const database=new URL(fiscalUrl);
if(!["127.0.0.1","localhost","::1"].includes(database.hostname)||database.pathname!=="/fiscal_ci")
 throw new Error("FISCAL_HTTP_E2E_REFUSES_PERSISTENT_DB");

const db=new pg.Client({connectionString:fiscalUrl,connectionTimeoutMillis:5000});
const suffix=randomBytes(5).toString("hex");
const password="Ephemeral-CI-Test-"+randomBytes(12).toString("hex");
const digest=(token)=>createHash("sha256").update(token).digest("hex");
const passwordHash=()=>{
 const salt=randomBytes(24).toString("hex");
 return "scrypt-v1:"+salt+":"+scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString("hex");
};
async function freePort(){
 return await new Promise((resolve,reject)=>{
  const server=createServer();
  server.once("error",reject);
  server.listen(0,"127.0.0.1",()=>{
   const address=server.address();
   const port=typeof address==="object"&&address?address.port:null;
   server.close(err=>err?reject(err):resolve(port));
  });
 });
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let server=null;
let serviceOutput="";
const appendLog=chunk=>{serviceOutput=(serviceOutput+String(chunk)).slice(-7000);};
try{
 await db.connect();
 const owner=await db.query(
  "INSERT INTO fiscal_users(email,password_hash) VALUES($1,$2) RETURNING id",
  ["synthetic-owner-"+suffix+"@example.test",passwordHash()]);
 const outsider=await db.query(
  "INSERT INTO fiscal_users(email,password_hash) VALUES($1,$2) RETURNING id",
  ["synthetic-other-"+suffix+"@example.test",passwordHash()]);
 const org=await db.query(
  "INSERT INTO fiscal_organizations(legal_name,vat_number,status) VALUES($1,'111222333','approved') RETURNING id",
  ["Synthetic Fiscal CI "+suffix]);
 const otherOrg=await db.query(
  "INSERT INTO fiscal_organizations(legal_name,vat_number,status) VALUES($1,'444555666','approved') RETURNING id",
  ["Synthetic Other CI "+suffix]);
 const ownerId=owner.rows[0].id,outsiderId=outsider.rows[0].id;
 const orgId=org.rows[0].id,otherId=otherOrg.rows[0].id;
 await db.query(
  "INSERT INTO fiscal_memberships(organization_id,user_id,role) VALUES($1,$2,'owner'),($3,$4,'owner')",
  [orgId,ownerId,otherId,outsiderId]);

 const port=await freePort();
 // Next.js normalizes production request URLs to localhost in this local runner.
 // Keep the request Host and Origin equal to that canonical local authority.
 const base="http://localhost:"+port;
 server=spawn(process.execPath,["../../node_modules/next/dist/bin/next","start","-H","localhost","-p",String(port)],{
  cwd:"fiscal/service",
  env:{
   ...process.env,DATABASE_URL:"",POSTGRES_URL:"",
   FISCAL_STANDALONE_MODE:"true",FISCAL_REGISTRATION_ENABLED:"false",
   FISCAL_MARKETPLACE_DRAFT_SYNC_ENABLED:"false",FISCAL_ISSUANCE_ENABLED:"false",
   FISCAL_INVITATIONS_ENABLED:"true",FISCAL_SERVICE_BASE_URL:"https://fiscal.kontamou.site/",
   FISCAL_EMAIL_VERIFICATION_ENABLED:"true",RESEND_API_KEY:"",FISCAL_VERIFICATION_FROM:"",
   FISCAL_OPERATOR_MFA_SETUP_ENABLED:"true",FISCAL_OPERATOR_MFA_ENFORCED:"true",
   FISCAL_MFA_RECOVERY_ENABLED:"true",
   FISCAL_SECURITY_ALERT_DELIVERY_ENABLED:"true",
   FISCAL_SECURITY_ALERT_WEBHOOK_ENABLED:"true",
   FISCAL_SECURITY_ALERT_RECONCILIATION_ENABLED:"true",
   FISCAL_SECURITY_ALERT_WEBHOOK_SECRET:"whsec_"+Buffer.alloc(32,173).toString("base64"),
   FISCAL_SECURITY_ALERT_FROM:"security@example.test",
   FISCAL_SECURITY_ALERT_DISPATCH_TOKEN:"ab".repeat(32),
   RESEND_API_KEY:"ci-only-no-external-delivery",
   FISCAL_OPERATOR_MFA_ENCRYPTION_KEY:"bc".repeat(32)
  },stdio:["ignore","pipe","pipe"]
 });
 server.stdout?.on("data",appendLog);server.stderr?.on("data",appendLog);
 let health=null;
 for(let attempts=0;attempts<80;attempts++){
  if(server.exitCode!==null)throw new Error("FISCAL_HTTP_SERVER_EXITED");
  try{
   const response=await fetch(base+"/timologio/api/health",{signal:AbortSignal.timeout(1200)});
   health={status:response.status,body:await response.json()};
   if(response.status===200)break;
  }catch{/* Next.js not listening yet */}
  await sleep(400);
 }
 assert.equal(health?.status,200,"Standalone FISCAL health must report ready; server: "+serviceOutput.slice(-1600));
 assert.equal(health.body.state,"operational_foundation");
 assert.equal(health.body.issuanceEnabled,false);
 assert.equal(health.body.service,"konta-moy-fiscal");
 console.log("PASS: standalone FISCAL boots with isolated database and legal issuance OFF");

 const send=async(path,body,{cookies="",csrf="",origin=base}={})=>{
  const response=await fetch(base+path,{
   method:"POST",headers:{
    "content-type":"application/json","origin":origin,
    ...(cookies?{cookie:cookies}:{}),...(csrf?{"x-csrf-token":csrf}:{})
   },body:JSON.stringify(body),redirect:"manual",signal:AbortSignal.timeout(10000)
  });
  let json;
  try{json=await response.json()}catch{json=null}
  return {status:response.status,body:json,cookieHeaders:response.headers.getSetCookie()};
 };
 const register=await send("/timologio/api/auth",{
  action:"register",email:"disallowed-"+suffix+"@example.test",
  password,legalName:"Forbidden Registration",vatNumber:"666555444"
 });
 assert.equal(register.status,403,"Public registration must remain blocked; response="+JSON.stringify(register.body));
 assert.equal(register.body.error,"REGISTRATION_NOT_OPEN");
 const unauth=await send("/timologio/api/console/preview",{lane:"b2b",items:[]});
 assert.equal(unauth.status,401,"Draft preview requires a merchant session; response="+JSON.stringify(unauth.body));

 async function login(email){
  const response=await send("/timologio/api/auth",{action:"login",email,password});
  assert.equal(response.status,200,"Synthetic merchant login must succeed; response="+JSON.stringify(response.body));
  assert.equal(response.body.role,"merchant");
  const values=response.cookieHeaders.map(x=>x.split(";")[0]);
  const session=values.find(v=>v.startsWith("km_fiscal_session="));
  const csrfCookie=values.find(v=>v.startsWith("km_fiscal_csrf="));
  assert.ok(session&&csrfCookie,"Independent session and CSRF cookies required");
  const csrf=csrfCookie.slice("km_fiscal_csrf=".length);
  assert.match(csrf,/^[a-f0-9]{64}$/);
  return {cookies:session+"; "+csrfCookie,csrf};
 }
 const merchant=await login("synthetic-owner-"+suffix+"@example.test");
 const stranger=await login("synthetic-other-"+suffix+"@example.test");
 const wrongCsrf=await send("/timologio/api/console/preview",{lane:"b2b",items:[]},{
  ...merchant,csrf:"0".repeat(64)
 });
 assert.equal(wrongCsrf.status,403,"Mismatched CSRF must be rejected");
 const wrongOrigin=await send("/timologio/api/console/preview",{lane:"b2b",items:[]},{
  ...merchant,origin:"https://untrusted.invalid"
 });
 assert.equal(wrongOrigin.status,403,"Cross-origin request must be rejected");
 console.log("PASS: independent auth, registration block, origin and CSRF protection");

 // Internal KYB review is a separate operator-only state machine with no approval.
 const reviewUserEmail="synthetic-fiscal-operator-"+suffix+"@example.test";
 await db.query("INSERT INTO fiscal_users(email,password_hash,role) VALUES($1,$2,'fiscal_admin')",
  [reviewUserEmail,passwordHash()]);
 const applicant=await db.query(
  "INSERT INTO fiscal_organizations(legal_name,vat_number) VALUES($1,'222333444') RETURNING id",
  ["Synthetic KYB Applicant "+suffix]);
 const applicantId=applicant.rows[0].id;
 await db.query("INSERT INTO fiscal_memberships(organization_id,user_id,role) VALUES($1,$2,'owner')",
  [applicantId,ownerId]);
 const adminLogin=await send("/timologio/api/auth",{action:"login",email:reviewUserEmail,password});
 assert.equal(adminLogin.status,200);
 assert.equal(adminLogin.body.role,"fiscal_admin");
 const adminValues=adminLogin.cookieHeaders.map(x=>x.split(";")[0]);
 const adminSession=adminValues.find(x=>x.startsWith("km_fiscal_session="));
 const adminCsrfCookie=adminValues.find(x=>x.startsWith("km_fiscal_csrf="));
 assert.ok(adminSession&&adminCsrfCookie);
 const reviewer={cookies:adminSession+"; "+adminCsrfCookie,
  csrf:adminCsrfCookie.slice("km_fiscal_csrf=".length)};

 // MFA gate protects case pages and mutations without disrupting the primary SSO/session.
 const mfaPath="/timologio-admin/api/mfa";
 const unverifiedOperation=await send("/timologio-admin/api/accounts",{
  action:"start_review",organizationId:applicantId
 },reviewer);
 assert.equal(unverifiedOperation.status,403,"Admin mutations require a recent MFA proof");
 assert.equal(unverifiedOperation.body.error,"FISCAL_MFA_REQUIRED");
 const missingMfaPage=await fetch(base+"/timologio-admin/accounts/"+applicantId,{
  headers:{cookie:reviewer.cookies},redirect:"manual",signal:AbortSignal.timeout(12000)
 });
 assert.ok([302,303,307,308].includes(missingMfaPage.status),"Sensitive operator case redirects to MFA");
 const badMfaOrigin=await send(mfaPath,{action:"start"},{
  ...reviewer,origin:"https://untrusted.invalid"
 });
 assert.equal(badMfaOrigin.status,403);
 const noMerchantEnrollment=await send(mfaPath,{action:"start"},merchant);
 assert.equal(noMerchantEnrollment.status,401);
 const setup=await send(mfaPath,{action:"start"},reviewer);
 assert.equal(setup.status,200,"Authenticated operator may begin MFA enrollment");
 assert.match(setup.body.secret,/^[A-Z2-7]{32}$/);
 assert.ok(setup.body.uri.startsWith("otpauth://totp/"));
 const mfaCode=fiscalTotp(setup.body.secret,Math.floor(Date.now()/30000));
 const wrongFormat=await send(mfaPath,{action:"activate",code:"not-six-digits"},reviewer);
 assert.equal(wrongFormat.status,400);
 const activated=await send(mfaPath,{action:"activate",code:mfaCode},reviewer);
 assert.equal(activated.status,200,"Correct TOTP activates operator MFA");
 assert.equal(activated.body.active,true);
 const mfaCookie=activated.cookieHeaders.map(x=>x.split(";")[0]).find(x=>x.startsWith("km_fiscal_operator_mfa="));
 assert.ok(mfaCookie,"MFA step-up must set HttpOnly session cookie");
 reviewer.cookies+="; "+mfaCookie;
 const reuseCode=await send(mfaPath,{action:"step_up",code:mfaCode},reviewer);
 assert.equal(reuseCode.status,403,"Accepted TOTP codes cannot be replayed");
 const activeStatus=await fetch(base+mfaPath,{
  headers:{cookie:reviewer.cookies},signal:AbortSignal.timeout(12000)
 });
 assert.equal(activeStatus.status,200);
 const body=await activeStatus.json();
 assert.equal(body.active,true);
 assert.equal(body.steppedUp,true);
 const authorisationNow=await db.query(
  "SELECT count(*)::int AS n FROM fiscal_operator_mfa_sessions WHERE actor_kind='fiscal_admin' AND actor_ref=(SELECT id::text FROM fiscal_users WHERE email=$1)",
  [reviewUserEmail]);
 assert.equal(authorisationNow.rows[0].n,1);
 console.log("PASS: operator MFA enrollment, CSRF/Origin, replay protection, session-bound step-up");

 // Federation-specific MFA: a native Fiscal operator cookie must not step-up a
 // marketplace super-admin, and the proof may not cross primary SSO sessions.
 const federatedRef="marketplace-super-"+suffix;
 const federatedEmail="federated-"+suffix+"@example.test";
 const ssoToken=randomBytes(32).toString("hex"),ssoCsrf=randomBytes(32).toString("hex");
 await db.query(
  `INSERT INTO fiscal_superadmin_sessions(token_hash,csrf_hash,marketplace_user_id,marketplace_email,expires_at)
   VALUES($1,$2,$3,$4,now()+interval '2 hours')`,
  [digest(ssoToken),digest(ssoCsrf),federatedRef,federatedEmail]);
 const federated={cookies:"km_fiscal_superadmin_sso="+ssoToken+
  "; km_fiscal_superadmin_csrf="+ssoCsrf,csrf:ssoCsrf};
 const federationUnverified=await send("/timologio-admin/api/accounts",{
  action:"start_review",organizationId:applicantId
 },federated);
 assert.equal(federationUnverified.status,403);
 assert.equal(federationUnverified.body.error,"FISCAL_MFA_REQUIRED");
 const borrowedNativeCookie={...federated,cookies:federated.cookies+"; "+mfaCookie};
 const crossActor=await fetch(base+"/timologio-admin/accounts/"+applicantId,{
  headers:{cookie:borrowedNativeCookie.cookies},redirect:"manual",signal:AbortSignal.timeout(12000)
 });
 assert.ok([302,303,307,308].includes(crossActor.status),"Native MFA cookie cannot satisfy federated SSO");
 const federatedSetup=await send(mfaPath,{action:"start"},federated);
 assert.equal(federatedSetup.status,200,"Federated superadmin can enroll using independent FISCAL SSO");
 const federatedCode=fiscalTotp(federatedSetup.body.secret,Math.floor(Date.now()/30000));
 const federatedActivation=await send(mfaPath,{action:"activate",code:federatedCode},federated);
 assert.equal(federatedActivation.status,200);
 const federatedMfaCookie=federatedActivation.cookieHeaders.map(x=>x.split(";")[0])
  .find(x=>x.startsWith("km_fiscal_operator_mfa="));
 assert.ok(federatedMfaCookie);
 federated.cookies+="; "+federatedMfaCookie;
 const federationCase=await fetch(base+"/timologio-admin/accounts/"+applicantId,{
  headers:{cookie:federated.cookies},signal:AbortSignal.timeout(12000)
 });
 assert.equal(federationCase.status,200,"Federated SSO + matching MFA can view private case");
 const secondSsoToken=randomBytes(32).toString("hex");
 const secondSsoCsrf=randomBytes(32).toString("hex");
 await db.query(
  `INSERT INTO fiscal_superadmin_sessions(token_hash,csrf_hash,marketplace_user_id,marketplace_email,expires_at)
   VALUES($1,$2,$3,$4,now()+interval '2 hours')`,
  [digest(secondSsoToken),digest(secondSsoCsrf),federatedRef,federatedEmail]);
 const crossSession=await fetch(base+"/timologio-admin/accounts/"+applicantId,{
  headers:{cookie:"km_fiscal_superadmin_sso="+secondSsoToken+
   "; km_fiscal_superadmin_csrf="+secondSsoCsrf+"; "+federatedMfaCookie},
  redirect:"manual",signal:AbortSignal.timeout(12000)
 });
 assert.ok([302,303,307,308].includes(crossSession.status),
  "MFA proof cannot be transplanted into a new SSO session for same actor");
 console.log("PASS: federated SSO MFA actor isolation and same-user session binding");
 await runFiscalRecoveryHttpAcceptance({
  send,db,base,reviewer,merchant,federated,mfaPath,suffix,reviewUserEmail
 });

 const adminCase=await fetch(base+"/timologio-admin/accounts/"+applicantId,{
  headers:{cookie:reviewer.cookies},signal:AbortSignal.timeout(12000)
 });
 assert.equal(adminCase.status,200,"Authorized fiscal operator can access applicant KYB case");
 assert.ok((await adminCase.text()).includes("Synthetic KYB Applicant "+suffix));
 const merchantCase=await fetch(base+"/timologio-admin/accounts/"+applicantId,{
  headers:{cookie:merchant.cookies},redirect:"manual",signal:AbortSignal.timeout(12000)
 });
 assert.ok([302,303,307,308].includes(merchantCase.status),
  "Merchant must not read operator-only KYB case");
 const reviewUrl="/timologio-admin/api/accounts";
 const attemptedApprove=await send(reviewUrl,{
  action:"approve",organizationId:applicantId,note:"Improper approval bypass should fail"
 },reviewer);
 assert.equal(attemptedApprove.status,400,"Review workflow has no approval action");
 const merchantStart=await send(reviewUrl,{action:"start_review",organizationId:applicantId},merchant);
 assert.equal(merchantStart.status,401,"Merchant cannot operate KYB case");
 const badCsrf=await send(reviewUrl,{action:"start_review",organizationId:applicantId},{
  ...reviewer,csrf:"0".repeat(64)
 });
 assert.equal(badCsrf.status,403,"Operator mutation must validate CSRF");
 const badOrigin=await send(reviewUrl,{action:"start_review",organizationId:applicantId},{
  ...reviewer,origin:"https://untrusted.invalid"
 });
 assert.equal(badOrigin.status,403,"Operator mutation must reject cross-origin form");
 const startReview=await send(reviewUrl,{action:"start_review",organizationId:applicantId},reviewer);
 assert.equal(startReview.status,200);
 assert.equal(startReview.body.status,"under_review");
 assert.equal(startReview.body.issuanceEnabled,false);
 const repeatStart=await send(reviewUrl,{action:"start_review",organizationId:applicantId},reviewer);
 assert.equal(repeatStart.status,409,"Cannot restart an active case");
 const missingNote=await send(reviewUrl,{action:"record_follow_up",organizationId:applicantId},reviewer);
 assert.equal(missingNote.status,400);
 const followNote="Awaiting synthetic verified identity evidence for the test case.";
 const followUp=await send(reviewUrl,{
  action:"record_follow_up",organizationId:applicantId,note:followNote
 },reviewer);
 assert.equal(followUp.status,200);
 assert.equal(followUp.body.status,"under_review");
 assert.equal(followUp.body.notificationSent,false);
 const reviewedCase=await fetch(base+"/timologio-admin/accounts/"+applicantId,{
  headers:{cookie:reviewer.cookies},signal:AbortSignal.timeout(12000)
 });
 assert.equal(reviewedCase.status,200);
 assert.ok((await reviewedCase.text()).includes(followNote),"Internal immutable follow-up must render");

 // Operator-only source-evidence checklist. It does NOT approve or certify the merchant.
 const kybPath="/timologio-admin/api/kyb-evidence";
 const baseEvidence={
  organizationId:applicantId,checkType:"business_registration",
  outcome:"evidence_recorded",sourceKind:"gemi_public_registry",
  sourceReference:"GEMI:CI_REGISTRY_123"
 };
 const kybMerchant=await send(kybPath,baseEvidence,merchant);
 assert.equal(kybMerchant.status,401,"Merchants cannot add operator evidence");
 const kybForeignOrigin=await send(kybPath,baseEvidence,{
  ...reviewer,origin:"https://untrusted.invalid"});
 assert.equal(kybForeignOrigin.status,403,"KYB must enforce Origin");
 const kybInvalidCsrf=await send(kybPath,baseEvidence,{
  ...reviewer,csrf:"0".repeat(64)});
 assert.equal(kybInvalidCsrf.status,403,"KYB must enforce CSRF");
 const kybForgedApproval=await send(kybPath,{...baseEvidence,legalApproval:true},reviewer);
 assert.equal(kybForgedApproval.status,400,"No KYB self-approval fields");
 const kybForgedUrl=await send(kybPath,{
  ...baseEvidence,sourceReference:"https://untrusted.example/id/passport"
 },reviewer);
 assert.equal(kybForgedUrl.status,400,"Raw links and document paths are disallowed");
 const kybRecorded=await send(kybPath,baseEvidence,reviewer);
 assert.equal(kybRecorded.status,201,"Operator can add a source reference to an active case");
 assert.equal(kybRecorded.body.issuanceEnabled,false);
 assert.equal(kybRecorded.body.legalApproval,false);
 assert.equal(kybRecorded.body.notificationSent,false);
 const kybSecond=await send(kybPath,{
  organizationId:applicantId,checkType:"vat_identity",outcome:"discrepancy",
  sourceKind:"aade_public_check",sourceReference:"AADE:CI_CHECK_123"
 },reviewer);
 assert.equal(kybSecond.status,201);
 const kybCase=await fetch(base+"/timologio-admin/accounts/"+applicantId,{
  headers:{cookie:reviewer.cookies},signal:AbortSignal.timeout(12000)});
 assert.equal(kybCase.status,200);
 const kybMarkup=await kybCase.text();
 assert.ok(kybMarkup.includes("GEMI:CI_REGISTRY_123"),"Recorded KYB references must render only in operator case");
 assert.ok(kybMarkup.includes("AADE:CI_CHECK_123"),"Discrepancy must render in operator case");
 const storedKyb=await db.query(
  "SELECT check_type,outcome FROM fiscal_kyb_evidence_events WHERE organization_id=$1 ORDER BY recorded_at,id",
  [applicantId]);
 assert.equal(storedKyb.rows.length,2);
 const kybAudit=await db.query(
  "SELECT count(*)::int AS n FROM fiscal_audit_events WHERE organization_id=$1 AND action='onboarding.kyb_evidence_recorded'",
  [applicantId]);
 assert.equal(kybAudit.rows[0].n,2);
 const kybOrgStatus=await db.query("SELECT status FROM fiscal_organizations WHERE id=$1",[applicantId]);
 assert.equal(kybOrgStatus.rows[0].status,"under_review","Evidence cannot approve merchants");
 console.log("PASS: operator KYB checklist strict access, source validation, case audit, no approval");

 const reason="Synthetic company review is rejected because KYB evidence was not provided.";
 const rejected=await send(reviewUrl,{action:"reject",organizationId:applicantId,note:reason},reviewer);
 assert.equal(rejected.status,200);
 assert.equal(rejected.body.status,"rejected");
 assert.equal(rejected.body.issuanceEnabled,false);
 const kybAfterRejection=await send(kybPath,{
  organizationId:applicantId,checkType:"legal_representation",
  outcome:"requested",sourceKind:"none",sourceReference:null
 },reviewer);
 assert.equal(kybAfterRejection.status,409,"Rejected cases cannot accept new evidence");
 const rejectAgain=await send(reviewUrl,{action:"reject",organizationId:applicantId,note:reason},reviewer);
 assert.equal(rejectAgain.status,409,"Rejected cases cannot be rejected twice");
 const storedCase=await db.query("SELECT status FROM fiscal_organizations WHERE id=$1",[applicantId]);
 assert.equal(storedCase.rows[0].status,"rejected");
 const caseAudits=await db.query(
  "SELECT action,details FROM fiscal_audit_events WHERE organization_id=$1 AND action IN ('onboarding.review_started','onboarding.internal_follow_up_recorded','onboarding.rejected') ORDER BY id",
  [applicantId]);
 assert.deepEqual(caseAudits.rows.map(x=>x.action),[
  "onboarding.review_started","onboarding.internal_follow_up_recorded","onboarding.rejected"
 ]);
 assert.equal(caseAudits.rows[1].details.note,followNote);
 assert.equal(caseAudits.rows[1].details.notificationSent,false);
 console.log("PASS: authenticated KYB operator case, CSRF, immutable follow-up, rejection, no approval or notification");

 // FISCAL invitation-only merchant access, with public registration still disabled.
 const invitationEndpoint="/timologio-admin/api/invitations";
 const redeemEndpoint="/timologio/api/invitations/redeem";
 const inviteBody={action:"issue",email:"invited-"+suffix+"@example.test",
  legalName:"Invited Synthetic Merchant "+suffix,vatNumber:"303404505"};
 const forbiddenInvite=await send(invitationEndpoint,inviteBody,merchant);
 assert.equal(forbiddenInvite.status,401,"Ordinary merchant cannot issue invitations");
 const forgedInvite=await send(invitationEndpoint,{...inviteBody,approved:true},reviewer);
 assert.equal(forgedInvite.status,400,"Unexpected invite/approval fields are refused");
 const invited=await send(invitationEndpoint,inviteBody,reviewer);
 assert.equal(invited.status,201,"Authorized operator issues one-time invitation");
 assert.ok(invited.body.url.startsWith("https://fiscal.kontamou.site/timologio/invite#"));
 const inviteToken=invited.body.url.split("#")[1];
 assert.match(inviteToken,/^[a-f0-9]{64}$/);
 const inviteHash=digest(inviteToken);
 const savedHash=await db.query(
  "SELECT token_hash,status FROM fiscal_merchant_invitations WHERE id=$1",[invited.body.id]);
 assert.equal(savedHash.rows[0].token_hash,inviteHash,"Raw code must never be stored");
 const duplicateInvite=await send(invitationEndpoint,inviteBody,reviewer);
 assert.equal(duplicateInvite.status,409,"Only one pending invitation per email/AFM");
 const badToken=await send(redeemEndpoint,{token:"0".repeat(64),password});
 assert.equal(badToken.status,403);
 const wrongOriginRedeem=await send(redeemEndpoint,{token:inviteToken,password},{
  origin:"https://untrusted.invalid"
 });
 assert.equal(wrongOriginRedeem.status,403,"Invitation claim must check browser Origin");
 const redeemed=await send(redeemEndpoint,{token:inviteToken,password});
 assert.equal(redeemed.status,201,"Valid, single-use link creates a restricted merchant");
 assert.equal(redeemed.body.pendingReview,true);
 assert.equal(redeemed.body.emailVerified,false);
 assert.equal(redeemed.body.identityVerified,false);
 assert.equal(redeemed.body.issuanceEnabled,false);
 const tokenReplay=await send(redeemEndpoint,{token:inviteToken,password});
 assert.equal(tokenReplay.status,403,"Redeemed invitation cannot be reused");
 const ownerLogin=await login("invited-"+suffix+"@example.test");
 const applications=await db.query(
  `SELECT o.status,m.role FROM fiscal_organizations o
   JOIN fiscal_memberships m ON m.organization_id=o.id
   JOIN fiscal_users u ON u.id=m.user_id
   WHERE u.email=$1`,["invited-"+suffix+"@example.test"]);
 assert.deepEqual(applications.rows,[{status:"pending_review",role:"owner"}]);
 const pendingOrg=await db.query(
  "SELECT o.id FROM fiscal_organizations o JOIN fiscal_memberships m ON m.organization_id=o.id JOIN fiscal_users u ON u.id=m.user_id WHERE u.email=$1",
  ["invited-"+suffix+"@example.test"]);
 const blockedDraft=await send("/timologio/api/console/drafts",{
  organizationId:pendingOrg.rows[0].id,lane:"b2c",externalId:"PENDING-"+suffix,reference:"Must fail",grossMinor:1000
 },ownerLogin);
 assert.equal(blockedDraft.status,403,"Unverified invite cannot create invoice drafts");
 const revokeBody={action:"issue",email:"revoked-"+suffix+"@example.test",
  legalName:"Second Invited Merchant "+suffix,vatNumber:"606707808"};
 const toRevoke=await send(invitationEndpoint,revokeBody,reviewer);
 assert.equal(toRevoke.status,201);
 const revoke=await send(invitationEndpoint,{action:"revoke",id:toRevoke.body.id},reviewer);
 assert.equal(revoke.status,200,"Revoke response: "+JSON.stringify(revoke.body));assert.equal(revoke.body.revoked,true);
 const rejectRevoked=await send(redeemEndpoint,{
  token:toRevoke.body.url.split("#")[1],password
 });
 assert.equal(rejectRevoked.status,403);
 const inviteAudit=await db.query(
  "SELECT count(*)::int AS n FROM fiscal_audit_events WHERE action='onboarding.invitation_redeemed' AND organization_id=$1",
  [pendingOrg.rows[0].id]);
 assert.equal(inviteAudit.rows[0].n,1);
 console.log("PASS: invitation creation, fragment-only token, pending merchant, replay, origin and revocation");

 // Email proof requires authenticated merchant + CSRF, and never approves KYB.
 const verifyPath="/timologio/api/email-verification";
 const anonymousVerify=await send(verifyPath,{action:"request"});
 assert.equal(anonymousVerify.status,401,"Anonymous cannot send email verification");
 const wrongMerchantRequest=await send(verifyPath,{action:"request"},reviewer);
 assert.equal(wrongMerchantRequest.status,401,"Fiscal operator cannot impersonate merchant verification");
 const senderMissing=await send(verifyPath,{action:"request"},ownerLogin);
 assert.equal(senderMissing.status,503,"Provider config must fail closed; no email or token disclosure");
 assert.equal(senderMissing.body.error,"EMAIL_DELIVERY_NOT_CONFIGURED");
 const emailToken=randomBytes(32).toString("hex");
 const emailProof=await db.query(
  `INSERT INTO fiscal_email_verification_challenges(user_id,token_hash,expires_at)
   SELECT u.id,$2,now()+interval '20 minutes' FROM fiscal_users u WHERE email=$1
   RETURNING id`,["invited-"+suffix+"@example.test",digest(emailToken)]);
 assert.equal(emailProof.rows.length,1);
 const otherProof=await send(verifyPath,{action:"confirm",token:emailToken},stranger);
 assert.equal(otherProof.status,403,"Other tenant cannot consume an email proof");
 const forgedOrigin=await send(verifyPath,{action:"confirm",token:emailToken},
  {...ownerLogin,origin:"https://untrusted.invalid"});
 assert.equal(forgedOrigin.status,403,"Email proof requires same Origin");
 const forgedCsrf=await send(verifyPath,{action:"confirm",token:emailToken},
  {...ownerLogin,csrf:"f".repeat(64)});
 assert.equal(forgedCsrf.status,403,"Email proof requires merchant CSRF");
 const csrfBoot=await fetch(base+verifyPath,{headers:{cookie:ownerLogin.cookies},signal:AbortSignal.timeout(12000)});
 assert.equal(csrfBoot.status,200);
 assert.equal((await csrfBoot.json()).csrfToken,ownerLogin.csrf);
 const proof=await send(verifyPath,{action:"confirm",token:emailToken},ownerLogin);
 assert.equal(proof.status,200,"Owner can confirm only own valid 20-minute proof");
 assert.equal(proof.body.emailVerified,true);
 assert.equal(proof.body.identityVerified,false);
 assert.equal(proof.body.issuanceEnabled,false);
 const replayProof=await send(verifyPath,{action:"confirm",token:emailToken},ownerLogin);
 assert.equal(replayProof.status,403,"Email proof is single-use");
 const emailSaved=await db.query(
  "SELECT email_verified_at FROM fiscal_users WHERE email=$1",["invited-"+suffix+"@example.test"]);
 assert.ok(emailSaved.rows[0].email_verified_at instanceof Date);
 const noOrgPromotion=await db.query(
  `SELECT o.status FROM fiscal_organizations o JOIN fiscal_memberships m
   ON m.organization_id=o.id JOIN fiscal_users u ON u.id=m.user_id WHERE u.email=$1`,
  ["invited-"+suffix+"@example.test"]);
 assert.equal(noOrgPromotion.rows[0].status,"pending_review");
 const verifiedAudits=await db.query(
  "SELECT count(*)::int AS n FROM fiscal_audit_events WHERE actor_ref=(SELECT id::text FROM fiscal_users WHERE email=$1) AND action='email.ownership_proved'",
  ["invited-"+suffix+"@example.test"]);
 assert.equal(verifiedAudits.rows[0].n,1,"Confirmation must record exactly one immutable audit event");
 console.log("PASS: email proof session, owner binding, CSRF, strict Origin, replay and no KYB promotion");



 const item={description:"Synthetic E2E service",quantityMilli:1000,unitPriceMinor:10000,vatRateBps:2400,discountBps:0};
 const calc=await send("/timologio/api/console/preview",{lane:"b2b",items:[item]},merchant);
 assert.equal(calc.status,200);
 assert.equal(calc.body.preview.totals.grossMinor,12400);
 assert.equal(calc.body.preview.issuanceEnabled,false);
 assert.equal(calc.body.preview.legalTaxClassification,false);


 const journalEntries=[
  {account:"cash_test",side:"debit",amountMinor:12500},
  {account:"sales_test",side:"credit",amountMinor:12500}
 ];
 const unauthJournal=await send("/timologio/api/console/journal-preview",{entries:journalEntries});
 assert.equal(unauthJournal.status,401,"Journal preview must reject anonymous requests");
 const csrfJournal=await send("/timologio/api/console/journal-preview",{entries:journalEntries},{
  ...merchant,csrf:"f".repeat(64)
 });
 assert.equal(csrfJournal.status,403,"Journal preview must enforce CSRF");
 const validJournal=await send("/timologio/api/console/journal-preview",{entries:journalEntries},merchant);
 assert.equal(validJournal.status,200,"Balanced journal must preview");
 assert.equal(validJournal.body.preview.totalDebitMinor,12500);
 assert.equal(validJournal.body.preview.totalCreditMinor,12500);
 assert.equal(validJournal.body.preview.postingEnabled,false);
 assert.equal(validJournal.body.preview.certifiedBookkeeping,false);
 const unbalancedJournal=await send("/timologio/api/console/journal-preview",{
  entries:[journalEntries[0],{...journalEntries[1],amountMinor:12499}]
 },merchant);
 assert.equal(unbalancedJournal.status,400,"Unbalanced journal must fail closed");
 assert.equal(unbalancedJournal.body.error,"JOURNAL_NOT_BALANCED");
 console.log("PASS: sandbox journal preview, balancing, no posting, auth and CSRF");


 const savedJournalBody={
  organizationId:orgId,externalId:"CI-JOURNAL-"+suffix,entries:journalEntries
 };
 const savedJournal=await send("/timologio/api/console/journal",savedJournalBody,merchant);
 assert.equal(savedJournal.status,201,"A balanced synthetic journal snapshot must save");
 assert.equal(savedJournal.body.status,"saved_test");
 assert.equal(savedJournal.body.accountingPosted,false);
 assert.equal(savedJournal.body.fiscalIssuanceEnabled,false);
 const journalReplay=await send("/timologio/api/console/journal",savedJournalBody,merchant);
 assert.equal(journalReplay.status,200);
 assert.equal(journalReplay.body.created,false);
 assert.equal(journalReplay.body.id,savedJournal.body.id);
 const journalConflict=await send("/timologio/api/console/journal",{
  ...savedJournalBody,entries:[
   {...journalEntries[0],amountMinor:11000},
   {...journalEntries[1],amountMinor:11000}
  ]
 },merchant);
 assert.equal(journalConflict.status,409,"A replay with different balanced amounts must conflict");
 const journalUnauthorized=await send("/timologio/api/console/journal",{
  ...savedJournalBody,externalId:"CI-JRN-UNAUTH-"+suffix
 },stranger);
 assert.equal(journalUnauthorized.status,403,"Other tenant must not save into this organization");
 const journalUnexpected=await send("/timologio/api/console/journal",{
  ...savedJournalBody,externalId:"CI-JRN-EXTRA-"+suffix,posted:true
 },merchant);
 assert.equal(journalUnexpected.status,400,"Official posting metadata must be rejected");
 const journalPage=await fetch(base+"/timologio/journal?organizationId="+orgId,{
  headers:{cookie:merchant.cookies},signal:AbortSignal.timeout(12000)
 });
 assert.equal(journalPage.status,200);
 const journalMarkup=await journalPage.text();
 assert.ok(journalMarkup.includes(savedJournalBody.externalId),"Authorized journal history must render");
 const foreignJournalPage=await fetch(base+"/timologio/journal?organizationId="+orgId,{
  headers:{cookie:stranger.cookies},signal:AbortSignal.timeout(12000)
 });
 assert.equal(foreignJournalPage.status,200);
 assert.ok(!(await foreignJournalPage.text()).includes(savedJournalBody.externalId),
  "Unrelated merchant must never see another organization's journal");
 const persistedJournal=await db.query(
  `SELECT j.status,j.entry_count,count(l.*)::int AS lines
   FROM fiscal_sandbox_journals j JOIN fiscal_sandbox_journal_lines l
   ON l.organization_id=j.organization_id AND l.journal_id=j.id
   WHERE j.id=$1 AND j.organization_id=$2 GROUP BY j.id`,
  [savedJournal.body.id,orgId]
 );
 assert.equal(persistedJournal.rows[0].status,"saved_test");
 assert.equal(persistedJournal.rows[0].lines,2);
 const journalAudit=await db.query(
  `SELECT count(*)::int AS n FROM fiscal_audit_events
   WHERE organization_id=$1 AND action='journal_sandbox.saved'
    AND details->>'journalId'=$2`,[orgId,savedJournal.body.id]
 );
 assert.equal(journalAudit.rows[0].n,1,"Retries must not duplicate journal audit");
 console.log("PASS: persistent sandbox journal, authorization, non-posting flags and single audit");

 const party=await send("/timologio/api/console/counterparties",{
  organizationId:orgId,kind:"business",legalName:"Synthetic Trading "+suffix,vatNumber:"333222111"
 },merchant);
 assert.equal(party.status,201,"Merchant test counterparty creation");
 assert.equal(party.body.verificationStatus,"unverified");
 const replayParty=await send("/timologio/api/console/counterparties",{
  organizationId:orgId,kind:"business",legalName:"Synthetic Trading "+suffix,vatNumber:"333222111"
 },merchant);
 assert.equal(replayParty.status,200);
 assert.equal(replayParty.body.id,party.body.id);
 const foreignParty=await send("/timologio/api/console/counterparties",{
  organizationId:orgId,kind:"business",legalName:"Unauthorized Entity",vatNumber:"999888777"
 },stranger);
 assert.equal(foreignParty.status,403,"Cross-tenant merchant cannot create test counterparties");

 const draftBody={
  organizationId:orgId,lane:"b2b",externalId:"CI-E2E-"+suffix,
  reference:"E2E "+suffix,grossMinor:12400,items:[item],
  counterpartyId:party.body.id
 };
 const draft=await send("/timologio/api/console/drafts",draftBody,merchant);
 assert.equal(draft.status,201,"Actual console creates test draft");
 assert.equal(draft.body.status,"draft");
 assert.equal(draft.body.fiscalIssuanceEnabled,false);
 assert.match(draft.body.id,/^[0-9a-f-]{36}$/i);
 const replay=await send("/timologio/api/console/drafts",draftBody,merchant);
 assert.equal(replay.status,200,"Idempotent replay must not create another draft");
 assert.equal(replay.body.created,false);
 assert.equal(replay.body.id,draft.body.id);
 const mismatch=await send("/timologio/api/console/drafts",{
  ...draftBody,externalId:"CI-E2E-MISMATCH-"+suffix,grossMinor:12399
 },merchant);
 assert.equal(mismatch.status,422);
 assert.equal(mismatch.body.error,"PREVIEW_TOTAL_MISMATCH");
 const wrongTenantDraft=await send("/timologio/api/console/drafts",{
  ...draftBody,externalId:"CI-E2E-UNAUTH-"+suffix
 },stranger);
 assert.equal(wrongTenantDraft.status,403);
 const ownButForeignParty=await send("/timologio/api/console/drafts",{
  ...draftBody,organizationId:otherId,externalId:"CI-E2E-FOREIGN-"+suffix
 },stranger);
 assert.equal(ownButForeignParty.status,404,"A valid other-tenant counterparty must remain inaccessible");
 console.log("PASS: simulated calculations, counterparty isolation, draft replay and mismatch rejection");

 const response=await fetch(
  base+"/timologio/drafts/"+draft.body.id+"?organizationId="+orgId,
  {headers:{cookie:merchant.cookies},signal:AbortSignal.timeout(12000)}
 );
 assert.equal(response.status,200,"Authenticated merchant can view its test draft");
 const html=await response.text();
 assert.ok(html.includes("Synthetic E2E service"),"Itemized draft must render");
 assert.ok(html.includes("Synthetic Trading "+suffix),"Frozen counterparty snapshot must render");
 assert.ok(html.includes("Προέλεγχος"),"Read-only non-fiscal preflight must render");
 assert.ok(html.includes("Δεν είναι φορολογικό παραστατικό"),"Strong non-fiscal warning");
 const denied=await fetch(
  base+"/timologio/drafts/"+draft.body.id+"?organizationId="+orgId,
  {headers:{cookie:stranger.cookies},signal:AbortSignal.timeout(12000)}
 );
 assert.equal(denied.status,404,"Unrelated merchant must not view draft");
 console.log("PASS: real HTML detail route renders immutable lines; cross-tenant access returns 404");

 const exportPath="/timologio/api/console/drafts/export?organizationId="+orgId+"&lane=b2b&source=console";
 const exported=await fetch(base+exportPath,{
  headers:{cookie:merchant.cookies},redirect:"manual",signal:AbortSignal.timeout(12000)
 });
 assert.equal(exported.status,200,"Authenticated merchant can export saved test drafts");
 assert.match(exported.headers.get("content-type")??"",/^text\/csv/);
 assert.match(exported.headers.get("cache-control")??"",/no-store/);
 assert.match(exported.headers.get("content-disposition")??"",/attachment;/);
 const downloadedBytes=Buffer.from(await exported.arrayBuffer());
 assert.ok(downloadedBytes.subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf])),
  "Greek spreadsheet UTF-8 BOM must exist in actual downloadable bytes");
 const downloaded=downloadedBytes.toString("utf8");
 assert.ok(downloaded.includes(draft.body.id),"Export must include actual saved draft");
 assert.ok(downloaded.includes(draftBody.reference),"Export must contain saved reference");
 assert.ok(downloaded.includes("NON_FISCAL_TEST_DRAFT"));
 assert.ok(downloaded.includes("NOT_ISSUED_NOT_TRANSMITTED"));
 assert.ok(!downloaded.includes("444555666"),"No unrelated tenant content");
 const foreignExport=await fetch(base+exportPath,{
  headers:{cookie:stranger.cookies},redirect:"manual",signal:AbortSignal.timeout(12000)
 });
 assert.equal(foreignExport.status,404,"Cross-tenant export invisible");
 const anonymousExport=await fetch(base+exportPath,{
  redirect:"manual",signal:AbortSignal.timeout(12000)
 });
 assert.equal(anonymousExport.status,401,"Anonymous export blocked");
 const malformedExport=await fetch(base+exportPath+"&source=b2g",{
  headers:{cookie:merchant.cookies},redirect:"manual",signal:AbortSignal.timeout(12000)
 });
 assert.equal(malformedExport.status,400,"Duplicate export filters blocked");
 const excludedExport=await fetch(base+
  "/timologio/api/console/drafts/export?organizationId="+orgId+"&lane=b2g",{
   headers:{cookie:merchant.cookies},signal:AbortSignal.timeout(12000)
 });
 assert.equal(excludedExport.status,200);
 assert.ok(!(await excludedExport.text()).includes(draft.body.id),
  "Export must honor selected lane filters");
 console.log("PASS: M44 real saved-draft CSV export, filter and ownership isolation");


 const persisted=await db.query(
  `SELECT d.id,d.status,d.payload->'counterparty' AS counterparty,
    (SELECT count(*)::int FROM fiscal_document_intake_lines l
     WHERE l.organization_id=d.organization_id AND l.draft_id=d.id) AS line_count
   FROM fiscal_document_intakes d WHERE d.id=$1 AND d.organization_id=$2`,
  [draft.body.id,orgId]
 );
 assert.equal(persisted.rows.length,1);
 assert.equal(persisted.rows[0].status,"draft");
 assert.equal(persisted.rows[0].line_count,1);
 assert.equal(persisted.rows[0].counterparty.verificationStatus,"unverified");
 const audits=await db.query(
  "SELECT count(*)::int AS total FROM fiscal_audit_events WHERE organization_id=$1 AND action='draft.console_created' AND details->>'draftId'=$2",
  [orgId,draft.body.id]
 );
 assert.equal(audits.rows[0].total,1,"Idempotent retry must not duplicate audit trail");
 const issued=await db.query(
  "SELECT count(*)::int AS total FROM fiscal_document_intakes WHERE organization_id=$1 AND status<>'draft'",
  [orgId]
 );
 assert.equal(issued.rows[0].total,0,"No fiscal issuance on any test path");
 console.log("PASS: database persistence, immutable line link, single audit and issuance OFF");

 const logout=await send("/timologio/api/auth",{action:"logout"},merchant);
 assert.equal(logout.status,200);
 assert.equal(logout.body.ok,true);
 const afterLogout=await send("/timologio/api/console/preview",{lane:"b2b",items:[item]},merchant);
 assert.equal(afterLogout.status,401,"Revoked session must not access merchant API");
 console.log("FISCAL LIVE HTTP E2E PASSED: independent login, draft, immutable sandbox journals, counterparty, CSRF, isolation, no issuance");
}finally{
 if(server){
  server.kill("SIGTERM");
  await Promise.race([
   new Promise(resolve=>server.once("exit",resolve)),
   sleep(2500)
  ]);
  if(server.exitCode===null)server.kill("SIGKILL");
 }
 await db.end().catch(()=>undefined);
}
