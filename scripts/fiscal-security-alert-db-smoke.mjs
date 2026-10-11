/** Only run against disposable fiscal_ci PostgreSQL. Never on a live project. */
import assert from "node:assert/strict";
import pg from "pg";
const raw=process.env.FISCAL_DATABASE_URL??"";
if(process.env.CI!=="true"||!raw)throw Error("SECURITY_ALERT_CI_ONLY");
const uri=new URL(raw);
if(!["127.0.0.1","localhost","::1"].includes(uri.hostname)||
 uri.pathname!=="/fiscal_ci")throw Error("SECURITY_ALERT_REFUSES_PRODUCTION");
const db=new pg.Client({connectionString:raw});
await db.connect();
try{
 await db.query("BEGIN");
 for(const table of ["fiscal_security_alert_contacts","fiscal_security_alert_outbox","fiscal_security_alert_delivery_events"]){
  const r=await db.query("SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass",["public."+table]);
  assert.equal(r.rows[0]?.relrowsecurity,true,table+" requires RLS");
 }
 const actorRef="ci_security_alert_target_001";
 await db.query(
  `INSERT INTO fiscal_operator_mfa_factors(
    actor_kind,actor_ref,secret_ciphertext,pending_expires_at,status,activated_at)
   VALUES('marketplace_super_admin',$1,$2,now()+interval '10 minutes','active',now())`,
  [actorRef,"v1:"+"a".repeat(24)+":"+"b".repeat(64)+":"+"c".repeat(32)]);
 const c=await db.query(
  `INSERT INTO fiscal_mfa_recovery_cases(target_kind,target_ref,evidence_ref)
   VALUES('marketplace_super_admin',$1,'REC-ALERT-TEST-000001') RETURNING id`,[actorRef]);
 const caseId=c.rows[0].id;
 const soc=await db.query(
  `INSERT INTO fiscal_security_alert_contacts(
     audience,recipient_email,verified_at,verified_by,verification_method)
   VALUES('soc','ci-security@example.test',now(),'ci_independent_officer','organization_security_registry')
   RETURNING id`);
 const owner=await db.query(
  `INSERT INTO fiscal_security_alert_contacts(
     audience,actor_kind,actor_ref,recipient_email,verified_at,verified_by,verification_method)
   VALUES('account_owner','marketplace_super_admin',$1,'ci-owner@example.test',
     now(),'ci_independent_officer','independent_offline_callback') RETURNING id`,[actorRef]);
 const ownerContact=owner.rows[0].id;
 const ref=caseId;
 const first=await db.query(
  `INSERT INTO fiscal_security_alert_outbox(case_id,contact_id,event_code,event_ref)
   VALUES($1,$2,'requested',$3) RETURNING id`,[caseId,ownerContact,ref]);
 const id=first.rows[0].id;
 await db.query("SAVEPOINT duplicate_notification");
 await assert.rejects(()=>db.query(
  `INSERT INTO fiscal_security_alert_outbox(case_id,contact_id,event_code,event_ref)
   VALUES($1,$2,'requested',$3)`,[caseId,ownerContact,ref]));
 await db.query("ROLLBACK TO SAVEPOINT duplicate_notification");
 await db.query("SAVEPOINT mutate_recipient");
 await assert.rejects(()=>db.query(
  "UPDATE fiscal_security_alert_contacts SET recipient_email='attacker@example.test' WHERE id=$1",
  [ownerContact]));
 await db.query("ROLLBACK TO SAVEPOINT mutate_recipient");
 await db.query("SAVEPOINT forge_delivery");
 await assert.rejects(()=>db.query(
  "UPDATE fiscal_security_alert_outbox SET contact_id=$2 WHERE id=$1",[id,soc.rows[0].id]));
 await db.query("ROLLBACK TO SAVEPOINT forge_delivery");
 const lease="e".repeat(64);
 await db.query(
  `UPDATE fiscal_security_alert_outbox SET status='sending',
    lease_until=now()+interval '90 seconds',lease_token_hash=$2,attempts=1,last_attempt_at=now()
   WHERE id=$1`,[id,lease]);
 await db.query("SAVEPOINT illegal_claim_rewrite");
 await assert.rejects(()=>db.query(
  `UPDATE fiscal_security_alert_outbox SET event_code='completed' WHERE id=$1`,[id]));
 await db.query("ROLLBACK TO SAVEPOINT illegal_claim_rewrite");
 await db.query(
  `UPDATE fiscal_security_alert_outbox SET status='provider_accepted',
   lease_until=NULL,lease_token_hash=NULL,provider_message_id='ci-provider-12345',
   provider_accepted_at=now() WHERE id=$1`,[id]);
 const delivery=await db.query(
  `INSERT INTO fiscal_security_alert_delivery_events(outbox_id,provider_event_id,event_type,provider_event_at)
   VALUES($1,'ci_svx_event_000001','email.delivered',now()) RETURNING id`,[id]);
 assert.ok(delivery.rows[0]?.id,"Signed provider delivery receipt is linked to outbox");
 await db.query("SAVEPOINT duplicate_delivery");
 await assert.rejects(()=>db.query(
  `INSERT INTO fiscal_security_alert_delivery_events(outbox_id,provider_event_id,event_type,provider_event_at)
   VALUES($1,'ci_svx_event_000001','email.delivered',now())`,[id]));
 await db.query("ROLLBACK TO SAVEPOINT duplicate_delivery");
 await db.query("SAVEPOINT receipt_forgery");
 await assert.rejects(()=>db.query(
  "UPDATE fiscal_security_alert_delivery_events SET event_type='email.bounced' WHERE id=$1",
  [delivery.rows[0].id]));
 await db.query("ROLLBACK TO SAVEPOINT receipt_forgery");
 await db.query("SAVEPOINT receipt_deletion");
 await assert.rejects(()=>db.query(
  "DELETE FROM fiscal_security_alert_delivery_events WHERE id=$1",[delivery.rows[0].id]));
 await db.query("ROLLBACK TO SAVEPOINT receipt_deletion");
 await db.query("SAVEPOINT invalid_delivery_type");
 await assert.rejects(()=>db.query(
  `INSERT INTO fiscal_security_alert_delivery_events(outbox_id,provider_event_id,event_type,provider_event_at)
   VALUES($1,'ci_svx_event_000002','email.opened',now())`,[id]));
 await db.query("ROLLBACK TO SAVEPOINT invalid_delivery_type");
 await db.query("SAVEPOINT accepted_replay");
 await assert.rejects(()=>db.query(
  "UPDATE fiscal_security_alert_outbox SET status='pending' WHERE id=$1",[id]));
 await db.query("ROLLBACK TO SAVEPOINT accepted_replay");
 await db.query("SAVEPOINT accepted_delete");
 await assert.rejects(()=>db.query("DELETE FROM fiscal_security_alert_outbox WHERE id=$1",[id]));
 await db.query("ROLLBACK TO SAVEPOINT accepted_delete");
 await db.query("ROLLBACK");
 console.log("FISCAL SECURITY ALERT OUTBOX PASSED: RLS, unique event/recipient, append-only signed receipts and terminal delivery state");
}catch(e){await db.query("ROLLBACK").catch(()=>undefined);throw e;}
finally{await db.end();}
