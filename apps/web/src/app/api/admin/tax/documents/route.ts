import { requireAdminSession } from "../../../../../lib/admin-session";
import { adminCaptureFiscalOrder } from "../../../../../lib/admin-tax-policy-runtime";

export const runtime="nodejs";

export async function POST(request:Request){
  try{
    const principal=await requireAdminSession(request,{csrf:true});
    const body=await request.json() as {action?:unknown;orderId?:unknown;reason?:unknown};
    if(body.action!=="capture_order")throw new Error("Unsupported tax document action");
    if(typeof body.orderId!=="string"||!body.orderId.trim())throw new Error("orderId is required");
    if(typeof body.reason!=="string"||body.reason.trim().length<3)throw new Error("reason is required");
    return Response.json(await adminCaptureFiscalOrder(principal,{orderId:body.orderId.trim(),reason:body.reason.trim()}));
  }catch(error){return Response.json({error:error instanceof Error?error.message:"tax_document_action_failed"},{status:400});}
}
