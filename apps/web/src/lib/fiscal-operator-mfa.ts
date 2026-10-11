import {createHash,randomBytes} from "node:crypto";
import {cookies} from "next/headers";
import type {FiscalAdminActor} from "./fiscal-auth";
import {fiscalPool} from "./fiscal-runtime";
import {
 createFiscalMfaSecret,decryptFiscalMfaSecret,encryptFiscalMfaSecret,
 fiscalTotpUri,parseFiscalMfaKey,verifyFiscalTotp
} from "./fiscal-operator-mfa-crypto";

const COOKIE="km_fiscal_operator_mfa";
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
export class FiscalMfaError extends Error{
 readonly code:string;readonly status:number;
 constructor(code:string,status=400){super(code);this.code=code;this.status=status;}
}
export function fiscalMfaSetupEnabled(){return process.env.FISCAL_OPERATOR_MFA_SETUP_ENABLED==="true";}
export function fiscalMfaEnforced(){return process.env.FISCAL_OPERATOR_MFA_ENFORCED==="true";}
function cryptoKey():string{
 const key=process.env.FISCAL_OPERATOR_MFA_ENCRYPTION_KEY??"";
 parseFiscalMfaKey(key);return key;
}
const actorIdentity=(actor:FiscalAdminActor)=>actor.kind+":"+actor.id;
async function bindingHash(actor:FiscalAdminActor):Promise<string>{
 const jar=await cookies();
 const name=actor.kind==="marketplace_super_admin"&&process.env.FISCAL_STANDALONE_MODE==="true"
  ?"km_fiscal_superadmin_sso":"km_fiscal_session";
 const current=jar.get(name)?.value;
 if(!current||!/^[a-f0-9]{64}$/.test(current))
  throw new FiscalMfaError("MFA_PRIMARY_SESSION_REQUIRED",401);
 return hash(actorIdentity(actor)+":"+current);
}
type Factor={status:string;secret_ciphertext:string;pending_expires_at:Date;last_used_step:string};
export async function fiscalMfaStatus(actor:FiscalAdminActor){
 const row=await fiscalPool().query<{status:string;activated_at:Date|null}>(
  "SELECT status,activated_at FROM fiscal_operator_mfa_factors WHERE actor_kind=$1 AND actor_ref=$2",
  [actor.kind,actor.id]);
 const bound=await isFiscalMfaSatisfied(actor);
 return {setupEnabled:fiscalMfaSetupEnabled(),enforced:fiscalMfaEnforced(),
   active:row.rows[0]?.status==="active",steppedUp:bound,
   activatedAt:row.rows[0]?.activated_at??null};
}
export async function isFiscalMfaSatisfied(actor:FiscalAdminActor):Promise<boolean>{
 const token=(await cookies()).get(COOKIE)?.value;
 if(!token||!/^[a-f0-9]{64}$/.test(token))return false;
 let binding:string;
 try{binding=await bindingHash(actor)}catch{return false;}
 const row=await fiscalPool().query(
  `SELECT 1 FROM fiscal_operator_mfa_sessions s
   JOIN fiscal_operator_mfa_factors f
    ON f.actor_kind=s.actor_kind AND f.actor_ref=s.actor_ref
   WHERE s.token_hash=$1 AND s.actor_kind=$2 AND s.actor_ref=$3
    AND s.session_binding_hash=$4 AND s.revoked_at IS NULL
    AND s.expires_at>now() AND f.status='active' LIMIT 1`,
  [hash(token),actor.kind,actor.id,binding]);
 return !!row.rowCount;
}
export async function requireFiscalOperatorMfa(actor:FiscalAdminActor){
 if(fiscalMfaEnforced()&&!(await isFiscalMfaSatisfied(actor)))
  throw new FiscalMfaError("FISCAL_MFA_REQUIRED",403);
}
function checkConfig(){
 if(!fiscalMfaSetupEnabled())throw new FiscalMfaError("MFA_SETUP_DISABLED",403);
 try{cryptoKey()}catch{throw new FiscalMfaError("MFA_KEY_NOT_READY",503);}
}
function validateCode(raw:unknown):string{
 if(typeof raw!=="string"||!/^[0-9]{6}$/.test(raw))
  throw new FiscalMfaError("MFA_CODE_INVALID",400);
 return raw;
}
async function rateLimit(actor:FiscalAdminActor){
 // Save every attempt outside the verification transaction so failures are never rolled back.
 const row=await fiscalPool().query<{attempts:number}>(`
 INSERT INTO fiscal_auth_limits(key_hash,window_start,attempts) VALUES($1,now(),1)
 ON CONFLICT(key_hash) DO UPDATE SET
  attempts=CASE WHEN fiscal_auth_limits.window_start<now()-interval '15 minutes'
   THEN 1 ELSE fiscal_auth_limits.attempts+1 END,
  window_start=CASE WHEN fiscal_auth_limits.window_start<now()-interval '15 minutes'
   THEN now() ELSE fiscal_auth_limits.window_start END
 RETURNING attempts`,[hash("mfa-attempt:"+actorIdentity(actor))]);
 if((row.rows[0]?.attempts??6)>5)throw new FiscalMfaError("MFA_RATE_LIMITED",429);
}
async function grantStepUp(actor:FiscalAdminActor,binding:string,db:import("pg").PoolClient){
 const token=randomBytes(32).toString("hex");
 await db.query(
  `UPDATE fiscal_operator_mfa_sessions SET revoked_at=now()
    WHERE actor_kind=$1 AND actor_ref=$2 AND session_binding_hash=$3
     AND revoked_at IS NULL`,[actor.kind,actor.id,binding]);
 await db.query(
  `INSERT INTO fiscal_operator_mfa_sessions(actor_kind,actor_ref,session_binding_hash,token_hash,expires_at)
    VALUES($1,$2,$3,$4,now()+interval '15 minutes')`,
  [actor.kind,actor.id,binding,hash(token)]);
 return token;
}
async function setMfaCookie(token:string){
 (await cookies()).set(COOKIE,token,{path:"/",httpOnly:true,sameSite:"strict",secure:true,maxAge:900});
}
export async function startFiscalMfaEnrollment(actor:FiscalAdminActor){
 checkConfig();
 const binding=await bindingHash(actor);
 const secret=createFiscalMfaSecret();
 const sealed=encryptFiscalMfaSecret(secret,actorIdentity(actor),cryptoKey());
 const db=await fiscalPool().connect();
 try{
  await db.query("BEGIN");
  const factor=await db.query<{status:string}>(
   `SELECT status FROM fiscal_operator_mfa_factors
     WHERE actor_kind=$1 AND actor_ref=$2 FOR UPDATE`,[actor.kind,actor.id]);
  if(factor.rows[0]?.status==="active")throw new FiscalMfaError("MFA_ALREADY_ENROLLED",409);
  if(factor.rowCount){
   await db.query(
    `UPDATE fiscal_operator_mfa_factors SET secret_ciphertext=$3,
      created_at=now(),pending_expires_at=now()+interval '10 minutes',
      last_used_step=-1 WHERE actor_kind=$1 AND actor_ref=$2 AND status='pending'`,
    [actor.kind,actor.id,sealed]);
  }else{
   await db.query(
    `INSERT INTO fiscal_operator_mfa_factors(
      actor_kind,actor_ref,secret_ciphertext,pending_expires_at)
     VALUES($1,$2,$3,now()+interval '10 minutes')`,
    [actor.kind,actor.id,sealed]);
  }
  await db.query(
   `INSERT INTO fiscal_audit_events(actor_kind,actor_ref,action,details)
    VALUES($1,$2,'security.mfa_enrollment_started',$3::jsonb)`,
   [actor.kind,actor.id,JSON.stringify({method:"totp",expiresMinutes:10})]);
  await db.query("COMMIT");
 }catch(error){
  await db.query("ROLLBACK").catch(()=>undefined);
  if((error as {code?:string}).code==="23505")throw new FiscalMfaError("MFA_RETRY_ENROLLMENT",409);
  throw error;
 }finally{db.release();}
 // AAD binds encrypted secret to the original authenticated identity.
 // The secret is shown only on this response and never in logs, URLs or audit events.
 void binding;
 return {secret,uri:fiscalTotpUri(secret,actor.email),expiresMinutes:10};
}
export async function proveFiscalMfa(actor:FiscalAdminActor,action:"activate"|"step_up",rawCode:unknown){
 checkConfig();
 const code=validateCode(rawCode);
 const binding=await bindingHash(actor);
 await rateLimit(actor);
 const db=await fiscalPool().connect();
 let token:string;
 try{
  await db.query("BEGIN");
  const q=await db.query<Factor>(
   `SELECT status,secret_ciphertext,pending_expires_at,last_used_step
    FROM fiscal_operator_mfa_factors
    WHERE actor_kind=$1 AND actor_ref=$2 FOR UPDATE`,[actor.kind,actor.id]);
  const factor=q.rows[0];
  if(!factor)throw new FiscalMfaError("MFA_ENROLLMENT_REQUIRED",409);
  if(action==="activate"&&(factor.status!=="pending"||new Date(factor.pending_expires_at)<=new Date()))
   throw new FiscalMfaError("MFA_ENROLLMENT_EXPIRED",409);
  if(action==="step_up"&&factor.status!=="active")
   throw new FiscalMfaError("MFA_ENROLLMENT_REQUIRED",409);
  const secret=decryptFiscalMfaSecret(factor.secret_ciphertext,actorIdentity(actor),cryptoKey());
  const counter=verifyFiscalTotp(secret,code,Date.now(),Number(factor.last_used_step));
  if(counter===null)throw new FiscalMfaError("MFA_CODE_INVALID",403);
  await db.query(
   `UPDATE fiscal_operator_mfa_factors
    SET status='active',activated_at=COALESCE(activated_at,now()),last_used_step=$3
    WHERE actor_kind=$1 AND actor_ref=$2`,[actor.kind,actor.id,counter]);
  token=await grantStepUp(actor,binding,db);
  await db.query(
   `INSERT INTO fiscal_audit_events(actor_kind,actor_ref,action,details)
    VALUES($1,$2,$3,$4::jsonb)`,
   [actor.kind,actor.id,action==="activate"?"security.mfa_activated":"security.mfa_step_up",
    JSON.stringify({method:"totp",expiresMinutes:15})]);
  await db.query("COMMIT");
 }catch(error){await db.query("ROLLBACK").catch(()=>undefined);throw error;}
 finally{db.release();}
 await setMfaCookie(token);
 return {active:true,steppedUp:true,expiresMinutes:15};
}
export async function exitFiscalMfa(actor:FiscalAdminActor){
 const token=(await cookies()).get(COOKIE)?.value;
 if(token&&/^[a-f0-9]{64}$/.test(token)){
  await fiscalPool().query(
   `UPDATE fiscal_operator_mfa_sessions SET revoked_at=now()
    WHERE token_hash=$1 AND actor_kind=$2 AND actor_ref=$3 AND revoked_at IS NULL`,
   [hash(token),actor.kind,actor.id]);
 }
 (await cookies()).delete(COOKIE);
 return {steppedUp:false};
}
