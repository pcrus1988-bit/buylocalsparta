"use server";
import { redirect } from "next/navigation";
import {createHmac} from "node:crypto";
import { createClient } from "../lib/supabase/server";
import { asText, validEmail, validateProposal } from "../lib/validation";
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
  if(!validEmail(email)) urlMessage("/join","invalid_email");
  // The public form cannot send administrative auth emails, create accounts or
  // control redirects. Only this server action signs a bounded request to
  // the existing KONTA MOY backend, which retains privileged Auth/Resend keys.
  const secret=process.env.MAZI_AUTH_BRIDGE_SECRET;
  if(!secret||secret.length<48)urlMessage("/join","email_unavailable");
  const ts=Date.now();
  const signature=createHmac("sha256",secret).update(String(ts)+"\n"+email).digest("hex");
  try{
   const response=await fetch("https://kontamou.site/api/mazi-auth-email",{
    method:"POST",cache:"no-store",
    headers:{"content-type":"application/json","x-mazi-auth-signature":signature},
    body:JSON.stringify({email,ts}),signal:AbortSignal.timeout(12000)
   });
   if(response.status!==202)urlMessage("/join","email_unavailable");
  }catch{
   urlMessage("/join","email_unavailable");
  }
  // Do not disclose account existence or authorization state.
  redirect("/join?sent=1");
}

export async function signOut(){
  const db=await createClient();
  await db.auth.signOut();
  redirect("/");
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
  // A funding commitment is not triggered by a non-financial needs request,
  // but the future contract formula must be disclosed at submission.
  if(form.get("grant_terms_acknowledged")!=="on")
    urlMessage("/proposals","grant_terms_acknowledgment_required");
  const outcome=await maziMemberRequest("propose",{
    ...input,acknowledge_grant_terms:true,
    grant_policy_version:"mazi-grant-retention-v1"
  });
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


export async function acknowledgeGrantOffer(form:FormData){
  await authenticated();
  const offer_id=asText(form.get("offer_id"));
  const agreement_sha256=asText(form.get("agreement_sha256"));
  const version=asText(form.get("policy_version"));
  if(!/^[a-f0-9-]{36}$/i.test(offer_id)||
     !/^[a-f0-9]{64}$/.test(agreement_sha256)||
     version!=="mazi-grant-retention-v1"||
     form.get("affirmatively_accepted")!=="on"||
     form.get("understand_requested_amount_basis")!=="on"||
     form.get("understand_separate_disbursement")!=="on")
    urlMessage("/awards","invalid_acknowledgement");
  const outcome=await maziMemberRequest("acknowledge_grant_offer",{
    offer_id,agreement_sha256,policy_version:version,
    affirmatively_accepted:true,
    understand_requested_amount_basis:true,
    understand_separate_disbursement:true
  });
  if(!outcome.ok)urlMessage("/awards",
    outcome.error==="award_already_acknowledged"?"already_acknowledged":
    outcome.error==="award_not_eligible"?"award_not_eligible":"acceptance_failed");
  redirect("/awards?notice=acknowledged");
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

/**
 * Distinct, explicit invitation acceptance. Only a confirmed Auth email that
 * matches the reviewed interest can be admitted by the private SQL RPC.
 * This action never activates a membership invoice, marketing credits or voting.
 */
export async function acceptMaziInvitation(form:FormData){
 await authenticated();
 const invitation_id=asText(form.get("invitation_id"));
 const terms_version=asText(form.get("terms_version"));
 if(!/^[0-9a-f-]{36}$/i.test(invitation_id)||
    terms_version!=="mazi-invitation-terms-v1"||
    form.get("accept_charter")!=="on"||
    form.get("accept_processing")!=="on")
   urlMessage("/onboarding","invitation_not_eligible");
 const outcome=await maziMemberRequest("accept_invitation",{
  invitation_id,terms_version,accept_charter:true,accept_processing:true
 });
 if(!outcome.ok)urlMessage("/onboarding","invitation_not_eligible");
 redirect("/members?notice=invitation_accepted");
}
