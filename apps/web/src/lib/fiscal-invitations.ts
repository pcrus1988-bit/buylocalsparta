import {createHash,randomBytes} from "node:crypto";
import {fiscalPool} from "./fiscal-runtime";
import type {FiscalAdminActor} from "./fiscal-auth";

const sha=(value:string)=>createHash("sha256").update(value).digest("hex");
const emailPattern=/^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export class FiscalInvitationError extends Error{
 readonly code:string; readonly status:number;
 constructor(code:string,status=400){super(code);this.code=code;this.status=status;}
}
export type FiscalInvitationInput=Readonly<{email:string;legalName:string;vatNumber:string}>;
export function parseFiscalInvitationInput(input:unknown):FiscalInvitationInput{
 if(!input||typeof input!=="object"||Array.isArray(input))throw new FiscalInvitationError("INVITATION_INVALID");
 const raw=input as Record<string,unknown>;
 if(Object.keys(raw).some(k=>!["email","legalName","vatNumber"].includes(k))||
  typeof raw.email!=="string"||typeof raw.legalName!=="string"||typeof raw.vatNumber!=="string")
  throw new FiscalInvitationError("INVITATION_INVALID");
 const email=raw.email.trim().toLowerCase(),legalName=raw.legalName.trim(),vatNumber=raw.vatNumber.trim();
 if(email.length>254||email.length<6||!emailPattern.test(email)||
  legalName.length<2||legalName.length>240||!/^[0-9]{9}$/.test(vatNumber))
  throw new FiscalInvitationError("INVITATION_INVALID");
 return {email,legalName,vatNumber};
}
export function parseFiscalInvitationToken(value:unknown):string{
 if(typeof value!=="string"||!/^[a-f0-9]{64}$/.test(value))
  throw new FiscalInvitationError("INVITATION_INVALID_OR_EXPIRED",403);
 return sha(value);
}
export function parseFiscalInvitationPassword(value:unknown):string{
 if(typeof value!=="string"||value.length<12||value.length>256)
  throw new FiscalInvitationError("PASSWORD_LENGTH_INVALID",400);
 return value;
}
export function invitedRegistrationEnabled(){
 return process.env.FISCAL_INVITATIONS_ENABLED==="true";
}
export async function issueFiscalInvitation(actor:FiscalAdminActor,raw:unknown){
 if(!invitedRegistrationEnabled())throw new FiscalInvitationError("INVITATIONS_DISABLED",403);
 const origin=process.env.FISCAL_SERVICE_BASE_URL?.trim();
 if(!origin)throw new FiscalInvitationError("FISCAL_SERVICE_ORIGIN_MISSING",503);
 const base=new URL(origin);
 if(base.protocol!=="https:"||base.pathname!=="/"||base.username||base.password||base.search||base.hash)
  throw new FiscalInvitationError("FISCAL_SERVICE_ORIGIN_INVALID",503);
 const input=parseFiscalInvitationInput(raw),token=randomBytes(32).toString("hex");
 const db=await fiscalPool().connect();
 try{
  await db.query("BEGIN");
  const duplicate=await db.query("SELECT id FROM fiscal_users WHERE email=$1 LIMIT 1",[input.email]);
  if(duplicate.rowCount)throw new FiscalInvitationError("INVITATION_ACCOUNT_EXISTS",409);
  const approved=await db.query(
   "SELECT id FROM fiscal_organizations WHERE vat_number=$1 AND status NOT IN ('rejected') LIMIT 1",
   [input.vatNumber]);
  if(approved.rowCount)throw new FiscalInvitationError("INVITATION_BUSINESS_EXISTS",409);
  const result=await db.query<{id:string;expires_at:Date}>(
   `INSERT INTO fiscal_merchant_invitations
     (email,legal_name,vat_number,token_hash,created_by_kind,created_by,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,now()+interval '48 hours')
    RETURNING id,expires_at`,
   [input.email,input.legalName,input.vatNumber,sha(token),actor.kind,actor.id]);
  const id=result.rows[0].id;
  await db.query(
   `INSERT INTO fiscal_audit_events(actor_kind,actor_ref,action,details)
     VALUES($1,$2,'onboarding.invitation_created',$3::jsonb)`,
   [actor.kind,actor.id,JSON.stringify({invitationId:id,delivery:"operator_manual",email:input.email})]);
  await db.query("COMMIT");
  // Fragment never reaches Next.js / CDN request logs or Referer headers.
  // Reveal once to authorized operator. Do not store raw token anywhere.
  return {id,expiresAt:result.rows[0].expires_at,
   delivery:"manual",url:new URL("/timologio/invite",base).toString()+"#"+token};
 }catch(error){
  await db.query("ROLLBACK").catch(()=>undefined);
  if((error as {code?:string}).code==="23505")throw new FiscalInvitationError("INVITATION_ALREADY_PENDING",409);
  throw error;
 }finally{db.release();}
}
export async function listFiscalInvitations(){
 const result=await fiscalPool().query<{
  id:string;email:string;legal_name:string;vat_number:string;status:string;
  created_at:Date;expires_at:Date
 }>(`SELECT id,email,legal_name,vat_number,status,created_at,expires_at
    FROM fiscal_merchant_invitations ORDER BY created_at DESC LIMIT 30`);
 return result.rows;
}
export async function revokeFiscalInvitation(actor:FiscalAdminActor,raw:unknown){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new FiscalInvitationError("INVITATION_INVALID");
 const obj=raw as Record<string,unknown>;
 if(Object.keys(obj).some(k=>k!=="id")||typeof obj.id!=="string"||!uuid.test(obj.id))
  throw new FiscalInvitationError("INVITATION_INVALID");
 const db=await fiscalPool().connect();
 try{
  await db.query("BEGIN");
  const update=await db.query<{id:string}>(
   "UPDATE fiscal_merchant_invitations SET status='revoked' WHERE id=$1 AND status='pending' RETURNING id",
   [obj.id]);
  if(!update.rowCount)throw new FiscalInvitationError("INVITATION_NOT_PENDING",409);
  await db.query(
   `INSERT INTO fiscal_audit_events(actor_kind,actor_ref,action,details)
     VALUES($1,$2,'onboarding.invitation_revoked',$3::jsonb)`,
   [actor.kind,actor.id,JSON.stringify({invitationId:obj.id})]);
  await db.query("COMMIT");return {revoked:true};
 }catch(error){await db.query("ROLLBACK").catch(()=>undefined);throw error;}finally{db.release();}
}
export async function redeemFiscalInvitation(token:unknown,password:unknown,hashPassword:(password:string)=>string){
 if(!invitedRegistrationEnabled())throw new FiscalInvitationError("INVITATIONS_DISABLED",403);
 const digest=parseFiscalInvitationToken(token),pass=parseFiscalInvitationPassword(password);
 const db=await fiscalPool().connect();
 try{
  await db.query("BEGIN");
  const found=await db.query<{id:string;email:string;legal_name:string;vat_number:string}>(
   `SELECT id,email,legal_name,vat_number FROM fiscal_merchant_invitations
    WHERE token_hash=$1 AND status='pending' AND expires_at>now() FOR UPDATE`,[digest]);
  const invite=found.rows[0];
  if(!invite)throw new FiscalInvitationError("INVITATION_INVALID_OR_EXPIRED",403);
  const user=await db.query<{id:string}>(
   "INSERT INTO fiscal_users(email,password_hash,role) VALUES($1,$2,'merchant') RETURNING id",
   [invite.email,hashPassword(pass)]);
  const org=await db.query<{id:string}>(
   "INSERT INTO fiscal_organizations(legal_name,vat_number,status) VALUES($1,$2,'pending_review') RETURNING id",
   [invite.legal_name,invite.vat_number]);
  await db.query("INSERT INTO fiscal_memberships(organization_id,user_id,role) VALUES($1,$2,'owner')",
   [org.rows[0].id,user.rows[0].id]);
  await db.query(
   "UPDATE fiscal_merchant_invitations SET status='redeemed',redeemed_at=now(),redeemed_user_id=$2 WHERE id=$1",
   [invite.id,user.rows[0].id]);
  await db.query(
   `INSERT INTO fiscal_audit_events(actor_kind,actor_ref,organization_id,action,details)
      VALUES('merchant',$1,$2,'onboarding.invitation_redeemed',$3::jsonb)`,
   [user.rows[0].id,org.rows[0].id,JSON.stringify({
     invitationId:invite.id,verificationState:"unverified",registrationMode:"invitation"
   })]);
  await db.query("COMMIT");
  return {pendingReview:true,emailVerified:false,identityVerified:false,issuanceEnabled:false};
 }catch(error){
  await db.query("ROLLBACK").catch(()=>undefined);
  if((error as {code?:string}).code==="23505")throw new FiscalInvitationError("INVITATION_CONFLICT",409);
  throw error;
 }finally{db.release();}
}
