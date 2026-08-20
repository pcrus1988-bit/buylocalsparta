import { requireAdminSession } from "../../../../../lib/admin-session";
import { adminMyDataReportingDiagnostic } from "../../../../../lib/admin-mydata-reporting-runtime";

export const runtime="nodejs";

export async function GET(request:Request){
  try{
    const principal=await requireAdminSession(request);
    const url=new URL(request.url);
    const dateFrom=required(url.searchParams.get("dateFrom"),"dateFrom");
    const dateTo=required(url.searchParams.get("dateTo"),"dateTo");
    const maxPagesRaw=url.searchParams.get("maxPages");
    const maxPages=maxPagesRaw===null?undefined:Number(maxPagesRaw);
    if(maxPages!==undefined&&!Number.isSafeInteger(maxPages))throw new Error("maxPages must be an integer");
    return Response.json(await adminMyDataReportingDiagnostic(principal,{dateFrom,dateTo,maxPages}));
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"mydata_reporting_diagnostic_failed"},{status:400});
  }
}

function required(value:string|null,label:string):string{
  if(!value?.trim())throw new Error(`${label} is required`);
  return value.trim();
}
