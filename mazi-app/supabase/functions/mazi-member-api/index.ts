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
  // The email used here comes from Supabase Auth getUser(jwt), not a browser
  // submitted identity or user_metadata. Membership is NOT created by login.
  if(operation==="invitation_state"){
   const {data:interests,error:interestError}=await admin.from("mazi_interest_applications")
     .select("id,registry_legal_name,contact_email,status")
     .eq("contact_email",(user.email||"").trim().toLowerCase())
     .eq("status","approved_pending_invite").limit(5);
   if(interestError)return out({error:"data_unavailable"},503);
   let invitation:Json|null=null;
   for(const interest of interests||[]){
    const {data:invite,error:inviteError}=await admin.from("mazi_invitations")
      .select("id,status,expires_at,terms_version")
      .eq("interest_id",interest.id).eq("status","email_sent")
      .gt("expires_at",new Date().toISOString())
      .order("issued_at",{ascending:false}).limit(1).maybeSingle();
    if(inviteError)return out({error:"data_unavailable"},503);
    if(invite){
     invitation={id:invite.id,terms_version:invite.terms_version,
       business_name:interest.registry_legal_name,expires_at:invite.expires_at};
     break;
    }
   }
   return out({ok:true,invitation});
  }
  if(operation==="accept_invitation"){
   if(input.accept_charter!==true||input.accept_processing!==true
     ||input.terms_version!=="mazi-invitation-terms-v1"||
     !uuid(text(input.invitation_id)))
    return out({error:"invitation_terms_required"},400);
   // SECURITY DEFINER RPC is executable only by service_role and enforces
   // confirmed email, approved legal entity, expiry and single-use locks in SQL.
   const {data:accepted,error:acceptError}=await admin.rpc("mazi_complete_invitation",{
    p_invitation_id:text(input.invitation_id),p_user_id:user.id,
    p_terms_version:"mazi-invitation-terms-v1",
    p_accept_charter:true,p_accept_processing:true
   });
   if(acceptError||accepted!==true)
    return out({error:"invitation_not_eligible"},409);
   return out({ok:true});
  }
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
   let followups:Json[]=[];
   if(application){
    const {data:questions,error:fErr}=await admin.from("mazi_application_followups")
      .select("id,question,requested_at,answer,answered_at")
      .eq("application_id",application.id).order("requested_at",{ascending:true}).limit(100);
    if(fErr)return out({error:"data_unavailable"},503);
    followups=(questions||[]) as Json[];
   }
   let proposals:Json[]=[], votes:Json[]=[], grant_offers:Json[]=[], grant_acknowledgements:Json[]=[];
   let proposal_review:Json|null=null;
   let recused_proposals:string[]=[];
   let tally:Json|null=null;
   let tallies:Json[]=[];
   if(isVerified) {
     const [{data:offers,error:oErr},{data:ack,error:kErr}]=await Promise.all([
       admin.from("mazi_grant_award_offers")
         .select("id,proposal_id,recipient_gemi_number,requested_amount_cents,assigned_amount_cents,additional_months,reapplication_after_months,monthly_membership_fee_cents,policy_version,agreement_body,agreement_sha256,expires_at,offered_at")
         .eq("recipient_user_id",user.id).gt("expires_at",new Date().toISOString())
         .order("offered_at",{ascending:false}).limit(25),
       admin.from("mazi_grant_award_acknowledgements")
         .select("offer_id,acknowledged_at,accepted_document_sha256")
         .eq("recipient_user_id",user.id).limit(50)
     ]);
     if(oErr||kErr)return out({error:"data_unavailable"},503);
     grant_offers=(offers||[]) as Json[];
     grant_acknowledgements=(ack||[]) as Json[];
   }
   if(isVerified&&cycle) {
    const [{data:rows,error:pErr},{data:voted,error:vErr},{data:ownReview,error:rErr},{data:conflicts,error:cErr}]=await Promise.all([
     admin.from("mazi_proposals").select("id,title,details,category,amount_cents,status,created_by,created_at,first_time_support_request")
       .eq("cycle_id",cycle.id).or(`status.eq.approved,created_by.eq.${user.id}`).order("created_at",{ascending:false}).limit(100),
     admin.from("mazi_votes").select("proposal_id").eq("cycle_id",cycle.id).eq("voter_id",user.id).limit(200),
     admin.from("mazi_proposals").select("id,review_reason").eq("cycle_id",cycle.id)
       .eq("created_by",user.id).maybeSingle(),
     admin.from("mazi_vote_conflicts").select("proposal_id").eq("cycle_id",cycle.id)
       .eq("voter_id",user.id).limit(200)
    ]);
    if(pErr||vErr||rErr||cErr)return out({error:"data_unavailable"},503);
    proposals=(rows||[]) as Json[];votes=(voted||[]) as Json[];
    proposal_review=ownReview as Json|null;
    recused_proposals=(conflicts||[]).map(v=>v.proposal_id);
    // Finalized aggregate support is only released when >=5 valid ballots
    // to avoid identifying a sole supporter in a tiny constituency.
    if(cycle.status==="closed") {
      const {data:summary,error:sumError}=await admin.from("mazi_cycle_results")
        .select("total_ballots,invalidated_ballots,valid_ballots,proposals_considered,finalized_at")
        .eq("cycle_id",cycle.id).maybeSingle();
      if(sumError)return out({error:"data_unavailable"},503);
      if(summary) {
        const enough=Number(summary.valid_ballots)>=5;
        tally=enough?summary:{finalized_at:summary.finalized_at,suppressed:true};
        if(enough) {
          const {data:counts,error:countsError}=await admin.from("mazi_proposal_results")
           .select("proposal_id,supporting_ballots").eq("cycle_id",cycle.id).limit(150);
          if(countsError)return out({error:"data_unavailable"},503);
          tallies=(counts||[]) as Json[];
        }
      }
    }
   }
   return out({ok:true,application,member,cycle,proposals,votes,proposal_review,recused_proposals,tally,tallies,followups,grant_offers,grant_acknowledgements});
  }
  if(operation==="acknowledge_grant_offer"){
   // No offer can exist in the current needs-assessment cycle.
   // An acknowledgement never authorizes disbursement or bills a member.
   const member=await verifiedMember(user.id);
   if(!member)return out({error:"not_verified"},403);
   const offer_id=text(input.offer_id);
   const sha=text(input.agreement_sha256);
   if(!uuid(offer_id)|| !/^[a-f0-9]{64}$/.test(sha)
     ||input.affirmatively_accepted!==true
     ||input.understand_requested_amount_basis!==true
     ||input.understand_separate_disbursement!==true
     ||input.policy_version!=="mazi-grant-retention-v1")
      return out({error:"award_acknowledgement_invalid"},400);
   const {data:record,error:insertError}=await admin.from("mazi_grant_award_acknowledgements")
     .insert({
       offer_id,recipient_user_id:user.id,
       accepted_policy_version:"mazi-grant-retention-v1",
       accepted_document_sha256:sha,
       affirmatively_accepted:true
     }).select("offer_id").maybeSingle();
   if(insertError){
     if(insertError.code==="23505")
       return out({error:"award_already_acknowledged"},409);
     return out({error:"award_not_eligible"},403);
   }
   if(!record)return out({error:"award_not_eligible"},403);
   return out({ok:true});
  }
  // The old open membership-application endpoint is intentionally disabled.
  // New admission MUST use the verified invitation, not a generic Auth account.
  if(operation==="apply")return out({error:"invitation_required"},403);
  if(operation==="answer_followup"){
   const followupId=text(input.followup_id),answer=text(input.answer);
   if(!uuid(followupId)||answer.length<20||answer.length>2000)
     return out({error:"invalid_followup_answer"},400);
   const {data:ownApp,error:appError}=await admin.from("mazi_membership_applications")
     .select("id,status").eq("applicant_user_id",user.id).maybeSingle();
   if(appError||!ownApp||ownApp.status!=="pending")
     return out({error:"followup_not_available"},403);
   const {data:updated,error:answerError}=await admin.from("mazi_application_followups")
     .update({answer,answered_at:new Date().toISOString()})
     .eq("id",followupId).eq("application_id",ownApp.id).is("answered_at",null)
     .select("id").maybeSingle();
   if(answerError||!updated)return out({error:"followup_not_available"},409);
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
   // Notice of the potential future binding period is mandatory at Need/Project
   // submission. It is NOT the later acceptance of a funded grant or a
   // withdrawal authorization; finance remains disabled.
   if(input.acknowledge_grant_terms!==true||
      input.grant_policy_version!=="mazi-grant-retention-v1")
     return out({error:"grant_terms_acknowledgment_required"},400);
   const {error}=await admin.from("mazi_proposals").insert({
     cycle_id:cycle.id,created_by:user.id,title,category,amount_cents:cents,details,status:"submitted",
     grant_policy_ack_version:"mazi-grant-retention-v1",
     grant_policy_acknowledged_at:new Date().toISOString()
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
   const {data:recusal}=await admin.from("mazi_vote_conflicts")
     .select("id").eq("cycle_id",cycle.id).eq("voter_id",user.id)
     .eq("proposal_id",proposalId).maybeSingle();
   if(recusal)return out({error:"conflict_of_interest"},403);
   const {error}=await admin.from("mazi_votes").insert({
     cycle_id:cycle.id,proposal_id:proposal.id,voter_id:user.id
   });
   if(error)return out({error:error.code==="23505"?"already_voted":"vote_not_allowed"},error.code==="23505"?409:403);
   return out({ok:true});
  }
  return out({error:"operation_not_supported"},400);
 }catch(error){
  console.error("MAZI_GATEWAY_FAILURE",error instanceof Error?error.message:"unknown");
  return out({error:"service_unavailable"},503);
 }
});
