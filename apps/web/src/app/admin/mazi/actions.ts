"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession } from "../../../lib/admin-session";
import { assertAdminCsrf } from "../../../lib/admin-runtime";
import { executeMaziSuperAdminAction, requireMarketplaceSuperAdminRole, type MaziOperation } from "../../../lib/mazi-superadmin";

const validUuid=(x:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const only=(form:FormData,key:string)=>typeof form.get(key)==="string"?String(form.get(key)):"";
export async function maziSuperAdminCommand(form:FormData) {
 const principal=await getAdminSession();
 // No MAZI administrators, other operators, vendors or anonymous users.
 requireMarketplaceSuperAdminRole(principal);
 assertAdminCsrf(principal,only(form,"csrf"));
 const kind=only(form,"kind"),id=only(form,"id"),value=only(form,"value");
 let op:MaziOperation;
 if(kind==="application"&&validUuid(id)&&["approve","reject"].includes(value))
   op={kind:"application",id,approve:value==="approve"};
 else if(kind==="proposal"&&validUuid(id)&&["approve","reject"].includes(value))
   op={kind:"proposal",id,approve:value==="approve"};
 else if(kind==="voting"&&validUuid(id)&&["yes","no"].includes(value))
   op={kind:"voting",id,enabled:value==="yes"};
 else if(kind==="cycle"&&["submissions","review","voting","closed"].includes(value))
   op={kind:"cycle",stage:value as MaziOperation & never};
 else throw new Error("MAZI_COMMAND_INVALID");
 await executeMaziSuperAdminAction(principal,op);
 revalidatePath("/admin/mazi");
 redirect("/admin/mazi?notice=updated");
}
