// Integration regression for the separate Fiscal database; no external AADE traffic.
import assert from "node:assert/strict";
import pg from "pg";
const url=process.env.FISCAL_DATABASE_URL;
if(!url)throw new Error("FISCAL_DATABASE_URL required");
const db=new pg.Client({connectionString:url,connectionTimeoutMillis:5000});
await db.connect();
try{
 await db.query("BEGIN");
 const security=await db.query("SELECT relname,relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'fiscal_%'");
 assert.ok(security.rows.length>=8);
 assert.ok(security.rows.every(row=>row.relrowsecurity===true),"Every Fiscal table must enable RLS");
 const inboxIndex=await db.query("SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='fiscal_document_intakes' AND indexname='fiscal_document_intakes_inbox_cursor_idx'");
 assert.equal(inboxIndex.rowCount,1,"Merchant inbox keyset index required");
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
 // Merchant draft inbox is capped, stable-paginated and scoped by active membership.
 await db.query("INSERT INTO fiscal_document_intakes(organization_id,lane,source,external_id,payload) SELECT $1,'b2b','external_api','ci-inbox-'||n,jsonb_build_object('reference','CI-'||n,'grossMinor',1000) FROM generate_series(1,28) n",[oid]);
 const inboxSql="SELECT d.id,to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at_exact FROM fiscal_document_intakes d JOIN fiscal_memberships m ON m.organization_id=d.organization_id AND m.user_id=$2 JOIN fiscal_users u ON u.id=m.user_id AND u.disabled_at IS NULL WHERE d.organization_id=$1 AND d.status='draft' AND ($3::timestamptz IS NULL OR (d.created_at,d.id)<($3::timestamptz,$4::uuid)) ORDER BY d.created_at DESC,d.id DESC LIMIT 25";
 const pageOne=await db.query(inboxSql,[oid,uid,null,null]);
 assert.equal(pageOne.rows.length,25);
 const last=pageOne.rows[pageOne.rows.length-1];
 const pageTwo=await db.query(inboxSql,[oid,uid,last.created_at_exact,last.id]);
 assert.equal(pageTwo.rows.length,5);
 assert.equal(new Set([...pageOne.rows,...pageTwo.rows].map(row=>row.id)).size,30,"No duplicate drafts across cursor pages");
 const forbiddenInbox=await db.query(inboxSql,[oid,otherUser.rows[0].id,null,null]);
 assert.equal(forbiddenInbox.rowCount,0,"Unrelated merchants must never read another organization's drafts");
 const wrongOwner=await db.query("SELECT c.id FROM fiscal_api_clients c JOIN fiscal_memberships m ON m.organization_id=c.organization_id WHERE m.user_id=$1 AND c.id=$2",[otherUser.rows[0].id,apiKey.rows[0].id]);
 assert.equal(wrongOwner.rowCount,0);
 await db.query("UPDATE fiscal_api_clients SET revoked_at=now() WHERE id=$1",[apiKey.rows[0].id]);
 const active=await db.query("SELECT id FROM fiscal_api_clients WHERE id=$1 AND revoked_at IS NULL",[apiKey.rows[0].id]);
 assert.equal(active.rowCount,0);
 // Guarded linking: pending businesses and mismatched VAT must fail even on direct SQL.
 const vendorId="a8f1ad6c-7c2d-4e84-8d66-9d9e9ae15a10";
 await db.query("SAVEPOINT link_pending");
 await assert.rejects(()=>db.query(
  "INSERT INTO fiscal_marketplace_links(organization_id,marketplace_vendor_id,marketplace_vendor_public_id,issuer_vat_number,authorized_by) VALUES($1,$2,'vendor_ci_verified','123456789',$3)",
  [oid,vendorId,uid]));
 await db.query("ROLLBACK TO SAVEPOINT link_pending");
 // Console drafts are available only to approved organizations and owner/accountant memberships.
 const consoleAuthorizationSql=`SELECT o.vat_number FROM fiscal_organizations o
 JOIN fiscal_memberships m ON m.organization_id=o.id JOIN fiscal_users u ON u.id=m.user_id
 WHERE o.id=$1 AND m.user_id=$2 AND m.role IN ('owner','accountant')
 AND o.status='approved' AND u.disabled_at IS NULL FOR SHARE OF o,m,u`;
 const pendingConsole=await db.query(consoleAuthorizationSql,[oid,uid]);
 assert.equal(pendingConsole.rowCount,0,"Pending businesses cannot prepare console drafts");
 await db.query("UPDATE fiscal_organizations SET status='approved' WHERE id=$1",[oid]);
 const approvedConsole=await db.query(consoleAuthorizationSql,[oid,uid]);
 assert.equal(approvedConsole.rows[0]?.vat_number,"123456789");
 await db.query("INSERT INTO fiscal_memberships(organization_id,user_id,role) VALUES($1,$2,'viewer')",[oid,otherUser.rows[0].id]);
 const viewerConsole=await db.query(consoleAuthorizationSql,[oid,otherUser.rows[0].id]);
 assert.equal(viewerConsole.rowCount,0,"Viewers cannot prepare a document draft");
 await db.query("UPDATE fiscal_memberships SET role='accountant' WHERE organization_id=$1 AND user_id=$2",[oid,otherUser.rows[0].id]);
 const accountantConsole=await db.query(consoleAuthorizationSql,[oid,otherUser.rows[0].id]);
 assert.equal(accountantConsole.rowCount,1,"Approved accountants can create non-fiscal drafts");
 const testConsoleDraft=await db.query(
  "INSERT INTO fiscal_document_intakes(organization_id,lane,source,external_id,status,payload,payload_digest) VALUES($1,'b2c','console','CONSOLE-smoke-0001','draft',$2::jsonb,$3) RETURNING id",
  [oid,JSON.stringify({reference:"merchant-preview",currency:"EUR",grossMinor:1500,issuerVatNumber:"123456789"}),"b".repeat(64)]);
 assert.equal(testConsoleDraft.rowCount,1);
 const consoleReplay=await db.query(
  "INSERT INTO fiscal_document_intakes(organization_id,lane,source,external_id,status,payload,payload_digest) VALUES($1,'b2c','console','CONSOLE-smoke-0001','draft',$2::jsonb,$3) ON CONFLICT(organization_id,source,external_id) DO NOTHING RETURNING id",
  [oid,JSON.stringify({reference:"merchant-preview",currency:"EUR",grossMinor:1500,issuerVatNumber:"123456789"}),"b".repeat(64)]);
 assert.equal(consoleReplay.rowCount,0,"Console writes must be idempotent");
 const draftDetailsUnauthorized=await db.query(
  "SELECT d.id FROM fiscal_document_intakes d JOIN fiscal_memberships m ON m.organization_id=d.organization_id AND m.user_id=$2 WHERE d.organization_id=$1 AND d.id=$3",
  [otherOrg.rows[0].id,uid,testConsoleDraft.rows[0].id]);
 assert.equal(draftDetailsUnauthorized.rowCount,0,"Draft ID must not bypass tenant scope");
 await db.query("UPDATE fiscal_memberships SET role='viewer' WHERE organization_id=$1 AND user_id=$2",[oid,otherUser.rows[0].id]);
 await db.query("SAVEPOINT vat_mismatch");
 await assert.rejects(()=>db.query(
  "INSERT INTO fiscal_marketplace_links(organization_id,marketplace_vendor_id,marketplace_vendor_public_id,issuer_vat_number,authorized_by) VALUES($1,$2,'vendor_ci_verified','987654321',$3)",
  [oid,vendorId,uid]));
 await db.query("ROLLBACK TO SAVEPOINT vat_mismatch");
 const linked=await db.query(
  "INSERT INTO fiscal_marketplace_links(organization_id,marketplace_vendor_id,marketplace_vendor_public_id,issuer_vat_number,authorized_by) VALUES($1,$2,'vendor_ci_verified','123456789',$3) RETURNING id",
  [oid,vendorId,uid]);
 await db.query("SAVEPOINT immutable_link");
 await assert.rejects(()=>db.query(
  "UPDATE fiscal_marketplace_links SET issuer_vat_number='987654321' WHERE id=$1",[linked.rows[0].id]));
 await db.query("ROLLBACK TO SAVEPOINT immutable_link");
 await db.query("UPDATE fiscal_marketplace_links SET revoked_at=now() WHERE id=$1",[linked.rows[0].id]);
 await db.query("SAVEPOINT restore_link");
 await assert.rejects(()=>db.query("UPDATE fiscal_marketplace_links SET revoked_at=NULL WHERE id=$1",[linked.rows[0].id]));
 await db.query("ROLLBACK TO SAVEPOINT restore_link");
 const challenge=await db.query(
  "INSERT INTO fiscal_marketplace_link_challenges(organization_id,created_by,code_hash,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes') RETURNING id",
  [oid,uid,'c'.repeat(64)]);
 assert.ok(challenge.rows[0].id);
 // SSO tickets are one-time and give independent, revocable Fiscal admin sessions.
 const ticket=await db.query(
  "INSERT INTO fiscal_superadmin_sso_tickets(jti_hash,marketplace_user_id,expires_at) VALUES($1,'marketplace_ci_admin',now()+interval '1 minute') RETURNING jti_hash",
  ["e".repeat(64)]);
 assert.equal(ticket.rows.length,1);
 await db.query("SAVEPOINT reject_sso_replay");
 await assert.rejects(()=>db.query(
  "INSERT INTO fiscal_superadmin_sso_tickets(jti_hash,marketplace_user_id,expires_at) VALUES($1,'marketplace_ci_admin',now()+interval '1 minute')",
  ["e".repeat(64)]));
 await db.query("ROLLBACK TO SAVEPOINT reject_sso_replay");
 await db.query("INSERT INTO fiscal_superadmin_sessions(token_hash,csrf_hash,marketplace_user_id,marketplace_email,expires_at) VALUES($1,$2,'marketplace_ci_admin','ci@kontamou.test',now()+interval '2 hours')",
  ["c".repeat(64),"d".repeat(64)]);
 const ssoBefore=await db.query("SELECT count(*)::int AS count FROM fiscal_superadmin_sessions WHERE token_hash=$1 AND revoked_at IS NULL",["c".repeat(64)]);
 assert.equal(ssoBefore.rows[0].count,1);
 await db.query("UPDATE fiscal_superadmin_sessions SET revoked_at=now() WHERE token_hash=$1",["c".repeat(64)]);
 const ssoAfter=await db.query("SELECT count(*)::int AS count FROM fiscal_superadmin_sessions WHERE token_hash=$1 AND revoked_at IS NULL",["c".repeat(64)]);
 assert.equal(ssoAfter.rows[0].count,0);
 await db.query("ROLLBACK");
 console.log("FISCAL DATABASE SMOKE PASSED: pending onboarding, draft-only, tenant isolation, key revocation, approved-only console draft creation, idempotency, verified marketplace pairing, SSO replay protection, immutable audit");
}catch(error){await db.query("ROLLBACK").catch(()=>{});throw error;}
finally{await db.end();}
