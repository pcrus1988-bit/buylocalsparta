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
   (process.env.MAZI_SUPABASE_URL||process.env.SUPABASE_URL)===AUTH_PROJECT_URL &&
   Boolean(process.env.RESEND_API_KEY)),
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

type InviteProviderMethod="resend_magiclink_existing"|"resend_invite_new";
/** Generate a Supabase verification token hash but have Resend deliver a
 * branded MAZI link directly to our fixed callback host. No hosted Auth
 * Site URL or SMTP configuration is involved in transport or redirection.
 * This function is called only after the locked Super Admin invitation
 * transaction and two independent launch gates are verified.
 */
async function sendVerifiedAuthInvitation(email:string):Promise<InviteProviderMethod>{
 const key=process.env.MAZI_SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 const url=process.env.MAZI_SUPABASE_URL||process.env.SUPABASE_URL;
 const resend=process.env.RESEND_API_KEY;
 if(!key||url!==AUTH_PROJECT_URL||!resend)
  throw Error("MAZI_AUTH_DELIVERY_NOT_CONFIGURED");
 const found=await getAdminPostgresRuntime().nativePool.query<{confirmed:boolean}>(`
  SELECT EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=lower($1)
   AND email_confirmed_at IS NOT NULL) AS confirmed
 `,[email]);
 const existing=found.rows[0]?.confirmed===true;
 const type=existing?"magiclink":"invite";
 const generate=await fetch(AUTH_PROJECT_URL+"/auth/v1/admin/generate_link",{
  method:"POST",cache:"no-store",
  headers:{"content-type":"application/json",apikey:key,authorization:`Bearer ${key}`},
  body:JSON.stringify({type,email}),
  signal:AbortSignal.timeout(9000)
 });
 if(!generate.ok)throw Error("MAZI_AUTH_TOKEN_GENERATION_FAILED");
 const payload:unknown=await generate.json();
 const detail=payload&&typeof payload==="object"&&"properties" in payload
  ?(payload as {properties?:{hashed_token?:unknown}}).properties:null;
 // GoTrue /admin/generate_link returns hashed_token at the REST root.
 // Keep the SDK properties shape as compatibility, but never parse action_link
 // (which may point to an incorrect hosted Supabase SITE_URL).
 const topLevel=payload&&typeof payload==="object"&&"hashed_token" in payload
  ?(payload as {hashed_token?:unknown}).hashed_token:null;
 const hash=topLevel??detail?.hashed_token;
 if(typeof hash!=="string"||!/^[a-zA-Z0-9_-]{20,256}$/.test(hash))
  throw Error("MAZI_AUTH_TOKEN_HASH_UNAVAILABLE");
 const callback=new URL(CALLBACK);
 callback.searchParams.set("token_hash",hash);
 callback.searchParams.set("type",type);
 const label=existing?"Σύνδεση στο ΜΑΖΙ":"Αποδοχή πρόσκλησης ΜΑΖΙ";
 const plain=[
  "ΜΑΖΙ · Προσωπική πρόσκληση",
  "Η πρόσκληση προορίζεται αποκλειστικά για την εγκεκριμένη επιχείρηση.",
  callback.toString(),
  "Αν δεν αναγνωρίζεις αυτή την πρόσκληση, αγνόησε το μήνυμα.",
  "Δεν ενεργοποιεί χρέωση, χρηματοδότηση ή δικαίωμα μέλους."
 ].join("\n\n");
 const html=`<!doctype html><html lang="el"><body style="font-family:Arial,sans-serif;background:#f5f2e9;padding:24px">
  <main style="max-width:560px;margin:auto;padding:28px;background:#fff;color:#133b30;border-radius:14px">
  <h1 style="font-size:32px;font-weight:400">ΜΑΖΙ.</h1>
  <h2>Προσωπική πρόσκληση</h2>
  <p>Η επιχείρησή σου έχει εγκριθεί για το επόμενο βήμα. Η αποδοχή απαιτεί ξεχωριστή επιβεβαίωση των όρων.</p>
  <p><a href="${callback.toString()}" style="background:#153d32;color:#fff;padding:14px 20px;display:inline-block;border-radius:6px">${label}</a></p>
  <p>Ο σύνδεσμος είναι προσωπικός και μιας χρήσης. Δεν δημιουργεί αυτομάτως δικαιώματα μέλους.</p>
  </main></body></html>`;
 const sent=await fetch("https://api.resend.com/emails",{
  method:"POST",cache:"no-store",
  headers:{"content-type":"application/json",authorization:`Bearer ${resend}`},
  body:JSON.stringify({
   from:"MAZI <mazi@kontamou.site>",to:[email],
   subject:"Η προσωπική σου πρόσκληση · ΜΑΖΙ",text:plain,html
  }),
  signal:AbortSignal.timeout(9000)
 });
 if(!sent.ok)throw Error("MAZI_RESEND_PROVIDER_FAILED");
 return existing?"resend_magiclink_existing":"resend_invite_new";
}

export async function issueMaziInvitation(principal:SessionPrincipal,interestId:string,retryReason?:string):Promise<"sent"|"delivery_failed">{
 const actorId=await marketplaceMaziActor(principal);
 if(!/^[a-f0-9-]{36}$/i.test(interestId))throw Error("MAZI_INVITATION_INVALID");
 // Fail before writing if the Auth project is not securely configured.
 if((process.env.MAZI_SUPABASE_URL || process.env.SUPABASE_URL)!==AUTH_PROJECT_URL||
    !(process.env.MAZI_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)||
    !process.env.RESEND_API_KEY)
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
