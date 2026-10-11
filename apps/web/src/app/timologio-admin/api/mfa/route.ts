import {assertFiscalOrigin,fiscalAdminActor,requireFiscalAdmin} from "../../../../lib/fiscal-auth";
import {
 FiscalMfaError,exitFiscalMfa,fiscalMfaStatus,proveFiscalMfa,startFiscalMfaEnrollment
} from "../../../../lib/fiscal-operator-mfa";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","referrer-policy":"no-referrer",
 "x-content-type-options":"nosniff"};
export async function GET(){
 const actor=await fiscalAdminActor();
 if(!actor)return Response.json({error:"FISCAL_ADMIN_AUTH_REQUIRED"},{status:401,headers});
 try{return Response.json(await fiscalMfaStatus(actor),{headers});}
 catch{return Response.json({error:"MFA_STATUS_UNAVAILABLE"},{status:503,headers});}
}
export async function POST(request:Request){
 try{
  assertFiscalOrigin(request);
  const actor=await requireFiscalAdmin(request);
  if(request.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json")
   return Response.json({error:"JSON_REQUIRED"},{status:415,headers});
  if(Number(request.headers.get("content-length")??0)>500)
   return Response.json({error:"MFA_BODY_TOO_LARGE"},{status:413,headers});
  const raw=await request.text();
  if(Buffer.byteLength(raw,"utf8")>500)
   return Response.json({error:"MFA_BODY_TOO_LARGE"},{status:413,headers});
  let body:unknown;
  try{body=JSON.parse(raw)}catch{return Response.json({error:"INVALID_JSON"},{status:400,headers});}
  if(!body||typeof body!=="object"||Array.isArray(body))
   return Response.json({error:"MFA_INPUT_INVALID"},{status:400,headers});
  const fields=body as Record<string,unknown>;
  const action=fields.action;
  if(action==="start"&&Object.keys(fields).length===1)
   return Response.json(await startFiscalMfaEnrollment(actor),{headers});
  if((action==="activate"||action==="step_up")&&Object.keys(fields).length===2
    &&typeof fields.code==="string")
   return Response.json(await proveFiscalMfa(actor,action,fields.code),{headers});
  if(action==="exit"&&Object.keys(fields).length===1)
   return Response.json(await exitFiscalMfa(actor),{headers});
  return Response.json({error:"MFA_INPUT_INVALID"},{status:400,headers});
 }catch(error){
  if(error instanceof FiscalMfaError)
   return Response.json({error:error.code},{status:error.status,headers});
  const code=error instanceof Error?error.message:"MFA_UNAVAILABLE";
  if(code==="ORIGIN_NOT_ALLOWED"||code==="CSRF_FAILED")
   return Response.json({error:code},{status:403,headers});
  if(code==="FISCAL_ADMIN_AUTH_REQUIRED")
   return Response.json({error:code},{status:401,headers});
  return Response.json({error:"MFA_UNAVAILABLE"},{status:503,headers});
 }
}
