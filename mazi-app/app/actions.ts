"use server";
import { redirect } from "next/navigation";
import { createClient } from "../lib/supabase/server";
import { asText, validEmail, validateApplication, validateProposal } from "../lib/validation";

const DESTINATION = "https://mazi.kontamou.site/auth/callback";
const urlMessage=(path:string,reason:string)=>redirect(path+"?notice="+encodeURIComponent(reason));

async function authenticated() {
  const db=await createClient();
  const {data:{user},error}=await db.auth.getUser();
  if(error||!user) redirect("/join");
  return {db,user};
}

export async function emailSignIn(form:FormData) {
  const email=asText(form.get("email")).toLowerCase();
  if (!validEmail(email)) urlMessage("/join","invalid_email");
  const db=await createClient();
  const {error}=await db.auth.signInWithOtp({
    email,options:{emailRedirectTo:DESTINATION,shouldCreateUser:true}
  });
  if(error) urlMessage("/join","email_unavailable");
  redirect("/join?sent=1");
}

export async function signOut(){
  const db=await createClient();
  await db.auth.signOut();
  redirect("/");
}

export async function applyForMembership(form:FormData) {
  const {db,user}=await authenticated();
  if (form.get("accept_privacy") !== "on") urlMessage("/members","privacy_required");
  const input={
    business_name:asText(form.get("business_name")),
    representative_name:asText(form.get("representative_name")),
    location:asText(form.get("location")),
    sector:asText(form.get("sector")),
    registry_number:asText(form.get("registry_number"))||null,
    description:asText(form.get("description"))
  };
  if(validateApplication(input)) urlMessage("/members","invalid_application");
  const {error}=await db.from("mazi_membership_applications").insert({
    ...input,applicant_user_id:user.id,consent_version:"mazi-interest-v1"
  });
  if(error) urlMessage("/members",error.code==="23505"?"already_applied":"application_failed");
  redirect("/members?notice=application_received");
}

export async function submitProposal(form:FormData) {
  const {db,user}=await authenticated();
  const {data:member}=await db.from("mazi_members").select("status").eq("user_id",user.id).maybeSingle();
  if(member?.status!=="verified") urlMessage("/members","not_verified");
  const {data:cycle}=await db.from("mazi_cycles").select("id,status,starts_at,ends_at")
    .eq("slug","founding-needs-2026").maybeSingle();
  if(!cycle||cycle.status!=="submissions"||new Date(cycle.starts_at)>new Date()||new Date(cycle.ends_at)<=new Date()) urlMessage("/proposals","cycle_closed");
  const euros=Number(asText(form.get("amount_eur")));
  const input={
    title:asText(form.get("title")),
    category:asText(form.get("category")),
    amount_cents:euros*100,
    details:asText(form.get("details"))
  };
  if(validateProposal(input)) urlMessage("/proposals","invalid_proposal");
  const {error}=await db.from("mazi_proposals").insert({
    ...input,cycle_id:cycle.id,created_by:user.id,status:"submitted"
  });
  if(error) urlMessage("/proposals",error.code==="23505"?"already_submitted":"proposal_failed");
  redirect("/proposals?notice=proposal_received");
}

export async function supportProposal(form:FormData) {
  const {db,user}=await authenticated();
  const id=asText(form.get("proposal_id"));
  if(!/^[0-9a-f-]{36}$/i.test(id)) urlMessage("/proposals","invalid_vote");
  const {data:proposal}=await db.from("mazi_proposals").select("id,cycle_id").eq("id",id).maybeSingle();
  if(!proposal) urlMessage("/proposals","invalid_vote");
  const {error}=await db.from("mazi_votes").insert({proposal_id:proposal.id,cycle_id:proposal.cycle_id,voter_id:user.id});
  if(error) urlMessage("/proposals",error.code==="23505"?"already_voted":"vote_not_allowed");
  redirect("/proposals?notice=vote_cast");
}

async function requireAdmin(){
  const {db,user}=await authenticated();
  const {data}=await db.from("mazi_administrators").select("user_id").eq("user_id",user.id).maybeSingle();
  if(!data) redirect("/members");
  return {db,user};
}

export async function reviewMembership(form:FormData){
  const {db}=await requireAdmin();
  const id=asText(form.get("application_id"));
  const decision=asText(form.get("decision"));
  if(!/^[0-9a-f-]{36}$/i.test(id)||!["approve","reject"].includes(decision)) urlMessage("/admin","invalid_request");
  const {error}=await db.rpc("mazi_review_application",{p_application_id:id,p_approve:decision==="approve"});
  if(error) urlMessage("/admin","review_failed");
  redirect("/admin?notice=application_reviewed");
}

export async function reviewProposal(form:FormData){
  const {db}=await requireAdmin();
  const id=asText(form.get("proposal_id"));
  const decision=asText(form.get("decision"));
  if(!/^[0-9a-f-]{36}$/i.test(id)||!["approve","reject"].includes(decision)) urlMessage("/admin","invalid_request");
  const {error}=await db.from("mazi_proposals")
    .update({status:decision==="approve"?"approved":"rejected",reviewed_at:new Date().toISOString()})
    .eq("id",id).eq("status","submitted");
  if(error) urlMessage("/admin","review_failed");
  redirect("/admin?notice=proposal_reviewed");
}

export async function setVotingEligibility(form:FormData){
  const {db}=await requireAdmin();
  const userId=asText(form.get("user_id"));
  if(!/^[0-9a-f-]{36}$/i.test(userId)) urlMessage("/admin","invalid_request");
  const {error}=await db.from("mazi_members").update({voting_eligible:form.get("eligible")==="yes",updated_at:new Date().toISOString()}).eq("user_id",userId);
  if(error) urlMessage("/admin","eligibility_failed");
  redirect("/admin?notice=eligibility_saved");
}

export async function changeCycleStage(form:FormData){
  const {db}=await requireAdmin();
  const state=asText(form.get("stage"));
  if(!["submissions","review","voting","closed"].includes(state)) urlMessage("/admin","invalid_request");
  const {error}=await db.from("mazi_cycles").update({status:state})
    .eq("slug","founding-needs-2026").eq("kind","needs_assessment").eq("finance_activated",false);
  if(error) urlMessage("/admin","cycle_failed");
  redirect("/admin?notice=cycle_saved");
}
