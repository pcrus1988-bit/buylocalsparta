import { requireAdminSession } from "../../../../../lib/admin-session";
import { adminPrivacyOperationalWorkspace } from "../../../../../lib/admin-privacy-operations";
import { buildAdminPrivacyReportSnapshot, privacyReportJson, renderPrivacyReportPdf } from "../../../../../lib/privacy-report-runtime";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request){
  try{
    const principal=await requireAdminSession(request,{permission:"privacy.read"});
    const url=new URL(request.url);
    const requestId=url.searchParams.get("requestId")?.trim()??"";
    const format=url.searchParams.get("format")==="json"?"json":"pdf";
    const workspace=await adminPrivacyOperationalWorkspace(principal);
    const item=workspace.requests.find((entry)=>entry.id===requestId||entry.referenceNumber===requestId);
    if(!item)return Response.json({error:"privacy_request_not_found"},{status:404,headers:{"cache-control":"no-store"}});
    const snapshot=await buildAdminPrivacyReportSnapshot(principal,item.userId);
    const filename=`KONTA-MOU-GDPR-${item.referenceNumber.replace(/[^A-Za-z0-9_-]+/g,"-")}`;
    if(format==="json"){
      return new Response(privacyReportJson(snapshot),{status:200,headers:{"content-type":"application/json; charset=utf-8","content-disposition":`attachment; filename="${filename}.json"`,"cache-control":"no-store"}});
    }
    const pdf=await renderPrivacyReportPdf(snapshot,item.referenceNumber);
    return new Response(new Uint8Array(pdf),{status:200,headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="${filename}.pdf"`,"cache-control":"no-store"}});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"privacy_report_failed"},{status:400,headers:{"cache-control":"no-store"}});
  }
}
