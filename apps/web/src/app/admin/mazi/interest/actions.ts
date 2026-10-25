"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {getAdminSession} from "../../../../lib/admin-session";
import {assertAdminCsrf} from "../../../../lib/admin-runtime";
import {requireMarketplaceSuperAdminRole} from "../../../../lib/mazi-superadmin";
import {reviewMaziInterest,recheckMaziInterestRegistry,attestMaziManualGemiPublicity} from "../../../../lib/mazi-interest-admin";
import {issueMaziInvitation,revokeMaziInvitation} from "../../../../lib/mazi-invitation-admin";

const value=(f:FormData,k:string)=>typeof f.get(k)==="string"?String(f.get(k)):"";
export async function manualMaziGemiPublicityAction(form:FormData){
 const principal=await getAdminSession();
 requireMarketplaceSuperAdminRole(principal);
 assertAdminCsrf(principal,value(form,"csrf"));
 try{
  await attestMaziManualGemiPublicity(principal,{
   id:value(form,"id"),
   sourceUrl:value(form,"sourceUrl"),
   evidence:value(form,"evidence"),
   confirmedGemi:value(form,"confirmedGemi"),
   confirmedIdentity:form.get("confirmedIdentity")==="on",
   confirmedActive:form.get("confirmedActive")==="on"
  });
 }catch(error){
  const code=error instanceof Error?error.message:"";
  const notice=code==="MAZI_GEMI_MANUAL_INVALID"?"gemi_manual_invalid":
   code==="MAZI_GEMI_MANUAL_IDENTITY_MISMATCH"?"gemi_manual_mismatch":
   code==="MAZI_INTEREST_NOT_REVIEWABLE"?"not_reviewable":null;
  if(notice)redirect("/admin/mazi/interest?notice="+notice);
  throw error;
 }
 revalidatePath("/admin/mazi/interest");
 redirect("/admin/mazi/interest?notice=gemi_manual_recorded");
}

export async function refreshMaziInterestRegistryAction(form:FormData){
 const principal=await getAdminSession();
 requireMarketplaceSuperAdminRole(principal);
 assertAdminCsrf(principal,value(form,"csrf"));
 try{
  await recheckMaziInterestRegistry(principal,value(form,"id"));
 }catch(error){
  const code=error instanceof Error?error.message:"";
  const notice=code==="MAZI_GEMI_RECHECK_LOCAL_RATE_LIMITED"?"gemi_local_throttled":
   code==="MAZI_GEMI_RECHECK_PROVIDER_RATE_LIMITED"?"gemi_provider_throttled":
   code==="MAZI_GEMI_RECHECK_PROVIDER_ACCESS_DENIED"?"gemi_provider_auth":
   code==="MAZI_GEMI_RECHECK_NOT_CONFIGURED"?"gemi_not_configured":
   code==="MAZI_GEMI_RECHECK_NETWORK_TIMEOUT"?"gemi_timeout":
   code==="MAZI_GEMI_RECHECK_PROVIDER_UNAVAILABLE"?"gemi_provider_unavailable":
   code==="MAZI_GEMI_RECHECK_INCOMPLETE_RECORD"?"gemi_incomplete":
   code==="MAZI_GEMI_RECHECK_IDENTITY_MISMATCH"?"gemi_mismatch":
   code==="MAZI_GEMI_ORIGINAL_MATCH_REQUIRED"?"gemi_manual_review":
   code==="MAZI_INTEREST_NOT_REVIEWABLE"?"not_reviewable":
   code==="MAZI_GEMI_RECHECK_INVALID"?"review_invalid":null;
  if(notice)redirect("/admin/mazi/interest?notice="+notice);
  throw error;
 }
 revalidatePath("/admin/mazi/interest");
 redirect("/admin/mazi/interest?notice=gemi_refreshed");
}

export async function reviewMaziInterestAction(form:FormData){
 const principal=await getAdminSession();
 requireMarketplaceSuperAdminRole(principal);
 assertAdminCsrf(principal,value(form,"csrf"));
 const action=value(form,"decision");
 if(action!=="approve"&&action!=="decline")throw Error("MAZI_INTEREST_DECISION_INVALID");
 try {
  await reviewMaziInterest(principal,{
   id:value(form,"id"),
   decision:action,
   reason:value(form,"reason"),
   representativeVerified:form.get("representativeVerified")==="on",
   emailVerified:form.get("emailVerified")==="on",
   companyActiveVerified:form.get("companyActiveVerified")==="on"
  });
 } catch(error) {
  // Business-rule failures must never crash the admin review page.
  // Authentication, CSRF and unexpected database errors still fail closed.
  const code=error instanceof Error?error.message:"";
  const notice=code==="MAZI_INTEREST_VERIFICATION_REQUIRED"?"verification_required":
   code==="MAZI_INTEREST_DECISION_INVALID"?"review_invalid":
   code==="MAZI_INTEREST_NOT_REVIEWABLE"?"not_reviewable":
   code==="MAZI_ALREADY_MEMBER"?"already_member":null;
  if(notice)redirect("/admin/mazi/interest?notice="+notice);
  throw error;
 }
 revalidatePath("/admin/mazi/interest");
 redirect("/admin/mazi/interest?notice=reviewed");
}

export async function issueMaziInvitationAction(form:FormData){
 const principal=await getAdminSession();
 requireMarketplaceSuperAdminRole(principal);
 assertAdminCsrf(principal,value(form,"csrf"));
 let status:"sent"|"delivery_failed";
 try{
  status=await issueMaziInvitation(principal,value(form,"id"),form.get("provider_reconciled")==="on"?value(form,"reconciliation_reason"):undefined);
 }catch{
  redirect("/admin/mazi/interest?notice=invitation_not_issued");
 }
 revalidatePath("/admin/mazi/interest");
 redirect("/admin/mazi/interest?notice="+(status==="sent"?"invitation_sent":"invitation_delivery_failed"));
}

export async function revokeMaziInvitationAction(form:FormData){
 const principal=await getAdminSession();
 requireMarketplaceSuperAdminRole(principal);
 assertAdminCsrf(principal,value(form,"csrf"));
 if(form.get("confirm_revocation")!=="on")
  redirect("/admin/mazi/interest?notice=invitation_not_revoked");
 try{
  await revokeMaziInvitation(
   principal,value(form,"id"),value(form,"invitation_id"),value(form,"revocation_reason")
  );
 }catch{
  redirect("/admin/mazi/interest?notice=invitation_not_revoked");
 }
 revalidatePath("/admin/mazi/interest");
 redirect("/admin/mazi/interest?notice=invitation_revoked");
}
