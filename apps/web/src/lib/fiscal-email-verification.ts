/** Email ownership proof for invited merchants. It grants no KYB or fiscal permissions. */
import {createHash,randomBytes} from "node:crypto";
import {fiscalPool} from "./fiscal-runtime";
import type {FiscalActor} from "./fiscal-auth";

const digest=(s:string)=>createHash("sha256").update(s).digest("hex");
export class FiscalEmailVerificationError extends Error {
 readonly code:string;readonly status:number;
 constructor(code:string,status=400){super(code);this.code=code;this.status=status;}
}
export function parseFiscalEmailProof(body:unknown):string {
 if(!body||typeof body!=="object"||Array.isArray(body))throw new FiscalEmailVerificationError("EMAIL_PROOF_INVALID");
 const fields=body as Record<string,unknown>;
 if(Object.keys(fields).length!==1||!Object.hasOwn(fields,"token")||
  typeof fields.token!=="string"||!/^[a-f0-9]{64}$/.test(fields.token))
  throw new FiscalEmailVerificationError("EMAIL_PROOF_INVALID");
 return digest(fields.token);
}
export function fiscalEmailVerificationEnabled(){
 return process.env.FISCAL_EMAIL_VERIFICATION_ENABLED==="true";
}
function senderConfiguration(){
 const apiKey=process.env.RESEND_API_KEY?.trim();
 const from=process.env.FISCAL_VERIFICATION_FROM?.trim();
 const origin=process.env.FISCAL_SERVICE_BASE_URL?.trim();
 if(!apiKey||!from||!origin)
  throw new FiscalEmailVerificationError("EMAIL_DELIVERY_NOT_CONFIGURED",503);
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from))
  throw new FiscalEmailVerificationError("EMAIL_DELIVERY_NOT_CONFIGURED",503);
 let base:URL;
 try{base=new URL(origin);}catch{throw new FiscalEmailVerificationError("EMAIL_DELIVERY_NOT_CONFIGURED",503);}
 if(base.protocol!=="https:"||base.pathname!=="/"||base.search||base.hash||base.username||base.password)
  throw new FiscalEmailVerificationError("EMAIL_DELIVERY_NOT_CONFIGURED",503);
 return {apiKey,from,base};
}
export function fiscalEmailProofLink(origin:string,token:string) {
 const base=new URL(origin);
 if(base.protocol!=="https:"||base.pathname!=="/"||base.search||base.hash||base.username||base.password||
  !/^[a-f0-9]{64}$/.test(token))throw new FiscalEmailVerificationError("EMAIL_PROOF_INVALID");
 return new URL("/timologio/verify-email",base).toString()+"#"+token;
}
export async function fiscalEmailStatus(actor:Pick<FiscalActor,"id">) {
 const result=await fiscalPool().query<{email_verified_at:Date|null}>(
  "SELECT email_verified_at FROM fiscal_users WHERE id=$1 AND role='merchant' AND disabled_at IS NULL",[actor.id]);
 return {verified:!!result.rows[0]?.email_verified_at,
  verifiedAt:result.rows[0]?.email_verified_at??null};
}
export async function requestFiscalEmailVerification(actor:Pick<FiscalActor,"id"|"role">) {
 if(!fiscalEmailVerificationEnabled())throw new FiscalEmailVerificationError("EMAIL_VERIFICATION_DISABLED",403);
 if(actor.role!=="merchant")throw new FiscalEmailVerificationError("MERCHANT_AUTH_REQUIRED",401);
 const config=senderConfiguration(); // refuse before consuming rate-limit quota
 const token=randomBytes(32).toString("hex"),hash=digest(token);
 const db=await fiscalPool().connect();
 let challengeId:string|undefined,recipient="";
 try{
  await db.query("BEGIN");
  const found=await db.query<{id:string;email:string;email_verified_at:Date|null}>(
   "SELECT id,email,email_verified_at FROM fiscal_users WHERE id=$1 AND role='merchant' AND disabled_at IS NULL FOR UPDATE",[actor.id]);
  const owner=found.rows[0];
  if(!owner)throw new FiscalEmailVerificationError("MERCHANT_AUTH_REQUIRED",401);
  if(owner.email_verified_at){await db.query("COMMIT");return {alreadyVerified:true};}
  const limited=await db.query<{attempts:number}>(
   `INSERT INTO fiscal_auth_limits(key_hash,window_start,attempts)
     VALUES($1,now(),1)
    ON CONFLICT(key_hash) DO UPDATE SET
     attempts=CASE WHEN fiscal_auth_limits.window_start<now()-interval '1 hour'
      THEN 1 ELSE fiscal_auth_limits.attempts+1 END,
     window_start=CASE WHEN fiscal_auth_limits.window_start<now()-interval '1 hour'
      THEN now() ELSE fiscal_auth_limits.window_start END
    RETURNING attempts`,[digest("email-verification:"+actor.id)]);
  if((limited.rows[0]?.attempts??4)>3)
   throw new FiscalEmailVerificationError("EMAIL_VERIFICATION_RATE_LIMITED",429);
  await db.query(
   `UPDATE fiscal_email_verification_challenges SET status='revoked',revoked_at=now()
    WHERE user_id=$1 AND status='pending'`,[actor.id]);
  const created=await db.query<{id:string}>(
   `INSERT INTO fiscal_email_verification_challenges(user_id,token_hash,expires_at)
    VALUES($1,$2,now()+interval '20 minutes') RETURNING id`,[actor.id,hash]);
  challengeId=created.rows[0].id;recipient=owner.email;
  await db.query(
   `INSERT INTO fiscal_audit_events(actor_kind,actor_ref,action,details)
    VALUES('merchant',$1,'email.verification_challenge_created',$2::jsonb)`,
   [actor.id,JSON.stringify({challengeId,expiresMinutes:20,verificationState:"unverified"})]);
  await db.query("COMMIT");
 }catch(e){await db.query("ROLLBACK").catch(()=>undefined);throw e;}
 finally{db.release();}
 // Do not log or persist the raw proof; the recipient receives it by email only.
 const proofLink=fiscalEmailProofLink(config.base.toString(),token);
 let accepted=false;
 try{
  const response=await fetch("https://api.resend.com/emails",{
   method:"POST",
   headers:{"authorization":"Bearer "+config.apiKey,"content-type":"application/json"},
   body:JSON.stringify({
    from:config.from,to:[recipient],subject:"KONTA MOY FISCAL · Επιβεβαίωση email",
    text:"Επιβεβαιώστε τη διεύθυνση email του FISCAL λογαριασμού σας εντός 20 λεπτών:\n\n"+proofLink+
    "\n\nΑν δεν ζητήσατε επιβεβαίωση, αγνοήστε αυτό το μήνυμα. Η επιβεβαίωση email δεν αποτελεί έγκριση επιχείρησης.",
   }),
   signal:AbortSignal.timeout(8000)
  });
  accepted=response.ok;
 }catch{/* Network faults must not leak provider credentials or proof links. */}
 if(!accepted){
  await fiscalPool().query(
   `UPDATE fiscal_email_verification_challenges SET status='revoked',revoked_at=now()
     WHERE id=$1 AND user_id=$2 AND status='pending'`,[challengeId,actor.id]);
  await fiscalPool().query(
   `INSERT INTO fiscal_audit_events(actor_kind,actor_ref,action,details)
    VALUES('merchant',$1,'email.verification_delivery_failed',$2::jsonb)`,
   [actor.id,JSON.stringify({challengeId})]);
  throw new FiscalEmailVerificationError("EMAIL_DELIVERY_UNAVAILABLE",503);
 }
 await fiscalPool().query(
  `INSERT INTO fiscal_audit_events(actor_kind,actor_ref,action,details)
   VALUES('merchant',$1,'email.verification_provider_accepted',$2::jsonb)`,
  [actor.id,JSON.stringify({challengeId})]);
 return {sent:true,expiresMinutes:20,emailVerified:false};
}
export async function confirmFiscalEmailVerification(
 actor:Pick<FiscalActor,"id"|"role">,body:unknown
){
 if(!fiscalEmailVerificationEnabled())throw new FiscalEmailVerificationError("EMAIL_VERIFICATION_DISABLED",403);
 if(actor.role!=="merchant")throw new FiscalEmailVerificationError("MERCHANT_AUTH_REQUIRED",401);
 const hash=parseFiscalEmailProof(body);
 const db=await fiscalPool().connect();
 try{
  await db.query("BEGIN");
  const found=await db.query<{id:string}>(
   `SELECT id FROM fiscal_email_verification_challenges
    WHERE token_hash=$1 AND user_id=$2 AND status='pending' AND expires_at>now()
    FOR UPDATE`,[hash,actor.id]);
  if(!found.rows[0])throw new FiscalEmailVerificationError("EMAIL_PROOF_EXPIRED_OR_USED",403);
  const account=await db.query(
   `UPDATE fiscal_users SET email_verified_at=now()
    WHERE id=$1 AND role='merchant' AND disabled_at IS NULL AND email_verified_at IS NULL
    RETURNING id`,[actor.id]);
  if(!account.rowCount)throw new FiscalEmailVerificationError("EMAIL_PROOF_EXPIRED_OR_USED",403);
  await db.query(
   `UPDATE fiscal_email_verification_challenges
     SET status='consumed',consumed_at=now() WHERE id=$1`,[found.rows[0].id]);
  await db.query(
   `INSERT INTO fiscal_audit_events(actor_kind,actor_ref,action,details)
    VALUES('merchant',$1,'email.ownership_proved',$2::jsonb)`,
   [actor.id,JSON.stringify({challengeId:found.rows[0].id,method:"email_link",kybApproved:false})]);
  await db.query("COMMIT");
  return {emailVerified:true,identityVerified:false,issuanceEnabled:false};
 }catch(e){await db.query("ROLLBACK").catch(()=>undefined);throw e;}
 finally{db.release();}
}
