import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {parseFiscalSsoTicket} from "./fiscal-superadmin-tickets";
export {issueFiscalSsoTicket} from "./fiscal-superadmin-tickets";
import { cookies } from "next/headers";
import { fiscalPool } from "./fiscal-runtime";

const TOKEN_COOKIE="km_fiscal_superadmin_sso";
const CSRF_COOKIE="km_fiscal_superadmin_csrf";
const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
const safeEqual=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const ssoTtlMs=2*60*60*1000;

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
