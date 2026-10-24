import type {SessionPrincipal} from "@buy-local-sparta/core";
import {getAdminPostgresRuntime} from "./postgres-runtime";
import {marketplaceMaziActor} from "./mazi-superadmin";

export type MaziInterestRow={
 id:string;tax_number:string;gemi_number:string|null;registry_legal_name:string|null;
 registry_company_status:string|null;registry_city:string|null;
 registry_checked_at:Date|null;registry_lookup_status:string;
 representative_name:string;contact_email:string;application_note:string;
 status:string;submitted_at:Date;review_reason:string|null;
 representation_verified_at:Date|null;business_contact_verified_at:Date|null
};
export async function maziInterestReviewQueue(principal:SessionPrincipal){
 await marketplaceMaziActor(principal);
 const data=await getAdminPostgresRuntime().nativePool.query<MaziInterestRow>(`
  SELECT id::text,tax_number,gemi_number,registry_legal_name,registry_company_status,
   registry_city,registry_checked_at,registry_lookup_status,
   representative_name,contact_email,application_note,status,
   submitted_at,review_reason,representation_verified_at,business_contact_verified_at
  FROM public.mazi_interest_applications
  ORDER BY CASE status WHEN 'pending_review' THEN 0 WHEN 'registry_review_required' THEN 1 ELSE 2 END,
   submitted_at ASC LIMIT 100
 `);
 return data.rows;
}
export async function reviewMaziInterest(principal:SessionPrincipal,input:{
 id:string;decision:"approve"|"decline";reason:string;
 representativeVerified:boolean;emailVerified:boolean;companyActiveVerified:boolean
}){
 const actorId=await marketplaceMaziActor(principal);
 const reason=input.reason.trim();
 if(!/^[a-f0-9-]{36}$/i.test(input.id)||reason.length<20||reason.length>1000)
   throw Error("MAZI_INTEREST_DECISION_INVALID");
 const client=await getAdminPostgresRuntime().nativePool.connect();
 try{
  await client.query("BEGIN");
  const row=await client.query<{
   id:string;status:string;tax_number:string;registry_lookup_status:string;gemi_number:string|null;
   registry_checked_at:Date|null
  }>(`
   SELECT id::text,status,tax_number,registry_lookup_status,gemi_number,registry_checked_at
   FROM public.mazi_interest_applications WHERE id=$1::uuid
   FOR UPDATE
  `,[input.id]);
  const app=row.rows[0];
  if(!app||!["pending_review","registry_review_required"].includes(app.status))
   throw Error("MAZI_INTEREST_NOT_REVIEWABLE");
  // A competing anonymous claim may be legitimate. Serialize approvals by
  // AFM so two reviewers cannot approve conflicting representative claims.
  await client.query(`
   SELECT pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended($1::text,39128))
  `,[app.tax_number]);
  if(input.decision==="approve"){
   const pendingOther=await client.query<{present:boolean}>(`
    SELECT EXISTS(SELECT 1 FROM public.mazi_interest_applications
      WHERE tax_number=$1 AND id<>$2::uuid
      AND status='approved_pending_invite') AS present
   `,[app.tax_number,app.id]);
   if(pendingOther.rows[0]?.present)throw Error("MAZI_COMPETING_APPROVED_CLAIM");

   if(app.registry_lookup_status!=="matched"||!app.gemi_number||
     !app.registry_checked_at||
     Date.now()-new Date(app.registry_checked_at).getTime()>7*86400000||
     !input.representativeVerified||!input.emailVerified||!input.companyActiveVerified)
     throw Error("MAZI_INTEREST_VERIFICATION_REQUIRED");
   // A registry match is not proof the applicant has authority. The human
   // reviewer must separately confirm representation and email ownership.
   const duplicate=await client.query<{present:boolean}>(`
    SELECT EXISTS(
      SELECT 1 FROM public.mazi_members m WHERE m.gemi_number=$1 AND m.status='verified'
    ) AS present
   `,[app.gemi_number]);
   if(duplicate.rows[0]?.present)throw Error("MAZI_ALREADY_MEMBER");
  }
  const decision=input.decision==="approve"?"approved_pending_invite":"declined";
  await client.query(`
   UPDATE public.mazi_interest_applications SET
    status=$2,reviewed_at=now(),reviewed_by=$3::uuid,review_reason=$4,
    representation_verified_at=CASE WHEN $2='approved_pending_invite' THEN now() ELSE NULL END,
    business_contact_verified_at=CASE WHEN $2='approved_pending_invite' THEN now() ELSE NULL END,
    company_active_verified_at=CASE WHEN $2='approved_pending_invite' THEN now() ELSE NULL END
   WHERE id=$1::uuid
  `,[app.id,decision,actorId,reason]);
  await client.query(`
   INSERT INTO public.mazi_interest_events(interest_id,action,actor_id,detail)
   VALUES($1::uuid,$2,$3::uuid,$4)
  `,[app.id,input.decision==="approve"?"review_approved":"review_declined",actorId,reason]);
  await client.query("COMMIT");
 }catch(error){
  await client.query("ROLLBACK");
  throw error;
 }finally{client.release();}
}
