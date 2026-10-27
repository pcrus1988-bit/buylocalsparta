import {createHash} from "node:crypto";
import {getAdminPostgresRuntime} from "./postgres-runtime";

const AUTH_PROJECT_URL="https://eemihhfreggbigxejjhj.supabase.co";
const FIXED_MAZI_CALLBACK="https://mazi.kontamou.site/auth/callback";
const MAX_EMAIL_BYTES=254;
const COOLDOWN_SECONDS=180;

/** Send a secure Supabase magic-link verification hash through the existing
 * KONTA MOY Resend service. Supabase Auth's SITE_URL is NOT trusted.
 * A 'magiclink' admin link can create a user, therefore check that the user
 * already exists and is independently admitted/approved BEFORE calling it.
 */
export async function sendMaziExistingAccountResendLogin(rawEmail:string):Promise<
 "sent"|"not_eligible"|"throttled"|"unavailable">{
 const email=rawEmail.trim().toLowerCase();
 if(email.length<5||email.length>MAX_EMAIL_BYTES||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  return "not_eligible";
 const url=process.env.MAZI_SUPABASE_URL||process.env.SUPABASE_URL;
 const serviceKey=process.env.MAZI_SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 const resendKey=process.env.RESEND_API_KEY;
 if(url!==AUTH_PROJECT_URL||!serviceKey||!resendKey)return "unavailable";
 const pool=getAdminPostgresRuntime().nativePool;
 // Normalize and hash; never persist an address in the anti-abuse ledger.
 const digest=createHash("sha256").update(email).digest("hex");
 const conn=await pool.connect();
 let requestId:string;
 try{
  await conn.query("BEGIN");
  await conn.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)",[digest]);
  const found=await conn.query<{eligible:boolean}>(`
   SELECT EXISTS(
    SELECT 1 FROM auth.users u
    WHERE lower(u.email)=lower($1) AND u.email_confirmed_at IS NOT NULL
    AND (
      EXISTS(
       SELECT 1 FROM public.mazi_interest_applications a
       WHERE lower(a.contact_email)=lower(u.email)
         AND a.status='approved_pending_invite'
         AND a.representation_verified_at IS NOT NULL
         AND a.business_contact_verified_at IS NOT NULL
         AND a.company_active_verified_at IS NOT NULL
      )
      OR EXISTS(
       SELECT 1 FROM public.mazi_members m WHERE m.user_id=u.id
         AND m.status='verified'
      )
    )
   ) AS eligible
  `,[email]);
  if(found.rows[0]?.eligible!==true){
   await conn.query("COMMIT");
   return "not_eligible";
  }
  const recent=await conn.query<{latest:Date|null;daily:string}>(`
   SELECT max(requested_at) AS latest,
     count(*) FILTER (WHERE requested_at>now()-interval '24 hours')::text AS daily
   FROM public.mazi_passwordless_email_attempts
   WHERE recipient_digest=$1
  `,[digest]);
  const latest=recent.rows[0]?.latest;
  if((latest&&Date.now()-new Date(latest).getTime()<COOLDOWN_SECONDS*1000)||
     Number(recent.rows[0]?.daily??"0")>=5){
   await conn.query("COMMIT");
   return "throttled";
  }
  const inserted=await conn.query<{id:string}>(`
   INSERT INTO public.mazi_passwordless_email_attempts(recipient_digest)
   VALUES($1) RETURNING id::text
  `,[digest]);
  requestId=inserted.rows[0].id;
  await conn.query("COMMIT");
 }catch(err){
  await conn.query("ROLLBACK").catch(()=>{});
  throw err;
 }finally{conn.release();}
 let sent=false;
 // Report only the failing transport stage and numeric HTTP status. Never log
 // provider response bodies, email addresses, token hashes, or credentials.
 let deliveryStage:"auth_generate"|"auth_payload"|"resend_send"="auth_generate";
 let upstreamStatus=0;
 try{
  const auth=await fetch(AUTH_PROJECT_URL+"/auth/v1/admin/generate_link",{
   method:"POST",cache:"no-store",
   headers:{"content-type":"application/json",apikey:serviceKey,
     authorization:`Bearer ${serviceKey}`},
   body:JSON.stringify({type:"magiclink",email}),
   signal:AbortSignal.timeout(9000)
  });
  upstreamStatus=auth.status;
  if(!auth.ok)throw Error("auth_generate_link_failed");
  deliveryStage="auth_payload";
  upstreamStatus=0;
  const raw:unknown=await auth.json();
  const property=raw&&typeof raw==="object"&&"properties" in raw
   ?(raw as {properties?:{hashed_token?:unknown}}).properties:null;
  const token=property?.hashed_token;
  if(typeof token!=="string"||!/^[a-zA-Z0-9_-]{20,256}$/.test(token))
   throw Error("auth_token_hash_missing");
  const loginUrl=new URL(FIXED_MAZI_CALLBACK);
  loginUrl.searchParams.set("token_hash",token);
  loginUrl.searchParams.set("type","magiclink");
  const textBody=[
   "ΜΑΖΙ · Ασφαλής σύνδεση",
   "Χρησιμοποίησε τον προσωπικό σύνδεσμο για να συνδεθείς:",
   loginUrl.toString(),
   "Αν δεν ζήτησες σύνδεση, αγνόησε αυτό το μήνυμα.",
   "Η σύνδεση δεν δημιουργεί συμμετοχή ούτε ενεργοποιεί πληρωμές."
  ].join("\n\n");
  const htmlBody=`<!doctype html><html lang="el"><body style="background:#f6f4ed;color:#12392f;font-family:Arial,sans-serif;padding:24px">
   <div style="max-width:560px;margin:auto;background:#fff;padding:30px;border-radius:16px">
   <h1 style="font-size:32px;font-weight:400">ΜΑΖΙ.</h1>
   <h2>Ασφαλής σύνδεση</h2>
   <p>Για να συνδεθείς στον λογαριασμό σου, χρησιμοποίησε τον παρακάτω προσωπικό σύνδεσμο.</p>
   <p><a href="${loginUrl.toString()}" style="display:inline-block;background:#143f34;color:white;padding:14px 22px;border-radius:6px">Σύνδεση στο ΜΑΖΙ</a></p>
   <p>Αν δεν ζήτησες σύνδεση, αγνόησε αυτό το email. Ο σύνδεσμος χρησιμοποιείται μόνο μία φορά.</p>
   <small>ΚΟΝΤΑ ΜΟΥ · ΜΑΖΙ | Δεν ενεργοποιεί χρέωση ή δικαίωμα μέλους.</small>
   </div></body></html>`;
  deliveryStage="resend_send";
  const delivery=await fetch("https://api.resend.com/emails",{
   method:"POST",cache:"no-store",
   headers:{"content-type":"application/json",authorization:`Bearer ${resendKey}`,
    "Idempotency-Key":"mazi-login-"+requestId},
   body:JSON.stringify({
    from:"MAZI <mazi@kontamou.site>",to:[email],
    subject:"Ο σύνδεσμος σύνδεσής σου · ΜΑΖΙ",text:textBody,html:htmlBody
   }),
   signal:AbortSignal.timeout(9000)
  });
  upstreamStatus=delivery.status;
  if(!delivery.ok)throw Error("resend_delivery_rejected");
  sent=true;
 }catch{
  // Deliberately don't log email, token hash or provider payload.
  console.warn("MAZI_AUTH_LOGIN_EMAIL_UNAVAILABLE",{
   stage:deliveryStage,http_status:upstreamStatus||null
  });
 }finally{
  await pool.query(`
   UPDATE public.mazi_passwordless_email_attempts
   SET outcome=$2 WHERE id=$1::bigint AND outcome='requested'
  `,[requestId,sent?"sent":"failed"]).catch(()=>{});
 }
 return sent?"sent":"unavailable";
}
