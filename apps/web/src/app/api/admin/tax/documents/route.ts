import { requireAdminSession } from "../../../../../lib/admin-session";
import { adminDeliverAcceptedCustomerTaxDocument } from "../../../../../lib/admin-fiscal-reconciliation-runtime";
import { adminPrepareCustomerFiscalDocument } from "../../../../../lib/admin-fiscal-preparation";
import { adminCaptureFiscalOrder } from "../../../../../lib/admin-tax-policy-runtime";

export const runtime="nodejs";

type Body=Record<string,unknown>;
const required=(body:Body,key:string)=>{const value=body[key];if(typeof value!=="string"||!value.trim())throw new Error(`${key} is required`);return value.trim();};
const optional=(body:Body,key:string)=>typeof body[key]==="string"?(body[key] as string).trim()||undefined:undefined;

export async function POST(request:Request){
  try{
    const principal=await requireAdminSession(request,{csrf:true});
    const body=await request.json() as Body;
    const action=required(body,"action");
    if(action==="capture_order")return Response.json(await adminCaptureFiscalOrder(principal,{orderId:required(body,"orderId"),reason:required(body,"reason")}));
    if(action==="deliver_document")return Response.json(await adminDeliverAcceptedCustomerTaxDocument(principal,{documentId:required(body,"documentId"),reason:required(body,"reason")}));
    if(action==="prepare_document")return Response.json(await adminPrepareCustomerFiscalDocument(principal,{
      documentId:required(body,"documentId"),eventCode:required(body,"eventCode"),processor:required(body,"processor"),processorMethod:required(body,"processorMethod"),
      paymentTid:optional(body,"paymentTid"),ecrSigningAuthor:optional(body,"ecrSigningAuthor"),ecrSignature:optional(body,"ecrSignature"),reason:required(body,"reason")
    }));
    throw new Error("Unsupported tax document action");
  }catch(error){return Response.json({error:error instanceof Error?error.message:"tax_document_action_failed"},{status:400});}
}
