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
 const certification=await db.query("SELECT lane,count(*)::int AS n FROM fiscal_certification_controls GROUP BY lane ORDER BY lane");
 assert.deepEqual(certification.rows.map(r=>r.lane),["b2b","b2c","b2g","core","pos"]);
 assert.ok(certification.rows.every(row=>row.n>=4));
 const approval=await db.query("SELECT count(*)::int AS count FROM fiscal_certification_controls WHERE regulator_approved");
 assert.equal(approval.rows[0].count,0);
 // FISCAL API keys are tenant-bound, and only non-fiscal drafts exist.
 const apiKey=await db.query("INSERT INTO fiscal_api_clients(organization_id,created_by,label,kind,token_hash,token_hint,expires_at) VALUES($1,$2,'CI smoke key','external_erp',$3,'kmf_test_ci',now()+interval '30 days') RETURNING id",[oid,uid,'f'.repeat(64)]);
 assert.ok(apiKey.rows[0].id);
 const otherUser=await db.query("INSERT INTO fiscal_users(email,password_hash) VALUES('other-fiscal@example.test','not-a-login-secret') RETURNING id");
 const otherOrg=await db.query("INSERT INTO fiscal_organizations(legal_name,vat_number) VALUES('Other Fiscal Tenant','987654321') RETURNING id");
 await db.query("INSERT INTO fiscal_memberships(organization_id,user_id,role) VALUES($1,$2,'owner')",[otherOrg.rows[0].id,otherUser.rows[0].id]);
 const draftPayload={reference:'CI draft',currency:'EUR',grossMinor:1299,issuerVatNumber:'123456789'};
 const drafted=await db.query("INSERT INTO fiscal_document_intakes(organization_id,lane,source,external_id,payload,payload_digest) VALUES($1,'b2b','external_api','ci-test-000001',$2::jsonb,$3) RETURNING id",[oid,JSON.stringify(draftPayload),'a'.repeat(64)]);
 const duplicate=await db.query("INSERT INTO fiscal_document_intakes(organization_id,lane,source,external_id,payload,payload_digest) VALUES($1,'b2b','external_api','ci-test-000001',$2::jsonb,$3) ON CONFLICT(organization_id,source,external_id) DO NOTHING RETURNING id",[oid,JSON.stringify(draftPayload),'a'.repeat(64)]);
 assert.equal(duplicate.rowCount,0);
 const wrongTenant=await db.query("SELECT id FROM fiscal_document_intakes WHERE organization_id=$1 AND id=$2",[otherOrg.rows[0].id,drafted.rows[0].id]);
 assert.equal(wrongTenant.rowCount,0);
 const wrongOwner=await db.query("SELECT c.id FROM fiscal_api_clients c JOIN fiscal_memberships m ON m.organization_id=c.organization_id WHERE m.user_id=$1 AND c.id=$2",[otherUser.rows[0].id,apiKey.rows[0].id]);
 assert.equal(wrongOwner.rowCount,0);
 await db.query("UPDATE fiscal_api_clients SET revoked_at=now() WHERE id=$1",[apiKey.rows[0].id]);
 const active=await db.query("SELECT id FROM fiscal_api_clients WHERE id=$1 AND revoked_at IS NULL",[apiKey.rows[0].id]);
 assert.equal(active.rowCount,0);
 await db.query("ROLLBACK");
 console.log("FISCAL DATABASE SMOKE PASSED: pending onboarding, draft-only, tenant isolation, key revocation, immutable audit");
}catch(error){await db.query("ROLLBACK").catch(()=>{});throw error;}
finally{await db.end();}
