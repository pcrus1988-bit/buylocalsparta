import { requireAdminSession } from "../../../../../lib/admin-session";
import { assertAdminPermission } from "../../../../../lib/admin-runtime";
import { deliverAcceptedCustomerTaxDocumentById } from "../../../../../lib/customer-tax-delivery";
import { configuredMyDataService, myDataAdminRuntimeConfig } from "../../../../../lib/mydata-runtime";

export const runtime="nodejs";

export async function POST(request:Request){
  try{
    const principal=await requireAdminSession(request,{csrf:true});
    assertAdminPermission(principal,"finance.write");
    const body=await request.json() as {documentId?:unknown};
    if(typeof body.documentId!=="string"||!body.documentId.trim())throw new Error("documentId is required");
    const documentId=body.documentId.trim();
    const service=await configuredMyDataService();
    if(!service)throw new Error("AADE myDATA credentials are not configured in Admin/Vault");
    const result=await service.transmitPreparedDocument(principal,{documentId});
    const config=await myDataAdminRuntimeConfig();
    if(config.emailAcceptedDocuments){
      try{await deliverAcceptedCustomerTaxDocumentById(documentId);}catch(error){console.error(JSON.stringify({level:"error",event:"customer_tax.email_delivery_failed",documentId,message:error instanceof Error?error.message:String(error)}));}
    }
    return Response.json(result);
  }catch(error){return Response.json({error:error instanceof Error?error.message:"mydata_transmission_failed"},{status:400});}
}
