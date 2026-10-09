// Integration regression for the separate Fiscal database; no external AADE traffic.
import assert from "node:assert/strict";
import pg from "pg";
const url=process.env.FISCAL_DATABASE_URL;
if(!url)throw new Error("FISCAL_DATABASE_URL required");
const db=new pg.Client({connectionString:url,connectionTimeoutMillis:5000});
await db.connect();
try{
 await db.query("BEGIN");
 const user=await db.query("INSERT INTO fiscal_users(email,password_hash) VALUES($1,$2) RETURNING id",["fiscal-smoke@example.test","not-a-login-secret"]);
 const merchant=await db.query("INSERT INTO fiscal_organizations(legal_name,vat_number) VALUES($1,$2) RETURNING id",["CI Fiscal Merchant","123456789"]);
 const uid=user.rows[0].id,oid=merchant.rows[0].id;
 await db.query("INSERT INTO fiscal_memberships(organization_id,user_id,role) VALUES($1,$2,'owner')",[oid,uid]);
 const state=await db.query("SELECT status FROM fiscal_organizations WHERE id=$1",[oid]);
 assert.equal(state.rows[0].status,"pending_review");
 const draft=await db.query("INSERT INTO fiscal_document_intakes(organization_id,lane,source,status) VALUES($1,'b2b','console','draft') RETURNING id",[oid]);
 assert.ok(draft.rows[0].id);
 await db.query("SAVEPOINT reject_issuance");
 await assert.rejects(()=>db.query("UPDATE fiscal_document_intakes SET status='issued' WHERE id=$1",[draft.rows[0].id]));
 await db.query("ROLLBACK TO SAVEPOINT reject_issuance");
 const event=await db.query("INSERT INTO fiscal_audit_events(actor_kind,actor_ref,organization_id,action) VALUES('system','ci',$1,'smoke.started') RETURNING id",[oid]);
 await db.query("SAVEPOINT reject_audit_edit");
 await assert.rejects(()=>db.query("UPDATE fiscal_audit_events SET action='tampered' WHERE id=$1",[event.rows[0].id]));
 await db.query("ROLLBACK TO SAVEPOINT reject_audit_edit");
 await db.query("ROLLBACK");
 console.log("FISCAL DATABASE SMOKE PASSED: pending onboarding, draft-only, immutable audit");
}catch(error){await db.query("ROLLBACK").catch(()=>{});throw error;}
finally{await db.end();}
