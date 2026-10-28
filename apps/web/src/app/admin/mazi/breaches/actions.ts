"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {getAdminSession} from "../../../../lib/admin-session";
import {assertAdminCsrf} from "../../../../lib/admin-runtime";
import {requireMarketplaceSuperAdminRole} from "../../../../lib/mazi-superadmin";
import {createMaziBreachCase,transitionMaziBreachCase} from "../../../../lib/mazi-breach-response";
const route="/admin/mazi/breaches";
const field=(form:FormData,k:string)=>typeof form.get(k)==="string"?String(form.get(k)).trim():"";
export async function createMaziBreachCaseAction(form:FormData){
 const principal=await getAdminSession();
 requireMarketplaceSuperAdminRole(principal);
 assertAdminCsrf(principal,field(form,"csrf"));
 try{
  await createMaziBreachCase(principal,{awareAt:field(form,"aware_at"),reference:field(form,"evidence_ref")});
 }catch(e){
  if(e instanceof Error&&e.message==="MAZI_BREACH_CASE_INVALID")redirect(route+"?notice=invalid");
  throw e;
 }
 revalidatePath(route);
 redirect(route+"?notice=created");
}
export async function updateMaziBreachCaseAction(form:FormData){
 const principal=await getAdminSession();
 requireMarketplaceSuperAdminRole(principal);
 assertAdminCsrf(principal,field(form,"csrf"));
 try{
  await transitionMaziBreachCase(principal,{
   id:field(form,"case_id"),action:field(form,"action"),reference:field(form,"evidence_ref"),
   risk:field(form,"risk"),effectiveAt:field(form,"effective_at"),
   exception:field(form,"exception"),lateReasonRef:field(form,"late_reason_ref")
  });
 }catch(e){
  if(e instanceof Error&&e.message==="MAZI_BREACH_CASE_INVALID")redirect(route+"?notice=invalid");
  throw e;
 }
 revalidatePath(route);
 redirect(route+"?notice=updated");
}
