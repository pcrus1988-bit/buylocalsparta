"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {getAdminSession} from "../../../../lib/admin-session";
import {assertAdminCsrf} from "../../../../lib/admin-runtime";
import {requireMarketplaceSuperAdminRole} from "../../../../lib/mazi-superadmin";
import {createMaziMarketingBrief,transitionMaziMarketingBrief,issueMaziCreativeInvitation,revokeMaziCreativeInvitation} from "../../../../lib/mazi-marketing-admin";

const field=(form:FormData,key:string)=>typeof form.get(key)==="string"?String(form.get(key)):"";
export async function createMarketingBriefAction(form:FormData){
 const principal=await getAdminSession();
 requireMarketplaceSuperAdminRole(principal);
 assertAdminCsrf(principal,field(form,"csrf"));
 const euros=field(form,"proposed_budget_eur").trim();
 if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(euros))redirect("/admin/mazi/marketing?notice=invalid");
 const budget=Math.round(Number(euros)*100);
 try {
  await createMaziMarketingBrief(principal,{
   title:field(form,"title"),objective:field(form,"objective"),channel:field(form,"channel"),
   region:field(form,"region"),targetSector:field(form,"target_sector"),
   proposedBudgetCents:budget,
   startsOn:field(form,"starts_on")||null,endsOn:field(form,"ends_on")||null
  });
 } catch(e){
  if(e instanceof Error&&e.message==="MAZI_MARKETING_INPUT_INVALID")
   redirect("/admin/mazi/marketing?notice=invalid");
  throw e;
 }
 revalidatePath("/admin/mazi/marketing");
 redirect("/admin/mazi/marketing?notice=created");
}
export async function transitionMarketingBriefAction(form:FormData){
 const principal=await getAdminSession();
 requireMarketplaceSuperAdminRole(principal);
 assertAdminCsrf(principal,field(form,"csrf"));
 const value=field(form,"status");
 if(!["draft","review","archived"].includes(value))
  redirect("/admin/mazi/marketing?notice=invalid");
 await transitionMaziMarketingBrief(principal,field(form,"brief_id"),value as "draft"|"review"|"archived");
 revalidatePath("/admin/mazi/marketing");
 redirect("/admin/mazi/marketing?notice=updated");
}

export async function issueCreativeInvitationAction(form:FormData){
 const principal=await getAdminSession();requireMarketplaceSuperAdminRole(principal);
 assertAdminCsrf(principal,field(form,"csrf"));
 try{await issueMaziCreativeInvitation(principal,{
  briefId:field(form,"brief_id"),memberUserId:field(form,"member_user_id"),
  creativeText:field(form,"creative_text"),assetDescription:field(form,"asset_description"),
  destinationUrl:field(form,"destination_url")
 });}catch(e){
  if(e instanceof Error&&["MAZI_CREATIVE_INPUT_INVALID","MAZI_CREATIVE_DESTINATION_INVALID","MAZI_CREATIVE_NO_MATCHING_INTEREST"].includes(e.message))
   redirect("/admin/mazi/marketing?notice=creative_invalid");
  if((e as {code?:string}).code==="23505")redirect("/admin/mazi/marketing?notice=creative_duplicate");
  throw e;
 }
 revalidatePath("/admin/mazi/marketing");
 redirect("/admin/mazi/marketing?notice=creative_issued");
}
export async function revokeCreativeInvitationAction(form:FormData){
 const principal=await getAdminSession();requireMarketplaceSuperAdminRole(principal);
 assertAdminCsrf(principal,field(form,"csrf"));
 await revokeMaziCreativeInvitation(principal,field(form,"invitation_id"));
 revalidatePath("/admin/mazi/marketing");
 redirect("/admin/mazi/marketing?notice=creative_revoked");
}
