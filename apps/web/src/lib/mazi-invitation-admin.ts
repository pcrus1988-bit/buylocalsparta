import type {SessionPrincipal} from "@buy-local-sparta/core";
import {getAdminPostgresRuntime} from "./postgres-runtime";
import {marketplaceMaziActor} from "./mazi-superadmin";

const AUTH_PROJECT_URL="https://eemihhfreggbigxejjhj.supabase.co";
const CALLBACK="https://mazi.kontamou.site/auth/callback";
export type MaziInviteStatus="pending_delivery"|"email_sent"|"delivery_failed"|"consumed"|"revoked";

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

async function sendVerifiedAuthInvitation(email:string){
 const key=process.env.MAZI_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
 const url=process.env.MAZI_SUPABASE_URL || process.env.SUPABASE_URL;
 // Intentional independent project binding: never invite via a different
 // project's Auth account, including the separate FISCAL project.
 if(!key||url!==AUTH_PROJECT_URL)throw Error("MAZI_AUTH_DELIVERY_NOT_CONFIGURED");
 const endpoint=new URL("/auth/v1/invite",AUTH_PROJECT_URL);
 endpoint.searchParams.set("redirect_to",CALLBACK);
 const response=await fetch(endpoint.toString(),{
  method:"POST",cache:"no-store",
  headers:{"Content-Type":"application/json",apikey:key,authorization:`Bearer ${key}`},
  body:JSON.stringify({email}),
  signal:AbortSignal.timeout(9000)
 });
 if(!response.ok)throw Error("MAZI_AUTH_INVITE_PROVIDER_FAILED");
 // Do not persist or log provider tokens/user metadata in the marketplace.
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
  const res=await conn.query<{
   id:string;status:string;contact_email:string;gemi_number:string|null;
   registry_legal_name:string|null;registry_lookup_status:string;
   reviewed_by:string|null;registry_checked_at:Date|null;
   representation_verified_at:Date|null;business_contact_verified_at:Date|null;
   company_active_verified_at:Date|null;
  }>(`
   SELECT id::text,status,contact_email,gemi_number,registry_legal_name,
     registry_lookup_status,reviewed_by::text,registry_checked_at,
     representation_verified_at,business_contact_verified_at,company_active_verified_at
   FROM public.mazi_interest_applications
   WHERE id=$1::uuid FOR UPDATE
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
  await sendVerifiedAuthInvitation(record.email);
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
    '{"provider":"supabase_auth_invite"}'::jsonb)
  `,[actorId,record.id]);
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
