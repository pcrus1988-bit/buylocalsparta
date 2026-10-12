/** Standalone private PostgreSQL recovery checks; executed only after isolated CI migrations. */
import assert from "node:assert/strict";
import pg from "pg";
const url=process.env.FISCAL_DATABASE_URL;
if(!url||process.env.CI!=="true")throw new Error("RECOVERY_DB_SMOKE_CI_ONLY");
const u=new URL(url);
if(!["localhost","127.0.0.1","::1"].includes(u.hostname)||u.pathname!=="/fiscal_ci")
 throw new Error("RECOVERY_DB_SMOKE_DISALLOWS_PERSISTENT_DB");
const db=new pg.Client({connectionString:url});
await db.connect();
try {
 await db.query("BEGIN");
 for(const table of ["fiscal_mfa_recovery_cases","fiscal_mfa_recovery_approvals"]){
  const security=await db.query("SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass",["public."+table]);
  assert.equal(security.rows[0]?.relrowsecurity,true,"Recovery tables must be RLS protected");
 }
 const target="ci_recovery_target_001",a="ci_recovery_approver_001",b="ci_recovery_approver_002";
 for(const identity of [target,a,b]){
  await db.query(
   `INSERT INTO fiscal_operator_mfa_factors(
      actor_kind,actor_ref,secret_ciphertext,pending_expires_at,status,activated_at)
    VALUES('marketplace_super_admin',$1,$2,now()+interval '10 minutes','active',now())`,
   [identity,"v1:"+"a".repeat(24)+":"+"b".repeat(64)+":"+"c".repeat(32)]);
 }
 const first=await db.query(
  `INSERT INTO fiscal_mfa_recovery_cases(target_kind,target_ref,evidence_ref)
    VALUES('marketplace_super_admin',$1,'REC-CI-OFFLINE-000001') RETURNING id`,[target]);
 const caseId=first.rows[0].id;
 await db.query("SAVEPOINT complete_without_approvals");
 await assert.rejects(()=>db.query(
  "UPDATE fiscal_mfa_recovery_cases SET state='completed',closed_at=now() WHERE id=$1",
  [caseId]),"Database must prohibit recovery completion without approvals");
 await db.query("ROLLBACK TO SAVEPOINT complete_without_approvals");
 await db.query("SAVEPOINT duplicate_open");
 await assert.rejects(()=>db.query(
  `INSERT INTO fiscal_mfa_recovery_cases(target_kind,target_ref,evidence_ref)
    VALUES('marketplace_super_admin',$1,'REC-CI-OFFLINE-000002')`,[target]));
 await db.query("ROLLBACK TO SAVEPOINT duplicate_open");
 for(const [title,sql,values] of [
  ["self-approval",`INSERT INTO fiscal_mfa_recovery_approvals(case_id,approver_ref,evidence_ref,attested_offline_identity) VALUES($1,$2,$3,true)`,[caseId,target,"REC-CI-OFFLINE-000001"]],
  ["mismatched-evidence",`INSERT INTO fiscal_mfa_recovery_approvals(case_id,approver_ref,evidence_ref,attested_offline_identity) VALUES($1,$2,$3,true)`,[caseId,a,"REC-CI-OFFLINE-FAKE"]],
  ["non-superadmin",`INSERT INTO fiscal_mfa_recovery_approvals(case_id,approver_kind,approver_ref,evidence_ref,attested_offline_identity) VALUES($1,'fiscal_admin',$2,$3,true)`,[caseId,a,"REC-CI-OFFLINE-000001"]]
 ]){
  await db.query("SAVEPOINT rejected_approval");
  await assert.rejects(()=>db.query(sql,values),title+" must be blocked by the database");
  await db.query("ROLLBACK TO SAVEPOINT rejected_approval");
 }
 await db.query(
  `INSERT INTO fiscal_mfa_recovery_approvals(case_id,approver_ref,evidence_ref,attested_offline_identity)
   VALUES($1,$2,'REC-CI-OFFLINE-000001',true)`,[caseId,a]);
 await db.query("SAVEPOINT complete_with_only_one_approval");
 await assert.rejects(()=>db.query(
  "UPDATE fiscal_mfa_recovery_cases SET state='completed',closed_at=now() WHERE id=$1",
  [caseId]),"Database must prohibit recovery completion after only one approval");
 await db.query("ROLLBACK TO SAVEPOINT complete_with_only_one_approval");
 await db.query("SAVEPOINT duplicate_approval");
 await assert.rejects(()=>db.query(
  `INSERT INTO fiscal_mfa_recovery_approvals(case_id,approver_ref,evidence_ref,attested_offline_identity)
   VALUES($1,$2,'REC-CI-OFFLINE-000001',true)`,[caseId,a]));
 await db.query("ROLLBACK TO SAVEPOINT duplicate_approval");
 await db.query(
  `INSERT INTO fiscal_mfa_recovery_approvals(case_id,approver_ref,evidence_ref,attested_offline_identity)
   VALUES($1,$2,'REC-CI-OFFLINE-000001',true)`,[caseId,b]);
 const approvals=await db.query(
  "SELECT count(*)::int AS count FROM fiscal_mfa_recovery_approvals WHERE case_id=$1",[caseId]);
 assert.equal(approvals.rows[0].count,2);
 await db.query("SAVEPOINT immutable_approval");
 await assert.rejects(()=>db.query(
  "UPDATE fiscal_mfa_recovery_approvals SET approver_ref='ci_forged_operator' WHERE case_id=$1",[caseId]));
 await db.query("ROLLBACK TO SAVEPOINT immutable_approval");
 await db.query("UPDATE fiscal_mfa_recovery_cases SET state='completed',closed_at=now() WHERE id=$1",[caseId]);
 await db.query("SAVEPOINT closed_reopen");
 await assert.rejects(()=>db.query(
  "UPDATE fiscal_mfa_recovery_cases SET state='pending',closed_at=NULL WHERE id=$1",[caseId]));
 await db.query("ROLLBACK TO SAVEPOINT closed_reopen");
 await db.query("SAVEPOINT closed_approve");
 await assert.rejects(()=>db.query(
  `INSERT INTO fiscal_mfa_recovery_approvals(case_id,approver_ref,evidence_ref,attested_offline_identity)
   VALUES($1,'ci_recovery_approver_003','REC-CI-OFFLINE-000001',true)`,[caseId]));
 await db.query("ROLLBACK TO SAVEPOINT closed_approve");
 await db.query("SAVEPOINT delete_case");
 await assert.rejects(()=>db.query("DELETE FROM fiscal_mfa_recovery_cases WHERE id=$1",[caseId]));
 await db.query("ROLLBACK TO SAVEPOINT delete_case");
 await db.query("ROLLBACK");
 console.log("FISCAL MFA RECOVERY DB SMOKE PASSED: RLS, self/duplicate/cross-role protections, immutable audit, closed-case guard");
}catch(error){await db.query("ROLLBACK").catch(()=>undefined);throw error;}
finally{await db.end();}
