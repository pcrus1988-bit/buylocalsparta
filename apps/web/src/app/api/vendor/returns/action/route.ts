import { requireVendorSession } from "../../../../../lib/vendor-session";
import { vendorReturnOperationalAction, vendorReturnsWorkspace } from "../../../../../lib/vendor-backoffice-service";
import { vendorReturnIntakeAction } from "../../../../../lib/return-operations-service";

export async function POST(request:Request){
  try{
    const p=await requireVendorSession(request,true);
    const b=await request.json() as {returnId?:unknown;kind?:unknown;action?:unknown;reference?:unknown;reason?:unknown};
    const returnId=typeof b.returnId==="string"?b.returnId:"";
    const action=typeof b.action==="string"?b.action:"";
    if(b.kind==="intake"){
      if(!["receive","inspect_sellable","inspect_blocked"].includes(action))throw new Error("Invalid vendor return intake action");
      await vendorReturnIntakeAction(p,{returnId,action:action as "receive"|"inspect_sellable"|"inspect_blocked",reason:typeof b.reason==="string"?b.reason:undefined});
    }else{
      const kind=b.kind==="replacement"?"replacement":b.kind==="repair"?"repair":undefined;
      if(!kind)throw new Error("Invalid return action kind");
      await vendorReturnOperationalAction(p,{returnId,kind,action,reference:typeof b.reference==="string"?b.reference:undefined});
    }
    return Response.json(await vendorReturnsWorkspace(p));
  }catch(e){return Response.json({error:e instanceof Error?e.message:"return_action_failed"},{status:400})}
}
