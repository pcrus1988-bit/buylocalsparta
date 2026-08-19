import { requireAdminSession } from "../../../../../../lib/admin-session";
import { adminCreateVendorInvoiceDraft,adminEmailVendorInvoice,adminPrepareVendorInvoice,adminTransmitVendorInvoice,adminVendorBillingWorkspace,adminVoidVendorInvoiceDraft,vendorPlatformInvoicePdf } from "../../../../../../lib/admin-vendor-billing";

export const runtime="nodejs";

export async function GET(request:Request){
  try{
    const principal=await requireAdminSession(request);
    const url=new URL(request.url),invoiceId=url.searchParams.get("invoiceId"),document=url.searchParams.get("document");
    if(invoiceId&&document==="pdf"){
      const {pdf,filename}=await vendorPlatformInvoicePdf(invoiceId);
      return new Response(new Uint8Array(pdf),{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="${filename}"`,"cache-control":"private, no-store"}});
    }
    return Response.json(await adminVendorBillingWorkspace(principal));
  }catch(error){return Response.json({error:error instanceof Error?error.message:"vendor_billing_failed"},{status:400});}
}

export async function POST(request:Request){
  try{
    const principal=await requireAdminSession(request,{csrf:true});
    const body=await request.json() as Record<string,unknown>;
    const action=String(body.action??"");
    const reason=required(body.reason,"reason");
    if(action==="create_draft")await adminCreateVendorInvoiceDraft(principal,{vendorId:required(body.vendorId,"vendorId"),periodStart:required(body.periodStart,"periodStart"),periodEnd:required(body.periodEnd,"periodEnd"),includeListingFee:body.includeListingFee===true,recurringFeeOccurrences:integer(body.recurringFeeOccurrences??0,"recurringFeeOccurrences"),notes:optional(body.notes),reason});
    else if(action==="prepare")await adminPrepareVendorInvoice(principal,{invoiceId:required(body.invoiceId,"invoiceId"),processor:required(body.processor,"processor"),processorMethod:required(body.processorMethod,"processorMethod"),reason});
    else if(action==="transmit")await adminTransmitVendorInvoice(principal,{invoiceId:required(body.invoiceId,"invoiceId"),reason});
    else if(action==="email")await adminEmailVendorInvoice(principal,{invoiceId:required(body.invoiceId,"invoiceId"),reason});
    else if(action==="void")await adminVoidVendorInvoiceDraft(principal,{invoiceId:required(body.invoiceId,"invoiceId"),reason});
    else throw new Error("Unsupported vendor billing action");
    return Response.json(await adminVendorBillingWorkspace(principal));
  }catch(error){return Response.json({error:error instanceof Error?error.message:"vendor_billing_action_failed"},{status:400});}
}
function required(v:unknown,name:string){if(typeof v!=="string"||!v.trim())throw new Error(`${name} is required`);return v.trim();}function optional(v:unknown){return typeof v==="string"&&v.trim()?v.trim():undefined;}function integer(v:unknown,name:string){const n=Number(v);if(!Number.isSafeInteger(n))throw new Error(`${name} must be an integer`);return n;}
