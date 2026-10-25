import type {SessionPrincipal} from "@buy-local-sparta/core";
import {getAdminPostgresRuntime} from "./postgres-runtime";
import {marketplaceMaziActor} from "./mazi-superadmin";
import {recheckOfficialGemiCompanyByNumber} from "./gemi-runtime";

export type MaziInterestRow={
 id:string;tax_number:string;gemi_number:string|null;registry_legal_name:string|null;
 registry_company_status:string|null;registry_city:string|null;
 registry_checked_at:Date|null;registry_lookup_status:string;
 registry_evidence_source:string;
 representative_name:string;contact_email:string;application_note:string;
 status:string;submitted_at:Date;review_reason:string|null;
 representation_verified_at:Date|null;business_contact_verified_at:Date|null
};
export async function maziInterestReviewQueue(principal:SessionPrincipal){
 await marketplaceMaziActor(principal);
 const data=await getAdminPostgresRuntime().nativePool.query<MaziInterestRow>(`
  SELECT i.id::text,i.tax_number,
   COALESCE(r.gemi_number,i.gemi_number) AS gemi_number,
   COALESCE(r.legal_name,i.registry_legal_name) AS registry_legal_name,
   COALESCE(r.company_status,i.registry_company_status) AS registry_company_status,
   COALESCE(r.city,i.registry_city) AS registry_city,
   COALESCE(r.checked_at,i.registry_checked_at) AS registry_checked_at,
   CASE WHEN r.id IS NOT NULL THEN 'matched' ELSE i.registry_lookup_status END AS registry_lookup_status,
   COALESCE(r.source,'application_snapshot') AS registry_evidence_source,
   i.representative_name,i.contact_email,i.application_note,i.status,
   i.submitted_at,i.review_reason,i.representation_verified_at,i.business_contact_verified_at
  FROM public.mazi_interest_applications i
  LEFT JOIN LATERAL (
   SELECT id,gemi_number,legal_name,company_status,city,checked_at,source
   FROM public.mazi_interest_registry_rechecks
   WHERE interest_id=i.id ORDER BY checked_at DESC,id DESC LIMIT 1
  ) r ON true
  ORDER BY CASE i.status WHEN 'pending_review' THEN 0 WHEN 'registry_review_required' THEN 1 ELSE 2 END,
   i.submitted_at ASC LIMIT 100
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
   id:string;status:string;registry_lookup_status:string;gemi_number:string|null;
   registry_checked_at:Date|null
  }>(`
   SELECT i.id::text,i.status,
    CASE WHEN r.id IS NOT NULL THEN 'matched' ELSE i.registry_lookup_status END AS registry_lookup_status,
    COALESCE(r.gemi_number,i.gemi_number) AS gemi_number,
    COALESCE(r.checked_at,i.registry_checked_at) AS registry_checked_at
   FROM public.mazi_interest_applications i
   LEFT JOIN LATERAL (
    SELECT id,gemi_number,checked_at,source
    FROM public.mazi_interest_registry_rechecks
    WHERE interest_id=i.id ORDER BY checked_at DESC,id DESC LIMIT 1
   ) r ON true
   WHERE i.id=$1::uuid FOR UPDATE OF i
  `,[input.id]);
  const app=row.rows[0];
  if(!app||!["pending_review","registry_review_required"].includes(app.status))
   throw Error("MAZI_INTEREST_NOT_REVIEWABLE");
  if(input.decision==="approve"){
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

/**
 * Re-run the official ΓΕΜΗ provider for the immutable application ΑΦΜ.
 * The provider must really answer now; old cache entries never count as new
 * verification. Save the evidence separately, preserving the original intake.
 */
export async function recheckMaziInterestRegistry(principal:SessionPrincipal,id:string):Promise<void>{
 const actor=await marketplaceMaziActor(principal);
 if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id))
  throw Error("MAZI_GEMI_RECHECK_INVALID");
 const runtime=getAdminPostgresRuntime();
 const initial=await runtime.nativePool.query<{
  tax_number:string;gemi_number:string|null;status:string;registry_lookup_status:string;
 }>(`SELECT tax_number,gemi_number,status,registry_lookup_status
     FROM public.mazi_interest_applications WHERE id=$1::uuid`,[id]);
 const original=initial.rows[0];
 if(!original||!["pending_review","registry_review_required"].includes(original.status))
  throw Error("MAZI_INTEREST_NOT_REVIEWABLE");
 // Original mismatched applications cannot be normalized by a recheck alone:
 // their immutable recorded registry identity requires separate evidence review.
 if(original.registry_lookup_status!=="matched"||!original.gemi_number)
  throw Error("MAZI_GEMI_ORIGINAL_MATCH_REQUIRED");
 const checked=await recheckOfficialGemiCompanyByNumber(original.tax_number,original.gemi_number);
 if(checked.lookupStatus!=="matched")
  throw Error("MAZI_GEMI_RECHECK_"+checked.reason.toUpperCase());
 if(checked.gemiNumber!==original.gemi_number||
   checked.taxNumber!==original.tax_number||
   checked.legalName.trim().length<3)
  throw Error("MAZI_GEMI_RECHECK_IDENTITY_MISMATCH");
 const conn=await runtime.nativePool.connect();
 try{
  await conn.query("BEGIN");
  const row=await conn.query<{status:string;tax_number:string;gemi_number:string|null}>(`
   SELECT status,tax_number,gemi_number FROM public.mazi_interest_applications
   WHERE id=$1::uuid FOR UPDATE
  `,[id]);
  const current=row.rows[0];
  if(!current||!["pending_review","registry_review_required"].includes(current.status)||
   current.tax_number!==checked.taxNumber||current.gemi_number!==checked.gemiNumber)
    throw Error("MAZI_INTEREST_NOT_REVIEWABLE");
  await conn.query(`
   INSERT INTO public.mazi_interest_registry_rechecks (
    interest_id,tax_number,gemi_number,legal_name,company_status,city,checked_at,checked_by
   ) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8::uuid)
  `,[id,checked.taxNumber,checked.gemiNumber,checked.legalName,
    checked.companyStatus??null,checked.city??null,new Date(checked.checkedAt),actor]);
  await conn.query("COMMIT");
 }catch(error){await conn.query("ROLLBACK");throw error;}
 finally{conn.release();}
}

/**
 * Human-verified, non-API path for a temporarily unavailable official GEMI API.
 * Super Admin must actually inspect the public record, compare the original
 * identity and document the evidence. This is never labelled as an API check.
 */
export async function attestMaziManualGemiPublicity(principal:SessionPrincipal,input:{
 id:string;sourceUrl:string;evidence:string;confirmedGemi:string;
 confirmedIdentity:boolean;confirmedActive:boolean;
}):Promise<void>{
 const actor=await marketplaceMaziActor(principal);
 if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(input.id))
   throw Error("MAZI_GEMI_MANUAL_INVALID");
 const sourceUrl=input.sourceUrl.trim(),evidence=input.evidence.trim();
 let parsed:URL;
 try {parsed=new URL(sourceUrl);} catch {throw Error("MAZI_GEMI_MANUAL_INVALID");}
 if(parsed.protocol!=="https:"||parsed.hostname!=="publicity.businessportal.gr"||
    parsed.port||parsed.username||parsed.password||
    evidence.length<80||evidence.length>2000||
    !input.confirmedIdentity||!input.confirmedActive)
  throw Error("MAZI_GEMI_MANUAL_INVALID");
 const conn=await getAdminPostgresRuntime().nativePool.connect();
 try{
  await conn.query("BEGIN");
  const result=await conn.query<{
    tax_number:string;gemi_number:string|null;registry_legal_name:string|null;
    status:string;registry_lookup_status:string
   }>(`SELECT tax_number,gemi_number,registry_legal_name,status,registry_lookup_status
      FROM public.mazi_interest_applications WHERE id=$1::uuid FOR UPDATE`,[input.id]);
  const item=result.rows[0];
  if(!item||!["pending_review","registry_review_required"].includes(item.status))
    throw Error("MAZI_INTEREST_NOT_REVIEWABLE");
  if(item.registry_lookup_status!=="matched"||!item.gemi_number||
     !item.registry_legal_name||item.registry_legal_name.trim().length<3||
     item.gemi_number!==input.confirmedGemi.trim())
    throw Error("MAZI_GEMI_MANUAL_IDENTITY_MISMATCH");
  await conn.query(`
    INSERT INTO public.mazi_interest_registry_rechecks (
      interest_id,tax_number,gemi_number,legal_name,company_status,city,
      checked_at,checked_by,source,source_url,review_evidence
    )
    SELECT id,tax_number,gemi_number,registry_legal_name,
      'Ενεργή',registry_city,now(),$2::uuid,'gemi_publicity_manual',$3,$4
    FROM public.mazi_interest_applications WHERE id=$1::uuid
  `,[input.id,actor,parsed.href,evidence]);
  await conn.query("COMMIT");
 }catch(error){await conn.query("ROLLBACK");throw error;}
 finally{conn.release();}
}
