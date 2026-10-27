import type {SessionPrincipal} from "@buy-local-sparta/core";
import {getAdminPostgresRuntime} from "./postgres-runtime";
import {marketplaceMaziActor} from "./mazi-superadmin";

const AUTH_URL="https://eemihhfreggbigxejjhj.supabase.co";
const AUTH_CALLBACK="https://mazi.kontamou.site/auth/callback";
const PROBE_COOLDOWN_MINUTES=15;

/** Probe only an approved interest whose email belongs to an ALREADY CONFIRMED
 * Supabase Auth user. No email address or login token is accepted from form input.
 * A 2xx only means the Auth provider accepted the attempt, not delivery.
 */
export async function runMaziAuthEmailProbe(
 principal:SessionPrincipal,interestId:string
):Promise<"provider_accepted"|"provider_rejected"|"network_failed">{
 const actor=await marketplaceMaziActor(principal);
 if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(interestId))
   throw Error("MAZI_AUTH_PROBE_INVALID");
 const key=process.env.MAZI_SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 const url=process.env.MAZI_SUPABASE_URL||process.env.SUPABASE_URL;
 if(!key||url!==AUTH_URL)throw Error("MAZI_AUTH_PROBE_NOT_CONFIGURED");
 const pool=getAdminPostgresRuntime().nativePool;
 const conn=await pool.connect();
 let id:string,recipient:string;
 try{
  await conn.query("BEGIN");
  // Serialize the probe for this application; do not risk concurrent sends.
  await conn.query("SELECT pg_advisory_xact_lock(hashtext('mazi-auth-email-probe')::bigint)");
  const q=await conn.query<{email:string}>(`
   SELECT a.contact_email AS email FROM public.mazi_interest_applications a
   JOIN auth.users u ON lower(u.email)=lower(a.contact_email)
     AND u.email_confirmed_at IS NOT NULL
   WHERE a.id=$1::uuid AND a.status='approved_pending_invite'
     AND a.representation_verified_at IS NOT NULL
     AND a.business_contact_verified_at IS NOT NULL
     AND a.company_active_verified_at IS NOT NULL
   LIMIT 1
  `,[interestId]);
  if(!q.rows[0])throw Error("MAZI_AUTH_PROBE_RECIPIENT_NOT_VERIFIED");
  const cooldown=await conn.query<{blocked:boolean}>(`
   SELECT EXISTS(
    SELECT 1 FROM public.mazi_auth_delivery_probes
    WHERE interest_id=$1::uuid AND requested_at > now()-interval '15 minutes'
   ) AS blocked`,[interestId]);
  if(cooldown.rows[0]?.blocked)throw Error("MAZI_AUTH_PROBE_COOLDOWN");
  const inserted=await conn.query<{id:string}>(`
   INSERT INTO public.mazi_auth_delivery_probes(actor_user_id,interest_id)
   VALUES ($1::uuid,$2::uuid) RETURNING id::text`,[actor,interestId]);
  if(!inserted.rows[0])throw Error("MAZI_AUTH_PROBE_NOT_RECORDED");
  id=inserted.rows[0].id;
  recipient=q.rows[0].email;
  await conn.query("COMMIT");
 }catch(error){await conn.query("ROLLBACK").catch(()=>{});throw error;}
 finally{conn.release();}
 let status:"provider_accepted"|"provider_rejected"|"network_failed"="network_failed";
 let code:string|null=null,HTTP:number|null=null;
 try{
  const endpoint=new URL("/auth/v1/otp",AUTH_URL);
  endpoint.searchParams.set("redirect_to",AUTH_CALLBACK);
  const response=await fetch(endpoint.toString(),{
   method:"POST",cache:"no-store",
   headers:{"Content-Type":"application/json",apikey:key,Authorization:`Bearer ${key}`},
   body:JSON.stringify({email:recipient,create_user:false}),
   signal:AbortSignal.timeout(9000)
  });
  HTTP=response.status;
  status=response.ok?"provider_accepted":"provider_rejected";
  if(!response.ok){
   const detail:unknown=await response.json().catch(()=>null);
   const candidate=detail&&typeof detail==="object"
    ?("code" in detail?String(detail.code):"error_code" in detail?String(detail.error_code):"provider_rejected")
    :"provider_rejected";
   code=/^[a-z0-9_]{1,64}$/.test(candidate)?candidate:"provider_rejected";
  }
 }catch{status="network_failed";code="request_unavailable";}
 await pool.query(`
  UPDATE public.mazi_auth_delivery_probes
    SET status=$2,provider_http_status=$3,provider_error_code=$4,completed_at=now()
  WHERE id=$1::bigint AND status='pending'
 `,[id,status,HTTP,code]);
 return status;
}
export type MaziAuthProbeRow={
 id:string;status:"pending"|"provider_accepted"|"provider_rejected"|"network_failed";
 provider_http_status:number|null;provider_error_code:string|null;requested_at:Date;
};
export async function getMaziAuthEmailProbes(principal:SessionPrincipal):Promise<MaziAuthProbeRow[]>{
 await marketplaceMaziActor(principal);
 const result=await getAdminPostgresRuntime().nativePool.query<MaziAuthProbeRow>(`
  SELECT id::text,status,provider_http_status,provider_error_code,requested_at
  FROM public.mazi_auth_delivery_probes ORDER BY requested_at DESC,id DESC LIMIT 8
 `);
 return result.rows;
}
