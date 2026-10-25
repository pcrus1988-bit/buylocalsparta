"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {getAdminSession} from "../../../../lib/admin-session";
import {assertAdminCsrf} from "../../../../lib/admin-runtime";
import {requireMarketplaceSuperAdminRole} from "../../../../lib/mazi-superadmin";
import {recordMaziLaunchGateReview} from "../../../../lib/mazi-operations";

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
   evidence:field(form,"evidence")
  });
 }catch{
  redirect("/admin/mazi/operations?notice=gate_not_saved");
 }
 revalidatePath("/admin/mazi/operations");
 redirect("/admin/mazi/operations?notice=gate_recorded");
}
