/**
 * Exact-query KYB privacy/tenant isolation acceptance against disposable CI DB.
 * Never run against production, staging, marketplace or persistent databases.
 */
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import pg from "pg";
import {FISCAL_MERCHANT_KYB_PROGRESS_SQL} from "../apps/web/src/lib/fiscal-merchant-kyb-query.ts";
import {summarizeFiscalMerchantKybProgress} from "../apps/web/src/lib/fiscal-merchant-kyb-progress.ts";
import {FISCAL_KYB_REVIEW_QUEUE_SQL,summarizeFiscalKybReviewPage,parseFiscalKybReviewCursor} from "../apps/web/src/lib/fiscal-kyb-review-queue.ts";

const connectionString=process.env.FISCAL_DATABASE_URL??"";
let parsed;
try{parsed=new URL(connectionString);}catch{throw new Error("CI_EPHEMERAL_FISCAL_DB_ONLY");}
if(process.env.CI!=="true" ||
   !["localhost","127.0.0.1","::1"].includes(parsed.hostname) ||
   parsed.pathname!=="/fiscal_ci" ||
   process.env.DATABASE_URL===connectionString)
 throw new Error("CI_EPHEMERAL_FISCAL_DB_ONLY");

const db=new pg.Client({connectionString,connectionTimeoutMillis:5000});
await db.connect();
try{
 await db.query("BEGIN");
 const suffix=randomBytes(5).toString("hex");
 const people=await db.query(
  `INSERT INTO fiscal_users(email,password_hash)
   VALUES ($1,'CI disabled'),($2,'CI disabled'),($3,'CI disabled')
   RETURNING id`,
  ["owner-"+suffix+"@example.test","other-"+suffix+"@example.test","viewer-"+suffix+"@example.test"]
 );
 const [owner,other,viewer]=people.rows.map(x=>x.id);
 const orgs=await db.query(
  `INSERT INTO fiscal_organizations(legal_name,vat_number)
   VALUES($1,'111222333'),($2,'444555666') RETURNING id`,
  ["Synthetic KYB A "+suffix,"Synthetic KYB B "+suffix]
 );
 const [a,b]=orgs.rows.map(x=>x.id);
 await db.query(
  `INSERT INTO fiscal_memberships(organization_id,user_id,role)
   VALUES($1,$2,'owner'),($1,$3,'viewer'),($4,$5,'accountant')`,
  [a,owner,viewer,b,other]
 );
 // Insert an earlier record that MUST lose to the latest discrepancy.
 await db.query(
  `INSERT INTO fiscal_kyb_evidence_events
   (organization_id,check_type,outcome,source_kind,source_reference,
    recorded_by_kind,recorded_by_ref,recorded_at)
   VALUES($1,'vat_identity','evidence_recorded','aade_public_check','CI-OLD-SECRET',
    'fiscal_admin','ci-operator-123',now()-interval '2 days')`,[a]
 );
 await db.query(
  `INSERT INTO fiscal_kyb_evidence_events
   (organization_id,check_type,outcome,source_kind,source_reference,
    recorded_by_kind,recorded_by_ref)
   VALUES($1,'vat_identity','discrepancy','manual_offline_review','CI-NEW-SECRET',
    'fiscal_admin','ci-operator-123'),
         ($2,'business_registration','evidence_recorded','gemi_public_registry','CI-OTHER-SECRET',
    'fiscal_admin','ci-operator-123')`,[a,b]
 );
 const mine=await db.query(FISCAL_MERCHANT_KYB_PROGRESS_SQL,[a,owner]);
 assert.equal(mine.rowCount,1);
 assert.deepEqual(Object.keys(mine.rows[0]).sort(),["check_type","outcome"]);
 assert.equal(mine.rows[0].check_type,"vat_identity");
 assert.equal(mine.rows[0].outcome,"discrepancy");
 const summary=summarizeFiscalMerchantKybProgress(mine.rows);
 assert.equal(summary.recordedCount,0);
 assert.equal(summary.followUpCount,1);
 assert.equal(summary.legalApproval,false);
 assert.equal(summary.fiscalIssuanceEnabled,false);
 assert.ok(!JSON.stringify(mine.rows).includes("SECRET"));
 assert.ok(!JSON.stringify(summary).includes("SECRET"));

 const forbidden=[
  [a,other], // separate company
  [a,viewer],// explicit least-privilege role
  [b,owner], // second company
 ];
 for(const [orgId,userId] of forbidden){
  const scoped=await db.query(FISCAL_MERCHANT_KYB_PROGRESS_SQL,[orgId,userId]);
  assert.equal(scoped.rowCount,0,"Other tenants/viewers must not see any KYB rows");
 }
 const theirOwn=await db.query(FISCAL_MERCHANT_KYB_PROGRESS_SQL,[b,other]);
 assert.equal(theirOwn.rowCount,1);
 assert.equal(theirOwn.rows[0].check_type,"business_registration");
 assert.equal(theirOwn.rows[0].outcome,"evidence_recorded");

 // An authorized company with no evidence has one left-join null marker:
 // the runtime converts it to the seven not-recorded check types.
 await db.query(
  "INSERT INTO fiscal_organizations(legal_name,vat_number) VALUES($1,'777888999') RETURNING id",
  ["Synthetic KYB Empty "+suffix]
 ).then(async fresh=>{
  await db.query("INSERT INTO fiscal_memberships(organization_id,user_id,role) VALUES($1,$2,'accountant')",[fresh.rows[0].id,owner]);
  const empty=await db.query(FISCAL_MERCHANT_KYB_PROGRESS_SQL,[fresh.rows[0].id,owner]);
  assert.equal(empty.rowCount,1);
  assert.equal(empty.rows[0].check_type,null);
  const out=summarizeFiscalMerchantKybProgress(empty.rows.filter(x=>x.check_type!==null));
  assert.equal(out.outstandingCount,7);
 });
 // Force a second page without relying on persistent production or staging data.
 await db.query(`
  INSERT INTO fiscal_organizations(legal_name,vat_number,status,created_at)
  SELECT 'CI Pagination '||$1||'-'||n, '8'||lpad(n::text,8,'0'),
         'pending_review',now()+n*interval '1 second'
    FROM generate_series(1,42) AS n
 `,[suffix]);
 const triage=await db.query(FISCAL_KYB_REVIEW_QUEUE_SQL,[null,null]);
 assert.ok(triage.rowCount>=40,"Synthetic open KYB cases should be present");
 assert.ok(triage.rows.every(item=>
  Object.keys(item).sort().join(",")==="check_type,created_at_key,id,legal_name,outcome,status"));
 const first=summarizeFiscalKybReviewPage(triage.rows);
 assert.equal(first.cases.length,40);
 assert.equal(first.hasNext,true);
 const cursor=parseFiscalKybReviewCursor(first.nextCursor);
 assert.ok(cursor);
 const next=await db.query(FISCAL_KYB_REVIEW_QUEUE_SQL,[cursor.createdAt,cursor.id]);
 const second=summarizeFiscalKybReviewPage(next.rows);
 assert.equal(second.hasNext,false);
 assert.ok(second.cases.length>=5);
 const firstIds=new Set(first.cases.map(c=>c.id));
 assert.ok(second.cases.every(c=>!firstIds.has(c.id)),"No keyset boundary duplicates");
 const flagged=first.cases.find(item=>item.id===a);
 assert.ok(flagged,"Synthetic discrepancy case missing");
 assert.equal(flagged.priority,"follow_up");
 assert.equal(flagged.progress.legalApproval,false);
 assert.equal(flagged.progress.fiscalIssuanceEnabled,false);
 assert.ok(!JSON.stringify(first).includes("SECRET"));
 assert.ok(!JSON.stringify(second).includes("SECRET"));
 assert.ok(!JSON.stringify(triage.rows).includes("SECRET"));
  console.log("FISCAL MERCHANT KYB TENANT ISOLATION PASSED (disposable CI, redacted summaries only)");
}finally{
 await db.query("ROLLBACK").catch(()=>undefined);
 await db.end();
}
