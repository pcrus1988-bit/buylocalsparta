"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {getAdminSession} from "../../../../lib/admin-session";
import {assertAdminCsrf} from "../../../../lib/admin-runtime";
import {requireMarketplaceSuperAdminRole} from "../../../../lib/mazi-superadmin";
import {maziModerateCommunity} from "../../../../lib/mazi-community-moderation";
const field=(form:FormData,key:string)=>typeof form.get(key)==="string"?String(form.get(key)):"";
export async function moderateMaziCommunityAction(form:FormData){
 const principal=await getAdminSession();
 requireMarketplaceSuperAdminRole(principal);
 assertAdminCsrf(principal,field(form,"csrf"));
 const decision=field(form,"decision");
 if(decision!=="hide"&&decision!=="dismiss")redirect("/admin/mazi/moderation?notice=invalid");
 try{
  await maziModerateCommunity(principal,{
    reportId:field(form,"report_id"),decision,reason:field(form,"reason")
  });
 }catch{
  redirect("/admin/mazi/moderation?notice=failed");
 }
 revalidatePath("/admin/mazi/moderation");
 redirect("/admin/mazi/moderation?notice=saved");
}
