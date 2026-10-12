import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import type {FiscalAdminActor} from "./fiscal-auth";
import {fiscalPool} from "./fiscal-runtime";
import {
 FiscalMfaError,fiscalMfaSetupEnabled,isFiscalMfaSatisfied
} from "./fiscal-operator-mfa";
import {
 createFiscalMfaSecret,encryptFiscalMfaSecret,parseFiscalMfaKey
} from "./fiscal-operator-mfa-crypto";
import type {FiscalRecoveryInput} from "./fiscal-mfa-recovery-input";
import {enqueueFiscalRecoveryAlerts,fiscalSecurityDeliveryConfig} from "./fiscal-security-alert-outbox";
import {fiscalSecurityWebhookConfigured} from "./fiscal-security-alert-webhook";
import {fiscalReconcileEnabled} from "./fiscal-security-alert-reconcile";

type CaseRow={id:string;target_kind:"marketplace_super_admin"|"fiscal_admin";
 target_ref:string;evidence_ref:string;state:string;expires_at:Date};
const digest=(s:string)=>createHash("sha256").update(s).digest("hex");
export const fiscalRecoveryEnabled=()=>process.env.FISCAL_MFA_RECOVERY_ENABLED==="true";
export async function fiscalRecoveryReadiness(actor:FiscalAdminActor){
 const result=await fiscalPool().query<{enrolled_count:number;schema_present:boolean;alert_schema:boolean;reconcile_schema:boolean}>(
  `SELECT (SELECT count(*)::int FROM fiscal_operator_mfa_factors
      WHERE actor_kind='marketplace_super_admin' AND status='active') AS enrolled_count,
    (to_regclass('public.fiscal_mfa_recovery_cases') IS NOT NULL
     AND to_regclass('public.fiscal_mfa_recovery_approvals') IS NOT NULL) AS schema_present,
    (to_regclass('public.fiscal_security_alert_contacts') IS NOT NULL
     AND to_regclass('public.fiscal_security_alert_outbox') IS NOT NULL) AS alert_schema,
    (to_regclass('public.fiscal_security_alert_reconciliation') IS NOT NULL
     AND to_regclass('public.fiscal_security_alert_delivery_events') IS NOT NULL) AS reconcile_schema`);
 const enrolled=result.rows[0]?.enrolled_count??0;
 const alertSchemaPresent=result.rows[0]?.alert_schema===true;
 let verifiedAlertContacts=false;
 if(alertSchemaPresent){
  const contacts=await fiscalPool().query<{audience:string;recipient_email:string}>(
   `SELECT audience,recipient_email FROM fiscal_security_alert_contacts
    WHERE revoked_at IS NULL AND verified_at<=now()
    AND (audience='soc' OR (audience='account_owner' AND actor_kind=$1 AND actor_ref=$2))`,
   [actor.kind,actor.id]);
  const soc=contacts.rows.filter(x=>x.audience==="soc");
  const owner=contacts.rows.filter(x=>x.audience==="account_owner");
  verifiedAlertContacts=soc.length===1&&owner.length===1&&
   soc[0].recipient_email.toLowerCase()!==owner[0].recipient_email.toLowerCase();
 }
 return {
  enrolledSuperadminFactors:enrolled,
  minimumForSuperadminRecovery:3,
  enoughDistinctEnrollments:enrolled>=3,
  // Enrollment counts are not proof of different human beings.
  schemaPresent:result.rows[0]?.schema_present===true,
  alertSchemaPresent,
  providerReconciliationSchemaPresent:result.rows[0]?.reconcile_schema===true,
  signedWebhookConfigured:fiscalSecurityWebhookConfigured(),
  providerReconciliationEnabled:fiscalReconcileEnabled(),
  verifiedAlertContacts,
  alertDeliveryConfigured:process.env.FISCAL_SECURITY_ALERT_DELIVERY_ENABLED==="true" &&
   Boolean(process.env.RESEND_API_KEY?.trim()&&process.env.FISCAL_SECURITY_ALERT_FROM?.trim()&&
    /^[a-f0-9]{64}$/i.test(process.env.FISCAL_SECURITY_ALERT_DISPATCH_TOKEN??"")),
  recoveryEnabled:fiscalRecoveryEnabled(),
  enforced:process.env.FISCAL_OPERATOR_MFA_ENFORCED==="true"
 };
}
const identity=(a:FiscalAdminActor)=>a.kind+":"+a.id;
const error=(code:string,status=409)=>new FiscalMfaError(code,status);
function enabled(){
 if(!fiscalRecoveryEnabled())throw error("RECOVERY_DISABLED",403);
 if(!fiscalMfaSetupEnabled())throw error("MFA_SETUP_DISABLED",503);
 fiscalSecurityDeliveryConfig();
 if(!fiscalSecurityWebhookConfigured())throw error("RECOVERY_SIGNED_WEBHOOK_NOT_READY",503);
 if(!fiscalReconcileEnabled())throw error("RECOVERY_PROVIDER_RECONCILIATION_REQUIRED",503);
 try{parseFiscalMfaKey(process.env.FISCAL_OPERATOR_MFA_ENCRYPTION_KEY??"");}
 catch{throw error("MFA_KEY_NOT_READY",503);}
}
async function limit(actor:FiscalAdminActor,action:string){
 // Rate-limit outside the mutation transaction: failed approvals still consume a slot.
 const row=await fiscalPool().query<{attempts:number}>(
  `INSERT INTO fiscal_auth_limits(key_hash,window_start,attempts) VALUES($1,now(),1)
   ON CONFLICT(key_hash) DO UPDATE SET
     attempts=CASE WHEN fiscal_auth_limits.window_start<now()-interval '15 minutes'
       THEN 1 ELSE fiscal_auth_limits.attempts+1 END,
     window_start=CASE WHEN fiscal_auth_limits.window_start<now()-interval '15 minutes'
       THEN now() ELSE fiscal_auth_limits.window_start END RETURNING attempts`,
  [digest("mfa-recovery:"+action+":"+identity(actor))]);
 if((row.rows[0]?.attempts??6)>5)throw error("RECOVERY_RATE_LIMITED",429);
}
async function audit(db:PoolClient,actor:FiscalAdminActor,action:string,caseId:string){
 await db.query(
  "INSERT INTO fiscal_audit_events(actor_kind,actor_ref,action,details) VALUES($1,$2,$3,$4::jsonb)",
  [actor.kind,actor.id,"security.mfa_recovery_"+action,JSON.stringify({caseId})]);
}
export async function fiscalRecoveryList(actor:FiscalAdminActor){
 if(!fiscalRecoveryEnabled())return {enabled:false,mine:[],approvable:[],requiresTwoOtherSuperAdmins:true};
 enabled();
 const mine=await fiscalPool().query(
  `SELECT c.id,c.evidence_ref AS "evidenceRef",c.state,c.requested_at AS "requestedAt",
    c.expires_at AS "expiresAt",count(a.id)::int AS approvals
   FROM fiscal_mfa_recovery_cases c LEFT JOIN fiscal_mfa_recovery_approvals a ON a.case_id=c.id
   WHERE c.target_kind=$1 AND c.target_ref=$2
   GROUP BY c.id ORDER BY c.requested_at DESC,c.id DESC LIMIT 5`,[actor.kind,actor.id]);
 let approvable:unknown[]=[];
 if(actor.kind==="marketplace_super_admin"&&await isFiscalMfaSatisfied(actor)){
  const q=await fiscalPool().query(
   `SELECT c.id,c.target_kind AS "targetKind",
     c.requested_at AS "requestedAt",c.expires_at AS "expiresAt",
     count(a.id)::int AS approvals,
     COALESCE(bool_or(a.approver_kind=$1 AND a.approver_ref=$2),false) AS "alreadyApproved"
    FROM fiscal_mfa_recovery_cases c LEFT JOIN fiscal_mfa_recovery_approvals a ON a.case_id=c.id
    WHERE c.state='pending' AND c.expires_at>now()
      AND NOT (c.target_kind=$1 AND c.target_ref=$2)
    GROUP BY c.id ORDER BY c.requested_at DESC,c.id DESC LIMIT 20`,
   [actor.kind,actor.id]);
  approvable=q.rows;
 }
 return {enabled:true,mine:mine.rows,approvable,requiresTwoOtherSuperAdmins:true};
}
export async function fiscalRecoveryAction(actor:FiscalAdminActor,input:FiscalRecoveryInput){
 enabled();
 const schema=await fiscalPool().query<{available:boolean}>(
  `SELECT (to_regclass('public.fiscal_mfa_recovery_cases') IS NOT NULL
     AND to_regclass('public.fiscal_mfa_recovery_approvals') IS NOT NULL
     AND to_regclass('public.fiscal_security_alert_outbox') IS NOT NULL
     AND to_regclass('public.fiscal_security_alert_contacts') IS NOT NULL
     AND to_regclass('public.fiscal_security_alert_delivery_events') IS NOT NULL
     AND to_regclass('public.fiscal_security_alert_reconciliation') IS NOT NULL) AS available`);
 if(schema.rows[0]?.available!==true)throw error("RECOVERY_INFRASTRUCTURE_NOT_READY",503);
 await limit(actor,input.action);
 if(input.action==="approve"){
  if(actor.kind!=="marketplace_super_admin")throw error("RECOVERY_APPROVER_FORBIDDEN",403);
  if(!(await isFiscalMfaSatisfied(actor)))throw error("FISCAL_MFA_REQUIRED",403);
 }
 const db=await fiscalPool().connect();
 try{
  await db.query("BEGIN");
  if(input.action==="request"){
   // Serialize only this actor's self-requests, without taking the factor lock
   // ahead of the case lock (approval uses case -> factor ordering).
   await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
     ["fiscal-recovery-request:"+identity(actor)]);
   const existing=await db.query<{id:string;expires_at:Date}>(
    `SELECT id,expires_at FROM fiscal_mfa_recovery_cases
     WHERE target_kind=$1 AND target_ref=$2 AND state='pending' FOR UPDATE`,
    [actor.kind,actor.id]);
   if(existing.rows[0]){
    if(new Date(existing.rows[0].expires_at)>new Date())throw error("RECOVERY_ALREADY_REQUESTED");
    await db.query(
     "UPDATE fiscal_mfa_recovery_cases SET state='expired',closed_at=now() WHERE id=$1",
     [existing.rows[0].id]);
   }
   const factor=await db.query(
    "SELECT 1 FROM fiscal_operator_mfa_factors WHERE actor_kind=$1 AND actor_ref=$2 AND status='active' FOR UPDATE",
    [actor.kind,actor.id]);
   if(!factor.rowCount)throw error("RECOVERY_ACTIVE_FACTOR_REQUIRED");
   const fresh=await db.query<{id:string}>(
    `INSERT INTO fiscal_mfa_recovery_cases(target_kind,target_ref,evidence_ref)
     VALUES($1,$2,$3) RETURNING id`,[actor.kind,actor.id,input.evidenceRef]);
   await audit(db,actor,"requested",fresh.rows[0].id);
   await enqueueFiscalRecoveryAlerts(db,{caseId:fresh.rows[0].id,targetKind:actor.kind,
    targetRef:actor.id,eventCode:"requested",eventRef:fresh.rows[0].id});
   await db.query("COMMIT");
   return {ok:true,caseId:fresh.rows[0].id,state:"pending",approvals:0};
  }
  const row=await db.query<CaseRow>(
   "SELECT id,target_kind,target_ref,evidence_ref,state,expires_at FROM fiscal_mfa_recovery_cases WHERE id=$1 FOR UPDATE",
   [input.caseId]);
  const item=row.rows[0];
  if(!item)throw error("RECOVERY_CASE_NOT_FOUND",404);
  if(item.state!=="pending")throw error("RECOVERY_ALREADY_CLOSED");
  if(input.action==="cancel"){
   if(item.target_kind!==actor.kind||item.target_ref!==actor.id)
    throw error("RECOVERY_CANCEL_FORBIDDEN",403);
   await db.query(
    "UPDATE fiscal_mfa_recovery_cases SET state='cancelled',closed_at=now() WHERE id=$1",
    [item.id]);
   await audit(db,actor,"cancelled",item.id);
   await enqueueFiscalRecoveryAlerts(db,{caseId:item.id,targetKind:item.target_kind,
    targetRef:item.target_ref,eventCode:"cancelled",eventRef:item.id});
   await db.query("COMMIT");
   return {ok:true,caseId:item.id,state:"cancelled"};
  }
  if(new Date(item.expires_at)<=new Date())throw error("RECOVERY_CASE_EXPIRED");
  if(item.target_kind===actor.kind&&item.target_ref===actor.id)
   throw error("RECOVERY_SELF_APPROVAL_FORBIDDEN",403);
  if(item.evidence_ref!==input.evidenceRef)throw error("RECOVERY_EVIDENCE_MISMATCH",403);
  const factor=await db.query(
   `SELECT 1 FROM fiscal_operator_mfa_factors WHERE actor_kind=$1 AND actor_ref=$2
      AND status='active' FOR UPDATE`,[item.target_kind,item.target_ref]);
  if(!factor.rowCount)throw error("RECOVERY_TARGET_NOT_ACTIVE");
  // The unique (case, approver) constraint makes replays fail even across sessions.
  const approved=await db.query<{id:string}>(
   `INSERT INTO fiscal_mfa_recovery_approvals(
       case_id,approver_kind,approver_ref,evidence_ref,attested_offline_identity)
    VALUES($1,$2,$3,$4,true) RETURNING id`,[item.id,actor.kind,actor.id,input.evidenceRef]);
  const count=await db.query<{n:number}>(
   "SELECT count(*)::int AS n FROM fiscal_mfa_recovery_approvals WHERE case_id=$1",
   [item.id]);
  const approvals=count.rows[0]?.n??0;
  if(approvals>2)throw error("RECOVERY_APPROVAL_CONFLICT");
  await audit(db,actor,"approval_recorded",item.id);
  await enqueueFiscalRecoveryAlerts(db,{caseId:item.id,targetKind:item.target_kind,
    targetRef:item.target_ref,eventCode:"approval_recorded",eventRef:approved.rows[0].id});
  if(approvals===2){
   // Replace with an unknowable sealed placeholder, not the old TOTP seed.
   // Existing factor FK rows are preserved, but all old step-up tokens are revoked.
   const identityValue=item.target_kind+":"+item.target_ref;
   const sealed=encryptFiscalMfaSecret(createFiscalMfaSecret(),identityValue,
     process.env.FISCAL_OPERATOR_MFA_ENCRYPTION_KEY??"");
   const updated=await db.query(
    `UPDATE fiscal_operator_mfa_factors
      SET status='pending',secret_ciphertext=$3,created_at=now(),
       pending_expires_at=now()+interval '10 minutes',activated_at=NULL,last_used_step=-1
      WHERE actor_kind=$1 AND actor_ref=$2 AND status='active'`,
    [item.target_kind,item.target_ref,sealed]);
   if(updated.rowCount!==1)throw error("RECOVERY_TARGET_NOT_ACTIVE");
   await db.query(
    `UPDATE fiscal_operator_mfa_sessions SET revoked_at=now()
      WHERE actor_kind=$1 AND actor_ref=$2 AND revoked_at IS NULL`,
    [item.target_kind,item.target_ref]);
   await db.query(
    "UPDATE fiscal_mfa_recovery_cases SET state='completed',closed_at=now() WHERE id=$1",
    [item.id]);
   await audit(db,actor,"completed",item.id);
   await enqueueFiscalRecoveryAlerts(db,{caseId:item.id,targetKind:item.target_kind,
    targetRef:item.target_ref,eventCode:"completed",eventRef:item.id});
  }
  await db.query("COMMIT");
  return {ok:true,caseId:item.id,state:approvals===2?"completed":"pending",
    approvals,enrollmentRequired:approvals===2};
 }catch(e){
  await db.query("ROLLBACK").catch(()=>undefined);
  if((e as {code?:string}).code==="23505")throw error("RECOVERY_DUPLICATE_APPROVAL");
  throw e;
 }finally{db.release();}
}
