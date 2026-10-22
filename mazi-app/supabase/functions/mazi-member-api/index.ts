// Real MAZI member gateway. Shared marketplace public-schema permissions stay locked.
// verify_jwt=false at the gateway because only GET /status is public;
// EVERY other request verifies a user JWT with Supabase Auth (getUser).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

type Json = Record<string,unknown>;
const URL_BASE=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const admin=createClient(URL_BASE,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGIN="https://mazi.kontamou.site";
const headers={
  "Content-Type":"application/json;charset=utf-8",
  "Access-Control-Allow-Origin":ORIGIN,
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":"Authorization,apikey,Content-Type",
  "Cache-Control":"no-store",
  "Vary":"Origin"
};
const out=(data:Json,status=200)=>new Response(JSON.stringify(data),{status,headers});
const text=(v:unknown)=>typeof v==="string"?v.trim():"";
const uuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const validEmail=(v:string)=>v.length>4&&v.length<255&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
type Member={status:string;voting_eligible:boolean;identity_verified_at:string|null;gemi_number:string|null;user_id:string};
async function currentCycle() {
 const {data,error}=await admin.from("mazi_cycles")
   .select("id,title,status,kind,starts_at,ends_at,finance_activated,funding_budget_cents")
   .eq("slug","founding-needs-2026").maybeSingle();
 if(error)throw error;
 return data;
}
const inWindow=(c:{starts_at:string;ends_at:string})=>
 Date.parse(c.starts_at)<=Date.now()&&Date.parse(c.ends_at)>Date.now();
async function verifiedMember(userId:string) {
 const {data:m,error}=await admin.from("mazi_members")
  .select("user_id,status,voting_eligible,identity_verified_at,gemi_number")
  .eq("user_id",userId).maybeSingle();
 if(error)throw error;
 if(!m||m.status!=="verified"||!m.identity_verified_at||!m.gemi_number)return null;
 const {data:app}=await admin.from("mazi_membership_applications")
  .select("status").eq("applicant_user_id",userId).maybeSingle();
 return app?.status==="approved"?m as Member:null;
}
Deno.serve(async(req:Request)=>{
 try {
  const reqOrigin=req.headers.get("origin");
  if(reqOrigin&&reqOrigin!==ORIGIN)return out({error:"origin_not_allowed"},403);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  const url=new URL(req.url);
  if(req.method==="GET"&&url.searchParams.get("operation")==="status"){
   const c=await currentCycle();
   if(!c||c.kind!=="needs_assessment"||c.funding_budget_cents!==0||c.finance_activated)
    return out({ok:false,error:"status_unavailable"},503);
   return out({ok:true,cycle:{status:c.status,starts_at:c.starts_at,ends_at:c.ends_at,title:c.title}});
  }
  if(req.method!=="POST")return out({error:"method_not_allowed"},405);
  // Reject large untrusted payloads; authenticated actions only.
  const length=Number(req.headers.get("content-length")||0);
  if(length>32768)return out({error:"payload_too_large"},413);
  const auth=req.headers.get("authorization")||"";
  const match=/^Bearer ([A-Za-z0-9._-]{30,5000})$/.exec(auth);
  if(!match)return out({error:"not_authenticated"},401);
  const {data:{user},error:authError}=await admin.auth.getUser(match[1]);
  if(authError||!user||!uuid(user.id)||!validEmail(user.email||""))return out({error:"not_authenticated"},401);
  let input:Json={};
  try {
    const raw=await req.text();
    if(raw.length>32768)return out({error:"payload_too_large"},413);
    input=JSON.parse(raw) as Json;
  }catch{return out({error:"bad_json"},400);}
  if(!input||Array.isArray(input)||typeof input!=="object")return out({error:"bad_json"},400);
  const operation=text(input.operation);
  if(operation==="state"){
   const [{data:application,error:aErr},{data:member,error:mErr},cycle]=await Promise.all([
    admin.from("mazi_membership_applications")
     .select("id,business_name,status,created_at,review_reason").eq("applicant_user_id",user.id).maybeSingle(),
    admin.from("mazi_members")
     .select("user_id,status,voting_eligible,identity_verified_at,admitted_at").eq("user_id",user.id).maybeSingle(),
    currentCycle()
   ]);
   if(aErr||mErr)return out({error:"data_unavailable"},503);
   const isVerified=Boolean(member?.status==="verified"&&member?.identity_verified_at&&application?.status==="approved");
   let proposals:Json[]=[], votes:Json[]=[];
   let proposal_review:Json|null=null;
   if(isVerified&&cycle) {
    const [{data:rows,error:pErr},{data:voted,error:vErr},{data:ownReview,error:rErr}]=await Promise.all([
     admin.from("mazi_proposals").select("id,title,details,category,amount_cents,status,created_by,created_at")
       .eq("cycle_id",cycle.id).or(`status.eq.approved,created_by.eq.${user.id}`).order("created_at",{ascending:false}).limit(100),
     admin.from("mazi_votes").select("proposal_id").eq("cycle_id",cycle.id).eq("voter_id",user.id).limit(200),
     admin.from("mazi_proposals").select("id,review_reason").eq("cycle_id",cycle.id)
       .eq("created_by",user.id).maybeSingle()
    ]);
    if(pErr||vErr||rErr)return out({error:"data_unavailable"},503);
    proposals=(rows||[]) as Json[];votes=(voted||[]) as Json[];
    proposal_review=ownReview as Json|null;
   }
   return out({ok:true,application,member,cycle,proposals,votes,proposal_review});
  }
  if(operation==="apply"){
   if(input.accept_privacy!==true)return out({error:"privacy_required"},400);
   const v={
    business_name:text(input.business_name), representative_name:text(input.representative_name),
    location:text(input.location),sector:text(input.sector),
    registry_number:text(input.registry_number)||null,description:text(input.description)
   };
   if(v.business_name.length<3||v.business_name.length>160||v.representative_name.length<3||
      v.representative_name.length>120||v.location.length<2||v.location.length>120||
      v.sector.length<2||v.sector.length>100||v.description.length<20||
      v.description.length>1800||(v.registry_number!==null&&!/^[0-9]{12}$/.test(v.registry_number)))
    return out({error:"invalid_application"},400);
   const {error}=await admin.from("mazi_membership_applications").insert({
     ...v,applicant_user_id:user.id,status:"pending",consent_version:"mazi-interest-v1"
   });
   if(error)return out({error:error.code==="23505"?"already_applied":"application_failed"},error.code==="23505"?409:503);
   return out({ok:true});
  }
  if(operation==="propose"){
   const member=await verifiedMember(user.id);
   if(!member)return out({error:"not_verified"},403);
   const cycle=await currentCycle();
   if(!cycle||cycle.status!=="submissions"||!inWindow(cycle))return out({error:"cycle_closed"},409);
   const title=text(input.title),details=text(input.details),category=text(input.category),
     cents=Number(input.amount_cents);
   if(title.length<8||title.length>140||details.length<80||details.length>4000||
      !["growth","resilience","joint"].includes(category)||!Number.isSafeInteger(cents)||
      cents<50000||cents>20000000)return out({error:"invalid_proposal"},400);
   const {error}=await admin.from("mazi_proposals").insert({
     cycle_id:cycle.id,created_by:user.id,title,category,amount_cents:cents,details,status:"submitted"
   });
   if(error)return out({error:error.code==="23505"?"already_submitted":"proposal_failed"},error.code==="23505"?409:503);
   return out({ok:true});
  }
  if(operation==="vote"){
   const member=await verifiedMember(user.id);
   if(!member||member.voting_eligible!==true)return out({error:"vote_not_allowed"},403);
   const proposalId=text(input.proposal_id);
   if(!uuid(proposalId))return out({error:"invalid_vote"},400);
   const cycle=await currentCycle();
   if(!cycle||cycle.status!=="voting"||!inWindow(cycle))return out({error:"vote_not_allowed"},403);
   const {data:proposal,error:lookupError}=await admin.from("mazi_proposals")
     .select("id,created_by,status,cycle_id").eq("id",proposalId).maybeSingle();
   if(lookupError||!proposal||proposal.cycle_id!==cycle.id||proposal.status!=="approved"||proposal.created_by===user.id)
     return out({error:"vote_not_allowed"},403);
   const {error}=await admin.from("mazi_votes").insert({
     cycle_id:cycle.id,proposal_id:proposal.id,voter_id:user.id
   });
   if(error)return out({error:error.code==="23505"?"already_voted":"vote_not_allowed"},error.code==="23505"?409:503);
   return out({ok:true});
  }
  return out({error:"operation_not_supported"},400);
 }catch(error){
  console.error("MAZI_GATEWAY_FAILURE",error instanceof Error?error.message:"unknown");
  return out({error:"service_unavailable"},503);
 }
});
