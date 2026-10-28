"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {getAdminSession} from "../../../../lib/admin-session";
import {assertAdminCsrf} from "../../../../lib/admin-runtime";
import {requireMarketplaceSuperAdminRole} from "../../../../lib/mazi-superadmin";
import {recordMaziRetentionCategoryReview} from "../../../../lib/mazi-retention-reviews";
const field=(f:FormData,k:string)=>typeof f.get(k)==="string"?String(f.get(k)).trim():"";
const route="/admin/mazi/retention";
export async function recordMaziRetentionReviewAction(form:FormData){
 const principal=await getAdminSession();
 requireMarketplaceSuperAdminRole(principal);
 assertAdminCsrf(principal,field(form,"csrf"));
 const state=field(form,"state");
 if(!["evidence_recorded","reopened"].includes(state))redirect(route+"?notice=invalid");
 try{
  await recordMaziRetentionCategoryReview(principal,{
   categoryKey:field(form,"category_key"),state,
   checks:form.getAll("review_checks").filter((x):x is string=>typeof x==="string"),
   reference:field(form,"evidence_reference"),summary:field(form,"review_summary")
  });
 }catch(e){
  if(e instanceof Error&&e.message==="MAZI_RETENTION_REVIEW_INVALID")
   redirect(route+"?notice=invalid");
  throw e;
 }
 revalidatePath(route);revalidatePath("/admin/mazi/operations");
 redirect(route+"?notice=recorded");
}
