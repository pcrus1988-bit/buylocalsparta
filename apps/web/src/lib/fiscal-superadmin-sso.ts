import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { fiscalPool } from "./fiscal-runtime";

const TOKEN_COOKIE="km_fiscal_superadmin_sso";
const CSRF_COOKIE="km_fiscal_superadmin_csrf";
const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
const safeEqual=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const ssoTtlMs=2*60*60*1000;
const ticketTtlMs=60*1000;

function secret():Buffer {
  const value=process.env.FISCAL_SUPERADMIN_SSO_SECRET?.trim();
  if(!value||value.length<48)throw new Error("FISCAL_SSO_SECRET_REQUIRED");
  return Buffer.from(value,"utf8");
}
function target():URL {
  const configured=process.env.FISCAL_SERVICE_BASE_URL?.trim();
  if(!configured)throw new Error("FISCAL_SERVICE_BASE_URL_REQUIRED");
  const url=new URL(configured);
  if(url.protocol!=="https:"||url.username||url.password||url.hash||url.search||url.pathname!=="/")
    throw new Error("FISCAL_SSO_TARGET_MUST_BE_HTTPS_ORIGIN");
  return url;
}
type Ticket=Readonly<{v:1;aud:string;iss:string;userId:string;email:string;iat:number;exp:number;jti:string;scope:"fiscal:superadmin"}>;
const sign=(encoded:string)=>createHmac("sha256",secret()).update("km-fiscal-sso-v1:"+encoded).digest("base64url");

export function issueFiscalSsoTicket(input:{userId:string;email:string}):{ticket:string;targetUrl:string} {
  const now=Date.now(),destination=target();
  const ticket:Ticket={
    v:1, aud:destination.origin,iss:"konta-moy-marketplace",
    userId:input.userId,email:input.email,iat:now,exp:now+ticketTtlMs,
    jti:randomBytes(32).toString("base64url"),scope:"fiscal:superadmin"
  };
  if(!/^[A-Za-z0-9_-]{5,160}$/.test(ticket.userId)||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ticket.email))
    throw new Error("FISCAL_SSO_IDENTITY_INVALID");
  const encoded=Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return {ticket:encoded+"."+sign(encoded),targetUrl:new URL("/timologio-admin/sso/callback",destination).toString()};
}
export function parseFiscalSsoTicket(source:string,requestOrigin:string):Ticket {
  if(typeof source!=="string"||source.length>2500)throw new Error("FISCAL_SSO_TICKET_INVALID");
  const [encoded,supplied,...extra]=source.split(".");
  if(!encoded||!supplied||extra.length||!safeEqual(sign(encoded),supplied))
    throw new Error("FISCAL_SSO_SIGNATURE_INVALID");
  let token:Ticket;
  try{token=JSON.parse(Buffer.from(encoded,"base64url").toString("utf8")) as Ticket;}
  catch{throw new Error("FISCAL_SSO_TICKET_INVALID");}
  const now=Date.now();
  if(token.v!==1||token.scope!=="fiscal:superadmin"||token.iss!=="konta-moy-marketplace"||
     token.aud!==target().origin||token.aud!==requestOrigin||
     !Number.isSafeInteger(token.iat)||!Number.isSafeInteger(token.exp)||
     token.iat>now+5000||token.exp<=now||token.exp-token.iat>ticketTtlMs||
     !/^[A-Za-z0-9_-]{43}$/.test(token.jti)||
     !/^[A-Za-z0-9_-]{5,160}$/.test(token.userId)||
     typeof token.email!=="string"||token.email.length>254||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(token.email))
    throw new Error("FISCAL_SSO_TICKET_EXPIRED_OR_WRONG_AUDIENCE");
  return token;
}
export async function redeemFiscalSsoTicket(source:string,requestOrigin:string) {
  const ticket=parseFiscalSsoTicket(source,requestOrigin);
  const session=randomBytes(32).toString("hex"),csrf=randomBytes(32).toString("hex");
  const db=await fiscalPool().connect();
  try{
    await db.query("BEGIN");
    // PK prevents a valid assertion from being redeemed twice, even concurrently.
    await db.query("INSERT INTO fiscal_superadmin_sso_tickets(jti_hash,marketplace_user_id,expires_at) VALUES($1,$2,to_timestamp($3/1000.0))",
      [hash(ticket.jti),ticket.userId,ticket.exp]);
    await db.query("INSERT INTO fiscal_superadmin_sessions(token_hash,csrf_hash,marketplace_user_id,marketplace_email,expires_at) VALUES($1,$2,$3,$4,now()+interval '2 hours')",
      [hash(session),hash(csrf),ticket.userId,ticket.email]);
    await db.query("INSERT INTO fiscal_audit_events(actor_kind,actor_ref,action,details) VALUES('marketplace_super_admin',$1,'sso.session_started',$2::jsonb)",
      [ticket.userId,JSON.stringify({method:"signed_one_time_assertion"})]);
    await db.query("COMMIT");
  }catch(e){await db.query("ROLLBACK").catch(()=>undefined);throw e;}
  finally{db.release();}
  const jar=await cookies();
  const opts={sameSite:"strict" as const,secure:true,httpOnly:true,path:"/",maxAge:Math.floor(ssoTtlMs/1000)};
  jar.set(TOKEN_COOKIE,session,opts);
  jar.set(CSRF_COOKIE,csrf,opts);
}
export async function getFiscalSsoAdmin():Promise<{id:string;email:string;csrfToken:string}|undefined>{
  const jar=await cookies(),value=jar.get(TOKEN_COOKIE)?.value,csrf=jar.get(CSRF_COOKIE)?.value;
  if(!value||!/^[a-f0-9]{64}$/.test(value)||!csrf||!/^[a-f0-9]{64}$/.test(csrf))return undefined;
  const row=await fiscalPool().query<{marketplace_user_id:string;marketplace_email:string;csrf_hash:string}>(
    "SELECT marketplace_user_id,marketplace_email,csrf_hash FROM fiscal_superadmin_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now() LIMIT 1",[hash(value)]);
  const user=row.rows[0];
  if(!user||!safeEqual(hash(csrf),user.csrf_hash))return undefined;
  return {id:user.marketplace_user_id,email:user.marketplace_email,csrfToken:csrf};
}
export async function revokeFiscalSsoSession(){
  const jar=await cookies(),token=jar.get(TOKEN_COOKIE)?.value;
  if(token&&/^[a-f0-9]{64}$/.test(token))
    await fiscalPool().query("UPDATE fiscal_superadmin_sessions SET revoked_at=now() WHERE token_hash=$1",[hash(token)]);
  jar.delete(TOKEN_COOKIE);jar.delete(CSRF_COOKIE);
}
