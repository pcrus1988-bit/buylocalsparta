import { requireAdminSession } from "../../../../../lib/admin-session";
import { adminCreateVendorInvoiceDraft,adminEmailVendorInvoice,adminPrepareVendorInvoice,adminTransmitVendorInvoice,adminVendorBillingWorkspace,vendorPlatformInvoicePdf } from "../../../../../lib/admin-vendor-billing";
import { adminDeleteVendorInvoiceDraft,adminUpdateVendorFeeTaxSetting,adminVendorFeeTaxSettings } from "../../../../../lib/admin-vendor-fee-tax";

export const runtime="nodejs";

export async function GET(request:Request){
  try{
    const principal=await requireAdminSession(request);
    const url=new URL(request.url),invoiceId=url.searchParams.get("invoiceId"),document=url.searchParams.get("document");
    if(invoiceId&&document==="pdf"){
      const {pdf,filename}=await vendorPlatformInvoicePdf(invoiceId);
      return new Response(new Uint8Array(pdf),{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="${filename}"`,"cache-control":"private, no-store"}});
    }
    const [workspace,feeTaxSettings]=await Promise.all([adminVendorBillingWorkspace(principal),adminVendorFeeTaxSettings(principal)]);
    return Response.json({...workspace,feeTaxSettings});
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
    else if(action==="void")await adminDeleteVendorInvoiceDraft(principal,{invoiceId:required(body.invoiceId,"invoiceId"),reason});
    else if(action==="update_fee_tax")await adminUpdateVendorFeeTaxSetting(principal,{agreementId:required(body.agreementId,"agreementId"),feeTaxMode:feeMode(body.feeTaxMode),feeTaxRateBps:integer(body.feeTaxRateBps,"feeTaxRateBps"),reason});
    else throw new Error("Unsupported vendor billing action");
    const [workspace,feeTaxSettings]=await Promise.all([adminVendorBillingWorkspace(principal),adminVendorFeeTaxSettings(principal)]);
    return Response.json({...workspace,feeTaxSettings});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"vendor_billing_action_failed"},{status:400});}
}
function required(v:unknown,name:string){if(typeof v!=="string"||!v.trim())throw new Error(`${name} is required`);return v.trim();}function optional(v:unknown){return typeof v==="string"&&v.trim()?v.trim():undefined;}function integer(v:unknown,name:string){const n=Number(v);if(!Number.isSafeInteger(n))throw new Error(`${name} must be an integer`);return n;}function feeMode(v:unknown):"included"|"plus_vat"|"none"{if(v==="included"||v==="plus_vat"||v==="none")return v;throw new Error("feeTaxMode is invalid");}
