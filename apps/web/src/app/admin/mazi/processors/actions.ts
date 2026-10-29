"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {getAdminSession} from "../../../../lib/admin-session";
import {assertAdminCsrf} from "../../../../lib/admin-runtime";
import {requireMarketplaceSuperAdminRole} from "../../../../lib/mazi-superadmin";
import {recordMaziProcessorReview} from "../../../../lib/mazi-processor-reviews";
const route="/admin/mazi/processors";
const field=(f:FormData,k:string)=>typeof f.get(k)==="string"?String(f.get(k)).trim():"";
export async function recordMaziProcessorReviewAction(form:FormData){
 const principal=await getAdminSession();
 requireMarketplaceSuperAdminRole(principal);
 assertAdminCsrf(principal,field(form,"csrf"));
 try{
  await recordMaziProcessorReview(principal,{
   domainKey:field(form,"domain_key"),state:field(form,"review_state"),
   usage:field(form,"usage_state"),role:field(form,"processing_role"),
   transfer:field(form,"transfer_mechanism"),reviewedOn:field(form,"reviewed_on"),
   checks:form.getAll("review_checks").filter((x):x is string=>typeof x==="string"),
   agreement:field(form,"agreement_reference"),reference:field(form,"evidence_reference"),
   findings:field(form,"findings")
  });
 }catch(err){
  if(err instanceof Error&&err.message==="MAZI_PROCESSOR_REVIEW_INVALID")
   redirect(route+"?notice=invalid");
  throw err;
 }
 revalidatePath(route);revalidatePath("/admin/mazi/operations");
 redirect(route+"?notice=recorded");
}
