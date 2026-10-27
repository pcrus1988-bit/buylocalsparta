"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {getAdminSession} from "../../../../lib/admin-session";
import {assertAdminCsrf} from "../../../../lib/admin-runtime";
import {requireMarketplaceSuperAdminRole} from "../../../../lib/mazi-superadmin";
import {createMaziMarketingBrief,transitionMaziMarketingBrief} from "../../../../lib/mazi-marketing-admin";

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
