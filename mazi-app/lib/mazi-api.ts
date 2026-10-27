import {parsePublicFundReport,type PublicFundReport} from "./fund-transparency";
import { createClient } from "./supabase/server";

const base=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const endpoint=()=>`${base}/functions/v1/mazi-member-api`;
export type MaziCycle={
 id:string;title:string;status:string;kind:string;starts_at:string;ends_at:string;
 funding_budget_cents:number;finance_activated:boolean
};
export type MaziApplication={id:string;business_name:string;status:string;created_at:string;review_reason:string|null};
export type MaziMember={
 user_id:string;status:string;voting_eligible:boolean;identity_verified_at:string|null;admitted_at:string
};
export type MaziProposal={
 id:string;title:string;details:string;category:string;amount_cents:number;
 status:string;created_by:string;created_at:string;first_time_support_request?:boolean
};
export type MaziFollowup={
 id:string;question:string;requested_at:string;answer:string|null;answered_at:string|null;
};
export type MaziGrantOffer={
 id:string;proposal_id:string;recipient_gemi_number:string;
 requested_amount_cents:number;assigned_amount_cents:number;
 additional_months:number;reapplication_after_months:number;
 monthly_membership_fee_cents:number;policy_version:string;
 agreement_body:string;agreement_sha256:string;expires_at:string;offered_at:string
};
export type MaziGrantAcknowledgement={
 offer_id:string;acknowledged_at:string;accepted_document_sha256:string
};
export type MaziState={
 followups:MaziFollowup[];
 grant_offers:MaziGrantOffer[];grant_acknowledgements:MaziGrantAcknowledgement[];
 application:MaziApplication|null;member:MaziMember|null;cycle:MaziCycle|null;
 proposals:MaziProposal[];votes:{proposal_id:string}[];
 proposal_review:{id:string;review_reason:string|null}|null;
 recused_proposals:string[];
 tally:({total_ballots:number;invalidated_ballots:number;valid_ballots:number;proposals_considered:number;finalized_at:string}|{finalized_at:string;suppressed:true})|null;
 tallies:{proposal_id:string;supporting_ballots:number}[]
};
type Result<T extends object>=({ok:true}&T)|{ok:false;error:string};
const fail={ok:false as const,error:"service_unavailable"};
function isObject(value:unknown):value is Record<string,unknown>{
 return Boolean(value)&&typeof value==="object"&&!Array.isArray(value);
}
export async function maziMemberRequest<T extends object>(
 operation:string, payload:Record<string,unknown>={}
):Promise<Result<T>>{
 if(!base||!key)return fail;
 const supabase=await createClient();
 // Transport bearer only; authorization occurs in Edge via getUser(jwt).
 const {data:{session}}=await supabase.auth.getSession();
 if(!session?.access_token)return {ok:false,error:"not_authenticated"};
 try{
  const res=await fetch(endpoint(),{method:"POST",
   headers:{"content-type":"application/json",apikey:key,authorization:`Bearer ${session.access_token}`},
   body:JSON.stringify({operation,...payload}),cache:"no-store",signal:AbortSignal.timeout(8000)
  });
  const body:unknown=await res.json();
  if(isObject(body)&&body.ok===true)return body as {ok:true}&T;
  return {ok:false,error:isObject(body)&&typeof body.error==="string"?body.error:"service_unavailable"};
 }catch{return fail;}
}
export async function maziPublicCycle():Promise<{status:string;starts_at:string;ends_at:string;title:string}|null>{
 if(!base||!key)return null;
 try{
  const response=await fetch(endpoint()+"?operation=status",{
   method:"GET",headers:{apikey:key},next:{revalidate:60},signal:AbortSignal.timeout(8000)
  });
  if(!response.ok)return null;
  const data:unknown=await response.json();
  if(!isObject(data)||data.ok!==true||!isObject(data.cycle))return null;
  const c=data.cycle;
  if(typeof c.status!=="string"||typeof c.starts_at!=="string"||
    typeof c.ends_at!=="string"||typeof c.title!=="string")return null;
  return {status:c.status,starts_at:c.starts_at,ends_at:c.ends_at,title:c.title};
 }catch{return null;}
}

/** Public, non-personal financial disclosure. Network failures never become €0. */
export async function maziPublicFundReport():Promise<PublicFundReport|null>{
 if(!base||!key)return null;
 try {
  const res=await fetch(endpoint()+"?operation=fund_transparency",{
   method:"GET",headers:{apikey:key},next:{revalidate:60},signal:AbortSignal.timeout(8000)
  });
  if(!res.ok)return null;
  const data:unknown=await res.json();
  if(!isObject(data)||data.ok!==true)return null;
  return parsePublicFundReport(data.report);
 }catch{return null;}
}
