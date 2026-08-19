import { adminTransmitMyData } from "../../../../../lib/admin-runtime";
import { requireAdminSession } from "../../../../../lib/admin-session";
import { deliverAcceptedCustomerTaxDocumentById } from "../../../../../lib/customer-tax-delivery";

export async function POST(request:Request){
  try{
    const p=await requireAdminSession(request,{csrf:true});
    const b=await request.json() as {documentId?:unknown};
    if(typeof b.documentId!=="string"||!b.documentId.trim())throw new Error("documentId is required");
    const documentId=b.documentId.trim();
    const result=await adminTransmitMyData(p,documentId);
    try{await deliverAcceptedCustomerTaxDocumentById(documentId);}catch(error){
      console.error(JSON.stringify({level:"error",event:"customer_tax.email_delivery_failed",documentId,message:error instanceof Error?error.message:String(error)}));
    }
    return Response.json(result);
  }catch(e){return Response.json({error:e instanceof Error?e.message:"mydata_transmission_failed"},{status:400})}
}
