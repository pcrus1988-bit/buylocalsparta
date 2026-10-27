"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {getAdminSession} from "../../../../lib/admin-session";
import {assertAdminCsrf} from "../../../../lib/admin-runtime";
import {requireMarketplaceSuperAdminRole} from "../../../../lib/mazi-superadmin";
import {recordMaziLaunchGateReview} from "../../../../lib/mazi-operations";
import {runMaziAuthEmailProbe} from "../../../../lib/mazi-auth-probe";

const field=(data:FormData,key:string)=>typeof data.get(key)==="string"?String(data.get(key)):"";
export async function reviewMaziLaunchGateAction(form:FormData){
 const principal=await getAdminSession();
 requireMarketplaceSuperAdminRole(principal);
 assertAdminCsrf(principal,field(form,"csrf"));
 const decision=field(form,"decision");
 if(decision!=="verified"&&decision!=="reopened")
  redirect("/admin/mazi/operations?notice=gate_not_saved");
 if(decision==="verified"&&form.get("affirmed")!=="on")
  redirect("/admin/mazi/operations?notice=gate_not_saved");
 try{
  await recordMaziLaunchGateReview(principal,{
   gateKey:field(form,"gate_key"),
   decision,
   evidence:field(form,"evidence"),
   evidenceReference:field(form,"evidence_reference"),
   checkedItems:form.getAll("review_checks").filter((v):v is string=>typeof v==="string")
  });
 }catch{
  redirect("/admin/mazi/operations?notice=gate_not_saved");
 }
 revalidatePath("/admin/mazi/operations");
 redirect("/admin/mazi/operations?notice=gate_recorded");
}

export async function probeMaziAuthDeliveryAction(form:FormData){
 const principal=await getAdminSession();
 requireMarketplaceSuperAdminRole(principal);
 assertAdminCsrf(principal,field(form,"csrf"));
 if(form.get("recipient_has_consented")!=="on")
  redirect("/admin/mazi/operations?notice=probe_not_authorized");
 try{
  const result=await runMaziAuthEmailProbe(principal,field(form,"interest_id"));
  revalidatePath("/admin/mazi/operations");
  redirect("/admin/mazi/operations?notice="+(result==="provider_accepted"?
   "probe_provider_accepted":"probe_provider_failed"));
 }catch(error){
  // Never mistake a Next.js redirect for a provider failure.
  if(error&&typeof error==="object"&&"digest" in error&&
   typeof error.digest==="string"&&error.digest.startsWith("NEXT_REDIRECT"))throw error;
  const code=error instanceof Error?error.message:"";
  const notice=code==="MAZI_AUTH_PROBE_COOLDOWN"?"probe_cooldown":
   code==="MAZI_AUTH_PROBE_NOT_CONFIGURED"?"probe_configuration_missing":
   code==="MAZI_AUTH_PROBE_RECIPIENT_NOT_VERIFIED"?"probe_recipient_unverified":
   "probe_system_error";
  redirect("/admin/mazi/operations?notice="+notice);
 }
}
