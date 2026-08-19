import { requireVendorSession } from "../../../../../lib/vendor-session";
import { vendorPlatformInvoicePdfForPrincipal,vendorPlatformInvoices } from "../../../../../lib/vendor-platform-invoices";

export const runtime="nodejs";

export async function GET(request:Request){
  try{
    const principal=await requireVendorSession(request,false);
    const url=new URL(request.url),invoiceId=url.searchParams.get("invoiceId"),document=url.searchParams.get("document");
    if(invoiceId&&document==="pdf"){
      const {pdf,filename}=await vendorPlatformInvoicePdfForPrincipal(principal,invoiceId);
      return new Response(new Uint8Array(pdf),{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="${filename}"`,"cache-control":"private, no-store"}});
    }
    return Response.json({invoices:await vendorPlatformInvoices(principal)});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"vendor_platform_invoice_failed"},{status:400});}
}
