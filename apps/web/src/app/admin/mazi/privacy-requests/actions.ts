"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {getAdminSession} from "../../../../lib/admin-session";
import {assertAdminCsrf} from "../../../../lib/admin-runtime";
import {requireMarketplaceSuperAdminRole} from "../../../../lib/mazi-superadmin";
import {createMaziPrivacyRequest,transitionMaziPrivacyRequest} from "../../../../lib/mazi-privacy-rights";

const field=(form:FormData,key:string)=>typeof form.get(key)==="string"?String(form.get(key)).trim():"";
const url="/admin/mazi/privacy-requests";
export async function createMaziPrivacyCaseAction(form:FormData){
 const principal=await getAdminSession();
 requireMarketplaceSuperAdminRole(principal);
 assertAdminCsrf(principal,field(form,"csrf"));
 try{
  await createMaziPrivacyRequest(principal,{
   requestKind:field(form,"request_kind"),receivedOn:field(form,"received_on"),
   evidenceRef:field(form,"evidence_ref")
  });
 }catch(err){
  if(err instanceof Error&&err.message==="MAZI_PRIVACY_CASE_INVALID")
   redirect(url+"?notice=invalid");
  throw err;
 }
 revalidatePath(url);
 redirect(url+"?notice=created");
}
export async function transitionMaziPrivacyCaseAction(form:FormData){
 const principal=await getAdminSession();
 requireMarketplaceSuperAdminRole(principal);
 assertAdminCsrf(principal,field(form,"csrf"));
 try{
  await transitionMaziPrivacyRequest(principal,{
   id:field(form,"case_id"),action:field(form,"action"),evidenceRef:field(form,"evidence_ref"),
   eventOn:field(form,"event_on"),reason:field(form,"reason"),outcome:field(form,"outcome")
  });
 }catch(err){
  if(err instanceof Error&&err.message==="MAZI_PRIVACY_CASE_INVALID")
   redirect(url+"?notice=invalid");
  throw err;
 }
 revalidatePath(url);
 redirect(url+"?notice=updated");
}
