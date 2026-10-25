import type {SessionPrincipal} from "@buy-local-sparta/core";
import {getAdminPostgresRuntime} from "./postgres-runtime";
import {marketplaceMaziActor} from "./mazi-superadmin";

const AUTH_PROJECT_URL="https://eemihhfreggbigxejjhj.supabase.co";
const CALLBACK="https://mazi.kontamou.site/auth/callback";
export type MaziInviteStatus="pending_delivery"|"email_sent"|"delivery_failed"|"consumed"|"revoked";

/** Read-only preflight for the Super Admin, matching the invitation's fail-closed gates. */
export type MaziInvitationPreflight=Readonly<{
 authConfigured:boolean;authEmailVerified:boolean;legalVerified:boolean;financeLocked:boolean;
}>;
export async function maziInvitationPreflight(principal:SessionPrincipal):Promise<MaziInvitationPreflight>{
 await marketplaceMaziActor(principal);
 const {rows}=await getAdminPostgresRuntime().nativePool.query<{
  auth_email_verified:boolean;legal_verified:boolean;finance_locked:boolean;
 }>(`
 SELECT
  (SELECT decision='verified' FROM public.mazi_launch_gate_reviews
   WHERE gate_key='auth_email_delivery' ORDER BY recorded_at DESC,id DESC LIMIT 1) IS TRUE
    AS auth_email_verified,
  (SELECT decision='verified' FROM public.mazi_launch_gate_reviews
   WHERE gate_key='legal_and_retention' ORDER BY recorded_at DESC,id DESC LIMIT 1) IS TRUE
    AS legal_verified,
  (
   (SELECT count(*)=0 FROM public.mazi_fund_ledger)
   AND (SELECT count(*)=0 FROM public.mazi_grant_award_offers)
   AND (SELECT count(*)=0 FROM public.mazi_cycles WHERE finance_activated OR funding_budget_cents<>0)
   AND (SELECT count(*)=1 FROM public.mazi_cycles
       WHERE slug='founding-needs-2026' AND kind='needs_assessment'
        AND NOT finance_activated AND funding_budget_cents=0)
  ) AS finance_locked
 `);
 const row=rows[0];
 if(!row)throw Error("MAZI_INVITATION_PREFLIGHT_UNAVAILABLE");
 return {
  authConfigured:Boolean(
   (process.env.MAZI_SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY) &&
   (process.env.MAZI_SUPABASE_URL||process.env.SUPABASE_URL)===AUTH_PROJECT_URL),
  authEmailVerified:row.auth_email_verified===true,
  legalVerified:row.legal_verified===true,
  financeLocked:row.finance_locked===true
 };
}


export async function maziInvitationStates(principal:SessionPrincipal){
 await marketplaceMaziActor(principal);
 const result=await getAdminPostgresRuntime().nativePool.query<{
   interest_id:string;id:string;status:MaziInviteStatus;
   issued_at:Date;expires_at:Date;emailed_at:Date|null;consumed_at:Date|null;
 }>(`
  SELECT DISTINCT ON (interest_id) interest_id::text,id::text,status,
    issued_at,expires_at,emailed_at,consumed_at
  FROM public.mazi_invitations
  ORDER BY interest_id,issued_at DESC LIMIT 200
 `);
 return result.rows;
}

type InviteProviderMethod="supabase_auth_invite"|"existing_auth_email_otp";
/**
 * One authorized email to the independently reviewed business contact.
 * Auth Admin invite only creates an Auth user for NEW addresses; confirmed
 * preexisting accounts get a login link with create_user=false instead.
 * Nothing here creates MAZI membership, which requires the SQL acceptance RPC.
 */
async function sendVerifiedAuthInvitation(email:string):Promise<InviteProviderMethod>{
 const key=process.env.MAZI_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
 const url=process.env.MAZI_SUPABASE_URL || process.env.SUPABASE_URL;
 // Never invite from a different Auth project or expose service credentials.
 if(!key||url!==AUTH_PROJECT_URL)throw Error("MAZI_AUTH_DELIVERY_NOT_CONFIGURED");
 const headers={"Content-Type":"application/json",apikey:key,authorization:`Bearer ${key}`};
 const endpoint=new URL("/auth/v1/invite",AUTH_PROJECT_URL);
 endpoint.searchParams.set("redirect_to",CALLBACK);
 const response=await fetch(endpoint.toString(),{
  method:"POST",cache:"no-store",headers,
  body:JSON.stringify({email}),
  signal:AbortSignal.timeout(9000)
 });
 if(response.ok)return "supabase_auth_invite";

 // Never fall back on SMTP/auth/rate-limit/permission errors. Only the
 // provider's explicitly identified already-existing account is eligible.
 if(response.status!==400&&response.status!==422)
  throw Error("MAZI_AUTH_INVITE_PROVIDER_FAILED");
 const failure:unknown=await response.json().catch(()=>null);
 const errorCode=(failure&&typeof failure==="object"&&
  ("code" in failure || "error_code" in failure))
   ? String(("code" in failure?failure.code:failure.error_code)||""):"";
 if(!["email_exists","user_already_exists"].includes(errorCode))
  throw Error("MAZI_AUTH_INVITE_PROVIDER_FAILED");

 const existing=new URL("/auth/v1/otp",AUTH_PROJECT_URL);
 existing.searchParams.set("redirect_to",CALLBACK);
 const accepted=await fetch(existing.toString(),{
  method:"POST",cache:"no-store",headers,
  body:JSON.stringify({email,create_user:false}),
  signal:AbortSignal.timeout(9000)
 });
 if(!accepted.ok)throw Error("MAZI_EXISTING_AUTH_LOGIN_FAILED");
 return "existing_auth_email_otp";
}

export async function issueMaziInvitation(principal:SessionPrincipal,interestId:string,retryReason?:string):Promise<"sent"|"delivery_failed">{
 const actorId=await marketplaceMaziActor(principal);
 if(!/^[a-f0-9-]{36}$/i.test(interestId))throw Error("MAZI_INVITATION_INVALID");
 // Fail before writing if the Auth project is not securely configured.
 if((process.env.MAZI_SUPABASE_URL || process.env.SUPABASE_URL)!==AUTH_PROJECT_URL||
    !(process.env.MAZI_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY))
   throw Error("MAZI_INVITATION_DELIVERY_NOT_READY");
 const pool=getAdminPostgresRuntime().nativePool;
 const conn=await pool.connect();
 let record:{id:string;email:string}|null=null;
 try{
  await conn.query("BEGIN");
  // Public release is not implied by a successful database migration.
  // Auth SMTP/redirect and counsel/privacy checks must both have explicit,
  // latest verified Super Admin reviews before ANY personal email is issued.
  // The consenting-business E2E gate necessarily follows the first invite.
  const gateCheck=await conn.query<{ready:boolean}>(`
   SELECT NOT EXISTS (
    SELECT 1 FROM (VALUES
      ('auth_email_delivery'::text),('legal_and_retention'::text)
    ) required(gate_key)
    LEFT JOIN LATERAL (
      SELECT decision FROM public.mazi_launch_gate_reviews r
      WHERE r.gate_key=required.gate_key
      ORDER BY r.recorded_at DESC,r.id DESC LIMIT 1
    ) latest ON true
    WHERE latest.decision IS DISTINCT FROM 'verified'
   ) AS ready
  `);
  if(gateCheck.rows[0]?.ready!==true)
   throw Error("MAZI_INVITATION_RELEASE_NOT_VERIFIED");
  const financeCheck=await conn.query<{safe:boolean}>(`
   SELECT
    (SELECT count(*)=0 FROM public.mazi_fund_ledger)
    AND (SELECT count(*)=0 FROM public.mazi_grant_award_offers)
    AND (SELECT count(*)=0 FROM public.mazi_cycles
         WHERE finance_activated OR funding_budget_cents<>0)
    AND (SELECT count(*)=1 FROM public.mazi_cycles
         WHERE slug='founding-needs-2026' AND kind='needs_assessment'
           AND NOT finance_activated AND funding_budget_cents=0) AS safe
  `);
  if(financeCheck.rows[0]?.safe!==true)
   throw Error("MAZI_FINANCIAL_LOCK_NOT_VERIFIED");
  const res=await conn.query<{
   id:string;status:string;contact_email:string;gemi_number:string|null;
   registry_legal_name:string|null;registry_lookup_status:string;
   reviewed_by:string|null;registry_checked_at:Date|null;
   representation_verified_at:Date|null;business_contact_verified_at:Date|null;
   company_active_verified_at:Date|null;
  }>(`
   SELECT i.id::text,i.status,i.contact_email,
     COALESCE(r.gemi_number,i.gemi_number) AS gemi_number,
     COALESCE(r.legal_name,i.registry_legal_name) AS registry_legal_name,
     CASE WHEN r.id IS NOT NULL THEN 'matched' ELSE i.registry_lookup_status END AS registry_lookup_status,
     i.reviewed_by::text,
     COALESCE(r.checked_at,i.registry_checked_at) AS registry_checked_at,
     i.representation_verified_at,i.business_contact_verified_at,i.company_active_verified_at
   FROM public.mazi_interest_applications i
   LEFT JOIN LATERAL (
    SELECT id,gemi_number,legal_name,checked_at
    FROM public.mazi_interest_registry_rechecks
    WHERE interest_id=i.id ORDER BY checked_at DESC,id DESC LIMIT 1
   ) r ON true
   WHERE i.id=$1::uuid FOR UPDATE OF i
  `,[interestId]);
  const app=res.rows[0];
  if(!app||app.status!=="approved_pending_invite"
   ||app.registry_lookup_status!=="matched"||!app.gemi_number
   ||!app.registry_legal_name||app.registry_legal_name.trim().length<3
   ||!app.reviewed_by||!app.registry_checked_at
   ||Date.now()-new Date(app.registry_checked_at).getTime()>7*86400000
   ||!app.representation_verified_at||!app.business_contact_verified_at
   ||!app.company_active_verified_at)
   throw Error("MAZI_INVITATION_BUSINESS_NOT_VERIFIED");

  const last=await conn.query<{status:MaziInviteStatus}>(`
   SELECT status FROM public.mazi_invitations
   WHERE interest_id=$1::uuid
   ORDER BY issued_at DESC LIMIT 1 FOR UPDATE
  `,[interestId]);
  if(last.rows[0]?.status==="pending_delivery"||last.rows[0]?.status==="email_sent")
    throw Error("MAZI_INVITATION_ALREADY_ACTIVE");
  if(last.rows[0]?.status==="consumed")throw Error("MAZI_INVITATION_ALREADY_CONSUMED");
  if(last.rows[0]?.status==="delivery_failed" &&
     (!retryReason||retryReason.trim().length<20||retryReason.trim().length>1000))
    throw Error("MAZI_INVITATION_PROVIDER_RECONCILIATION_REQUIRED");
  const existing=await conn.query<{present:boolean}>(`
   SELECT EXISTS(SELECT 1 FROM public.mazi_members m
    WHERE left(m.gemi_number,9)=left($1,9)) AS present
  `,[app.gemi_number]);
  if(existing.rows[0]?.present)throw Error("MAZI_LEGAL_ENTITY_ALREADY_MEMBER");
  const invited=await conn.query<{id:string;email:string}>(`
   INSERT INTO public.mazi_invitations (
    interest_id,recipient_email,recipient_gemi_number,issued_by,expires_at
   ) VALUES ($1::uuid,lower(btrim($2)),$3,$4::uuid,now()+interval '45 minutes')
   RETURNING id::text,recipient_email AS email
  `,[interestId,app.contact_email,app.gemi_number,actorId]);
  record=invited.rows[0];
  await conn.query(`
   INSERT INTO public.mazi_audit_events(marketplace_actor_user_id,entity_type,
     entity_id,action,evidence)
   VALUES($1::uuid,'membership_invitation',$2::uuid,'issued',
      jsonb_build_object('authority','konta_moy_super_admin',
        'verified_interest_id',$3::text,'billing_active',false,
        'retry_after_failure_review',$4::text))
  `,[actorId,record.id,interestId,retryReason?.trim()||null]);
  await conn.query("COMMIT");
 }catch(err){await conn.query("ROLLBACK").catch(()=>{});throw err;}
 finally{conn.release();}
 if(!record)throw Error("MAZI_INVITATION_NOT_CREATED");

 // One external email invitation after the persisted approval. If provider
 // delivery fails, record a terminal failure; never pretend it was sent.
 try{
  const providerMethod=await sendVerifiedAuthInvitation(record.email);
  const updated=await pool.query(`
   UPDATE public.mazi_invitations SET status='email_sent',emailed_at=now()
   WHERE id=$1::uuid AND status='pending_delivery'
   RETURNING id
  `,[record.id]);
  if(updated.rowCount!==1)throw Error("MAZI_INVITATION_STATUS_UNCERTAIN");
  await pool.query(`
   INSERT INTO public.mazi_audit_events(marketplace_actor_user_id,entity_type,
    entity_id,action,evidence)
   VALUES($1::uuid,'membership_invitation',$2::uuid,'email_sent',
    jsonb_build_object('provider','supabase_auth','method',$3::text))
  `,[actorId,record.id,providerMethod]);
  return "sent";
 }catch{
  await pool.query(`
    UPDATE public.mazi_invitations
    SET status='delivery_failed',last_delivery_error='provider_or_confirmation_unavailable'
    WHERE id=$1::uuid AND status='pending_delivery'
  `,[record.id]).catch(()=>{});
  return "delivery_failed";
 }
}

/**
 * Explicitly revoke a pending or already emailed invitation. Provider links
 * may remain clickable but the PostgreSQL admission gate rejects revocation.
 * Never automatically revoke, resend or delete accepted acknowledgements.
 */
export async function revokeMaziInvitation(
 principal:SessionPrincipal,interestId:string,invitationId:string,reason:string
):Promise<void>{
 const actorId=await marketplaceMaziActor(principal);
 if(!/^[a-f0-9-]{36}$/i.test(interestId)||!/^[a-f0-9-]{36}$/i.test(invitationId)||
    reason.trim().length<20||reason.trim().length>1000)
  throw Error("MAZI_INVITATION_REVOCATION_INVALID");
 const pool=getAdminPostgresRuntime().nativePool;
 const conn=await pool.connect();
 try{
  await conn.query("BEGIN");
  const current=await conn.query<{id:string;status:MaziInviteStatus}>(`
    SELECT id::text,status FROM public.mazi_invitations
    WHERE id=$1::uuid AND interest_id=$2::uuid FOR UPDATE
  `,[invitationId,interestId]);
  if(!current.rows[0]||!["pending_delivery","email_sent"].includes(current.rows[0].status))
   throw Error("MAZI_INVITATION_NOT_REVOCABLE");
  await conn.query(`
    UPDATE public.mazi_invitations SET status='revoked'
    WHERE id=$1::uuid AND status IN ('pending_delivery','email_sent')
  `,[invitationId]);
  await conn.query(`
   INSERT INTO public.mazi_audit_events(marketplace_actor_user_id,entity_type,
     entity_id,action,evidence)
   VALUES($1::uuid,'membership_invitation',$2::uuid,'revoked',
     jsonb_build_object('reason',$3::text,'authority','konta_moy_super_admin'))
  `,[actorId,invitationId,reason.trim()]);
  await conn.query("COMMIT");
 }catch(error){await conn.query("ROLLBACK").catch(()=>{});throw error;}
 finally{conn.release();}
}
