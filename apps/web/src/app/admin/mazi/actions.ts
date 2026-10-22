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
 const reason=only(form,"reason").trim();
 let op:MaziOperation;
 if(kind==="application"&&validUuid(id)&&["approve","reject"].includes(value)&&reason.length>=20&&reason.length<=1000)
   op={kind:"application",id,approve:value==="approve",reason};
 else if(kind==="proposal"&&validUuid(id)&&["approve","reject"].includes(value)&&reason.length>=20&&reason.length<=1000)
   op={kind:"proposal",id,approve:value==="approve",reason};
 else if(kind==="voting"&&validUuid(id)&&["yes","no"].includes(value))
   op={kind:"voting",id,enabled:value==="yes"};
 else if(kind==="conflict"&&validUuid(only(form,"voter_id"))&&validUuid(only(form,"proposal_id"))
      &&reason.length>=20&&reason.length<=1000)
   op={kind:"conflict",voterId:only(form,"voter_id"),proposalId:only(form,"proposal_id"),reason};
 else if(kind==="invalidation"&&validUuid(id)&&reason.length>=20&&reason.length<=1000)
   op={kind:"invalidation",voteId:id,reason};
 else if(kind==="identity"&&validUuid(id)) {
   const gemi=only(form,"gemi").trim();
   const evidence=only(form,"evidence").trim();
   if(!/^[0-9]{12}$/.test(gemi)||evidence.length<20||evidence.length>1000)
     throw new Error("MAZI_GEMI_EVIDENCE_INVALID");
   op={kind:"identity",id,gemiNumber:gemi,evidence};
 }
 else if(kind==="cycle"&&["submissions","review","voting","closed"].includes(value))
   op={kind:"cycle",stage:value as "submissions"|"review"|"voting"|"closed"};
 else throw new Error("MAZI_COMMAND_INVALID");
 try { await executeMaziSuperAdminAction(principal,op); }
 catch(err) {
   if((err as {code?:string}).code==="23505") redirect("/admin/mazi?notice=duplicate_entity");
   throw err;
 }
 revalidatePath("/admin/mazi");
 redirect("/admin/mazi?notice=updated");
}
