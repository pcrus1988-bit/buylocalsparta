import { requireAccountSession } from "../../../../../../lib/account-session";
import { customerStateSnapshot } from "../../../../../../lib/customer-state-runtime";
import { buildPrivacyReportSnapshot, privacyReportJson, renderPrivacyReportPdf } from "../../../../../../lib/privacy-report-runtime";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request,{params}:{params:Promise<{requestId:string}>}){
  try{
    const principal=await requireAccountSession(request);
    const {requestId}=await params;
    const state=await customerStateSnapshot(principal.userId);
    const item=state.privacyRequests.find((entry)=>entry.id===requestId);
    if(!item)return Response.json({error:"privacy_request_not_found"},{status:404,headers:{"cache-control":"no-store"}});
    if(!["access","export"].includes(item.type))return Response.json({error:"privacy_report_not_available_for_request_type"},{status:400,headers:{"cache-control":"no-store"}});
    const automation=item.outcome&&typeof item.outcome==="object"&&!Array.isArray(item.outcome)?(item.outcome as Record<string,unknown>).automation:undefined;
    const explicitlyReady=automation&&typeof automation==="object"&&!Array.isArray(automation)&&Boolean((automation as Record<string,unknown>).reportReady);
    const legacyTerminalReport=["completed","partially_completed"].includes(item.status);
    if(!explicitlyReady&&!legacyTerminalReport)return Response.json({error:"privacy_report_not_ready"},{status:409,headers:{"cache-control":"no-store"}});
    const url=new URL(request.url);
    const format=url.searchParams.get("format")==="json"?"json":"pdf";
    const snapshot=await buildPrivacyReportSnapshot(principal.userId,principal.userId);
    const filename=`KONTA-MOU-GDPR-${item.id.replace(/[^A-Za-z0-9_-]+/g,"-")}`;
    if(format==="json")return new Response(privacyReportJson(snapshot),{headers:{"content-type":"application/json; charset=utf-8","content-disposition":`attachment; filename="${filename}.json"`,"cache-control":"no-store"}});
    const pdf=await renderPrivacyReportPdf(snapshot,item.id);
    return new Response(new Uint8Array(pdf),{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="${filename}.pdf"`,"cache-control":"no-store"}});
  }catch(error){
    const message=error instanceof Error?error.message:"privacy_report_failed";
    return Response.json({error:message},{status:message==="AUTH_REQUIRED"?401:400,headers:{"cache-control":"no-store"}});
  }
}
