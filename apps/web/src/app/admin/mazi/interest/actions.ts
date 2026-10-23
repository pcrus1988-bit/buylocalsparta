"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {getAdminSession} from "../../../../lib/admin-session";
import {assertAdminCsrf} from "../../../../lib/admin-runtime";
import {requireMarketplaceSuperAdminRole} from "../../../../lib/mazi-superadmin";
import {reviewMaziInterest} from "../../../../lib/mazi-interest-admin";

const value=(f:FormData,k:string)=>typeof f.get(k)==="string"?String(f.get(k)):"";
export async function reviewMaziInterestAction(form:FormData){
 const principal=await getAdminSession();
 requireMarketplaceSuperAdminRole(principal);
 assertAdminCsrf(principal,value(form,"csrf"));
 const action=value(form,"decision");
 if(action!=="approve"&&action!=="decline")throw Error("MAZI_INTEREST_DECISION_INVALID");
 await reviewMaziInterest(principal,{
  id:value(form,"id"),
  decision:action,
  reason:value(form,"reason"),
  representativeVerified:form.get("representativeVerified")==="on",
  emailVerified:form.get("emailVerified")==="on",
  companyActiveVerified:form.get("companyActiveVerified")==="on"
 });
 revalidatePath("/admin/mazi/interest");
 redirect("/admin/mazi/interest?notice=reviewed");
}
