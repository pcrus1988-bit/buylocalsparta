import {assertFiscalCsrf,assertFiscalOrigin,getFiscalActor} from "../../../../lib/fiscal-auth";
import {createFiscalClient,revokeFiscalClient,FiscalApiError,type FiscalClientKind} from "../../../../lib/fiscal-api-clients";
export const runtime="nodejs";
const headers={"cache-control":"no-store"};
export async function POST(request:Request){
 try{
  assertFiscalOrigin(request);
  const actor=await getFiscalActor();
  if(!actor||actor.role!=="merchant")return Response.json({error:"FISCAL_MERCHANT_AUTH_REQUIRED"},{status:401,headers});
  assertFiscalCsrf(actor,request.headers.get("x-csrf-token"));
  const data=await request.json() as Record<string,unknown>;
  const organizationId=typeof data.organizationId==="string"?data.organizationId:"";
  if(data.action==="create"){
   const result=await createFiscalClient(actor,organizationId,String(data.label??""),String(data.kind??"") as FiscalClientKind);
   return Response.json(result,{status:201,headers});
  }
  if(data.action==="revoke"){
   const result=await revokeFiscalClient(actor,organizationId,String(data.clientId??""));
   return Response.json(result,{headers});
  }
  return Response.json({error:"UNSUPPORTED_ACTION"},{status:400,headers});
 }catch(error){
  const status=error instanceof FiscalApiError?error.status:
    error instanceof Error&&["ORIGIN_NOT_ALLOWED","CSRF_FAILED"].includes(error.message)?403:503;
  const message=error instanceof FiscalApiError?error.code:
    error instanceof Error&&["ORIGIN_NOT_ALLOWED","CSRF_FAILED"].includes(error.message)?error.message:"FISCAL_CLIENT_ACTION_FAILED";
  return Response.json({error:message},{status,headers});
 }
}
