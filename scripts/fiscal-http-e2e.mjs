/**
 * HTTP acceptance tests against the ACTUAL independent Next.js runtime.
 * Only runs in GitHub CI with a disposable isolated fiscal_ci PostgreSQL database.
 * All accounts, tax IDs and products are synthetic. Never use in live staging.
 */
import assert from "node:assert/strict";
import {createServer} from "node:net";
import {spawn} from "node:child_process";
import {createHash,randomBytes,scryptSync} from "node:crypto";
import pg from "pg";

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
   FISCAL_MARKETPLACE_DRAFT_SYNC_ENABLED:"false",FISCAL_ISSUANCE_ENABLED:"false"
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
 const reason="Synthetic company review is rejected because KYB evidence was not provided.";
 const rejected=await send(reviewUrl,{action:"reject",organizationId:applicantId,note:reason},reviewer);
 assert.equal(rejected.status,200);
 assert.equal(rejected.body.status,"rejected");
 assert.equal(rejected.body.issuanceEnabled,false);
 const rejectAgain=await send(reviewUrl,{action:"reject",organizationId:applicantId,note:reason},reviewer);
 assert.equal(rejectAgain.status,409,"Rejected cases cannot be rejected twice");
 const storedCase=await db.query("SELECT status FROM fiscal_organizations WHERE id=$1",[applicantId]);
 assert.equal(storedCase.rows[0].status,"rejected");
 const caseAudits=await db.query(
  "SELECT action,details FROM fiscal_audit_events WHERE organization_id=$1 AND action LIKE 'onboarding.%' ORDER BY id",
  [applicantId]);
 assert.deepEqual(caseAudits.rows.map(x=>x.action),[
  "onboarding.review_started","onboarding.internal_follow_up_recorded","onboarding.rejected"
 ]);
 assert.equal(caseAudits.rows[1].details.note,followNote);
 assert.equal(caseAudits.rows[1].details.notificationSent,false);
 console.log("PASS: authenticated KYB operator case, CSRF, immutable follow-up, rejection, no approval or notification");

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
