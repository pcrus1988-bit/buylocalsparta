import { requireAdminSession } from "../../../../../lib/admin-session";
import {
  adminApproveAccountingPolicy,
  adminDecideDocumentMapping,
  adminDecidePaymentMapping,
  adminDecidePolicyCheck,
  adminSetFiscalisationRoute
} from "../../../../../lib/admin-tax-policy-runtime";

export const runtime="nodejs";

type Body=Record<string,unknown>;
const required=(body:Body,key:string)=>{const value=body[key];if(typeof value!=="string"||!value.trim())throw new Error(`${key} is required`);return value.trim();};

export async function POST(request:Request){
  try{
    const principal=await requireAdminSession(request,{csrf:true});
    const body=await request.json() as Body;
    const action=required(body,"action");
    const policyId=required(body,"policyId");
    if(action==="set_route"){
      const route=required(body,"route");
      if(route!=="viva_fiscal_provider"&&route!=="aade_direct_erp")throw new Error("Unsupported fiscalisation route");
      return Response.json(await adminSetFiscalisationRoute(principal,{policyId,route,reason:required(body,"reason")}));
    }
    if(action==="decide_check"){
      const status=required(body,"status");
      if(!["approved","rejected","not_applicable"].includes(status))throw new Error("Unsupported check decision");
      return Response.json(await adminDecidePolicyCheck(principal,{policyId,checkCode:required(body,"checkCode"),status:status as "approved"|"rejected"|"not_applicable",evidence:required(body,"evidence")}));
    }
    if(action==="document_mapping"){
      const status=required(body,"status");
      if(!["approved","future","exception","proposed"].includes(status))throw new Error("Unsupported document mapping status");
      return Response.json(await adminDecideDocumentMapping(principal,{policyId,eventCode:required(body,"eventCode"),status:status as "approved"|"future"|"exception"|"proposed",reason:required(body,"reason")}));
    }
    if(action==="payment_mapping"){
      const status=required(body,"status");
      if(!["approved","future","exception","proposed"].includes(status))throw new Error("Unsupported payment mapping status");
      return Response.json(await adminDecidePaymentMapping(principal,{policyId,processor:required(body,"processor"),processorMethod:required(body,"processorMethod"),status:status as "approved"|"future"|"exception"|"proposed",reason:required(body,"reason")}));
    }
    if(action==="approve_policy")return Response.json(await adminApproveAccountingPolicy(principal,{policyId,accountantName:required(body,"accountantName"),reason:required(body,"reason")}));
    throw new Error("Unsupported accounting policy action");
  }catch(error){return Response.json({error:error instanceof Error?error.message:"accounting_policy_action_failed"},{status:400});}
}
