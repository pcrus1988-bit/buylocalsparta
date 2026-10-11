import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { fiscalDatabaseConfigured, fiscalPool } from "./fiscal-runtime";
import { getAdminSession } from "./admin-session";
import { assertAdminCsrf } from "./admin-runtime";
import { getFiscalSsoAdmin } from "./fiscal-superadmin-sso";

const SESSION_COOKIE="km_fiscal_session";
const CSRF_COOKIE="km_fiscal_csrf";
const TTL_SECONDS=8*60*60;
type FiscalRole="merchant"|"fiscal_admin";
export type FiscalActor=Readonly<{id:string;email:string;role:FiscalRole;csrfHash:string}>;
export type FiscalAdminActor=Readonly<{kind:"marketplace_super_admin"|"fiscal_admin";id:string;email:string;csrfToken:string}>;
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const match=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
function emailValue(email:string) {
 const value=email.trim().toLowerCase();
 if(value.length>254||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))throw new Error("INVALID_EMAIL");
 return value;
}
function passwordHash(password:string) {
 if(password.length<12||password.length>256)throw new Error("PASSWORD_LENGTH_INVALID");
 const salt=randomBytes(24).toString("hex");
 return "scrypt-v1:"+salt+":"+scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString("hex");
}
function verifyPassword(password:string,stored:string) {
 const parts=stored.split(":");
 if(parts.length!==3||parts[0]!=="scrypt-v1"||password.length>256)return false;
 try{return match(scryptSync(password,parts[1],64,{N:16384,r:8,p:1}).toString("hex"),parts[2]);}
 catch{return false;}
}
export function assertFiscalOrigin(request:Request) {
 const origin=request.headers.get("origin");
 if(!origin||origin!==new URL(request.url).origin)throw new Error("ORIGIN_NOT_ALLOWED");
}
async function limit(key:string,max=5) {
 const row=await fiscalPool().query<{attempts:number}>(
  "INSERT INTO fiscal_auth_limits(key_hash,window_start,attempts) VALUES($1,now(),1) ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN fiscal_auth_limits.window_start < now()-interval '15 minutes' THEN 1 ELSE fiscal_auth_limits.attempts+1 END,window_start=CASE WHEN fiscal_auth_limits.window_start < now()-interval '15 minutes' THEN now() ELSE fiscal_auth_limits.window_start END RETURNING attempts",
  [hash(key)]);
 if((row.rows[0]?.attempts??max+1)>max)throw new Error("AUTH_RATE_LIMITED");
}
export async function registerFiscal(input:{email:string;password:string;legalName:string;vatNumber:string}) {
 if(process.env.FISCAL_REGISTRATION_ENABLED!=="true")throw new Error("REGISTRATION_NOT_OPEN");
 const email=emailValue(input.email),legalName=input.legalName.trim(),vatNumber=input.vatNumber.trim();
 if(legalName.length<2||legalName.length>240||!/^[0-9]{9}$/.test(vatNumber))throw new Error("INVALID_ORGANIZATION");
 await limit("register:"+email,3);
 const stored=passwordHash(input.password);
 const db=await fiscalPool().connect();
 try {
  await db.query("BEGIN");
  const user=await db.query<{id:string}>("INSERT INTO fiscal_users(email,password_hash,role) VALUES($1,$2,'merchant') RETURNING id",[email,stored]);
  const org=await db.query<{id:string}>("INSERT INTO fiscal_organizations(legal_name,vat_number) VALUES($1,$2) RETURNING id",[legalName,vatNumber]);
  await db.query("INSERT INTO fiscal_memberships(organization_id,user_id,role) VALUES($1,$2,'owner')",[org.rows[0].id,user.rows[0].id]);
  await db.query("INSERT INTO fiscal_audit_events(actor_kind,actor_ref,organization_id,action) VALUES('merchant',$1,$2,'registration.submitted')",[user.rows[0].id,org.rows[0].id]);
  await db.query("COMMIT");
  return {pendingReview:true};
 }catch(error) {
  await db.query("ROLLBACK");
  if((error as {code?:string}).code==="23505")throw new Error("ACCOUNT_ALREADY_EXISTS");
  throw error;
 }finally{db.release();}
}
export async function loginFiscal(emailInput:string,password:string) {
 const email=emailValue(emailInput);
 await limit("login:"+email);
 const result=await fiscalPool().query<{id:string;email:string;role:FiscalRole;password_hash:string}>(
  "SELECT id,email,role,password_hash FROM fiscal_users WHERE email=$1 AND disabled_at IS NULL LIMIT 1",[email]);
 const user=result.rows[0];
 const dummy="scrypt-v1:"+("0".repeat(48))+":"+("0".repeat(128));
 const valid=verifyPassword(password,user?.password_hash??dummy);
 if(!user||!valid)throw new Error("INVALID_CREDENTIALS");
 const token=randomBytes(32).toString("hex"),csrf=randomBytes(32).toString("hex");
 await fiscalPool().query("INSERT INTO fiscal_sessions(token_hash,csrf_hash,user_id,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')",[hash(token),hash(csrf),user.id]);
 const jar=await cookies();
 const options={path:"/",sameSite:"strict" as const,secure:process.env.NODE_ENV==="production",maxAge:TTL_SECONDS};
 jar.set(SESSION_COOKIE,token,{...options,httpOnly:true});
 jar.set(CSRF_COOKIE,csrf,{...options,httpOnly:true});
 return {role:user.role};
}
export async function getFiscalActor():Promise<FiscalActor|undefined> {
 if(!fiscalDatabaseConfigured())return undefined;
 const token=(await cookies()).get(SESSION_COOKIE)?.value;
 if(!token||!/^[a-f0-9]{64}$/.test(token))return undefined;
 const result=await fiscalPool().query<{id:string;email:string;role:FiscalRole;csrf_hash:string}>(
  "SELECT u.id,u.email,u.role,s.csrf_hash FROM fiscal_sessions s JOIN fiscal_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.disabled_at IS NULL LIMIT 1",[hash(token)]);
 const row=result.rows[0];
 return row?{id:row.id,email:row.email,role:row.role,csrfHash:row.csrf_hash}:undefined;
}
export async function fiscalCsrfValue():Promise<string|undefined> {
 return (await cookies()).get(CSRF_COOKIE)?.value;
}
export function assertFiscalCsrf(actor:FiscalActor,token:string|null) {
 if(!token||!/^[a-f0-9]{64}$/.test(token)||!match(hash(token),actor.csrfHash))throw new Error("CSRF_FAILED");
}
export async function logoutFiscal() {
 const jar=await cookies(),token=jar.get(SESSION_COOKIE)?.value;
 if(token&&/^[a-f0-9]{64}$/.test(token)&&fiscalDatabaseConfigured())
  await fiscalPool().query("UPDATE fiscal_sessions SET revoked_at=now() WHERE token_hash=$1",[hash(token)]);
 jar.delete(SESSION_COOKIE);jar.delete(CSRF_COOKIE);
}
export async function fiscalMerchantAccounts(actor:FiscalActor) {
 const res=await fiscalPool().query<{id:string;legal_name:string;vat_number:string;status:string;role:string}>(
  "SELECT o.id,o.legal_name,o.vat_number,o.status,m.role FROM fiscal_memberships m JOIN fiscal_organizations o ON o.id=m.organization_id WHERE m.user_id=$1 ORDER BY o.created_at DESC LIMIT 30",[actor.id]);
 return res.rows;
}
export async function fiscalAdminActor():Promise<FiscalAdminActor|undefined> {
 if(process.env.FISCAL_STANDALONE_MODE==="true"){
  if(fiscalDatabaseConfigured()){
   const federated=await getFiscalSsoAdmin();
   if(federated)return {kind:"marketplace_super_admin",...federated};
  }
 }else{
  // Transitional embedded dashboard still honors existing marketplace session.
  const superAdmin=await getAdminSession();
  if(superAdmin?.roles.includes("super_admin")&&!superAdmin.vendorId)
   return {kind:"marketplace_super_admin",id:superAdmin.userId,email:superAdmin.email,csrfToken:superAdmin.csrfToken};
 }
 const actor=await getFiscalActor();
 if(actor?.role!=="fiscal_admin")return undefined;
 const csrf=await fiscalCsrfValue();
 return csrf&&match(hash(csrf),actor.csrfHash) ? {kind:"fiscal_admin",id:actor.id,email:actor.email,csrfToken:csrf}:undefined;
}
export async function requireFiscalAdmin(request:Request) {
 const actor=await fiscalAdminActor();
 if(!actor)throw new Error("FISCAL_ADMIN_AUTH_REQUIRED");
 const supplied=request.headers.get("x-csrf-token");
 if(actor.kind==="marketplace_super_admin"&&process.env.FISCAL_STANDALONE_MODE!=="true") {
  const original=await getAdminSession();
  if(!original)throw new Error("ADMIN_SESSION_EXPIRED");
  assertAdminCsrf(original,supplied??undefined);
 }else if(!supplied||!match(supplied,actor.csrfToken))throw new Error("CSRF_FAILED");
 return actor;
}
export async function fiscalAdminOverview() {
 const [accounts,counts,users]=await Promise.all([
  fiscalPool().query<{id:string;legal_name:string;vat_number:string;status:string;created_at:Date}>(
   "SELECT id,legal_name,vat_number,status,created_at FROM fiscal_organizations ORDER BY created_at DESC LIMIT 40"),
  fiscalPool().query<{status:string;count:string}>("SELECT status,count(*)::text AS count FROM fiscal_organizations GROUP BY status"),
  fiscalPool().query<{count:string}>("SELECT count(*)::text AS count FROM fiscal_users")
 ]);
 return {accounts:accounts.rows,counts:counts.rows,users:Number(users.rows[0]?.count??0)};
}
