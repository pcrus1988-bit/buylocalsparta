"use server";
import { redirect } from "next/navigation";
import { createClient } from "../lib/supabase/server";
import { asText, validEmail, validateApplication, validateProposal } from "../lib/validation";
import {maziMemberRequest} from "../lib/mazi-api";

const DESTINATION = "https://mazi.kontamou.site/auth/callback";
function urlMessage(path:string,reason:string): never { redirect(path+"?notice="+encodeURIComponent(reason)); }

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
  await authenticated();
  if (form.get("accept_privacy") !== "on") urlMessage("/members","privacy_required");
  const input={
    business_name:asText(form.get("business_name")),
    representative_name:asText(form.get("representative_name")),
    location:asText(form.get("location")),
    sector:asText(form.get("sector")),
    registry_number:asText(form.get("registry_number")).replace(/\s/g,"")||null,
    description:asText(form.get("description"))
  };
  if(validateApplication(input)) urlMessage("/members","invalid_application");
  const outcome=await maziMemberRequest("apply",{...input,accept_privacy:true});
  if(!outcome.ok)urlMessage("/members",outcome.error==="already_applied"?"already_applied":"application_failed");
  redirect("/members?notice=application_received");
}

export async function submitProposal(form:FormData) {
  await authenticated();
  const euros=Number(asText(form.get("amount_eur")));
  const input={
    title:asText(form.get("title")),
    category:asText(form.get("category")),
    amount_cents:euros*100,
    details:asText(form.get("details"))
  };
  if(validateProposal(input)) urlMessage("/proposals","invalid_proposal");
  const outcome=await maziMemberRequest("propose",input);
  if(!outcome.ok)urlMessage("/proposals",
    ["cycle_closed","not_verified","already_submitted","invalid_proposal"].includes(outcome.error)?outcome.error:"proposal_failed");
  redirect("/proposals?notice=proposal_received");
}

export async function supportProposal(form:FormData) {
  await authenticated();
  const id=asText(form.get("proposal_id"));
  if(!/^[0-9a-f-]{36}$/i.test(id)) urlMessage("/proposals","invalid_vote");
  const outcome=await maziMemberRequest("vote",{proposal_id:id});
  if(!outcome.ok)urlMessage("/proposals",
    ["already_voted","vote_not_allowed","invalid_vote"].includes(outcome.error)?outcome.error:"vote_not_allowed");
  redirect("/proposals?notice=vote_cast");
}


export async function answerMaziFollowup(form:FormData){
 await authenticated();
 const followup_id=asText(form.get("followup_id"));
 const answer=asText(form.get("answer"));
 if(!/^[a-f0-9-]{36}$/i.test(followup_id)||answer.length<20||answer.length>2000)
   urlMessage("/members","invalid_followup_answer");
 const result=await maziMemberRequest("answer_followup",{followup_id,answer});
 if(!result.ok)urlMessage("/members","followup_not_available");
 redirect("/members?notice=followup_answered");
}
