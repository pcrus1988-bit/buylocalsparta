import {assertFiscalOrigin,fiscalAdminActor,requireFiscalAdmin} from "../../../../../lib/fiscal-auth";
import {FiscalMfaError} from "../../../../../lib/fiscal-operator-mfa";
import {FiscalRecoveryInputError,parseFiscalRecoveryInput} from "../../../../../lib/fiscal-mfa-recovery-input";
import {fiscalRecoveryAction,fiscalRecoveryList} from "../../../../../lib/fiscal-mfa-recovery";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","referrer-policy":"no-referrer",
 "x-content-type-options":"nosniff"};
export async function GET(){
 const actor=await fiscalAdminActor();
 if(!actor)return Response.json({error:"FISCAL_ADMIN_AUTH_REQUIRED"},{status:401,headers});
 try{return Response.json(await fiscalRecoveryList(actor),{headers});}
 catch{return Response.json({error:"RECOVERY_STATUS_UNAVAILABLE"},{status:503,headers});}
}
export async function POST(request:Request){
 try{
  assertFiscalOrigin(request);
  const actor=await requireFiscalAdmin(request);
  if(request.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json")
   return Response.json({error:"JSON_REQUIRED"},{status:415,headers});
  if(Number(request.headers.get("content-length")??0)>400)
   return Response.json({error:"RECOVERY_BODY_TOO_LARGE"},{status:413,headers});
  const raw=await request.text();
  if(Buffer.byteLength(raw,"utf8")>400)
   return Response.json({error:"RECOVERY_BODY_TOO_LARGE"},{status:413,headers});
  let body:unknown;
  try{body=JSON.parse(raw);}catch{return Response.json({error:"INVALID_JSON"},{status:400,headers});}
  const input=parseFiscalRecoveryInput(body);
  return Response.json(await fiscalRecoveryAction(actor,input),{headers});
 }catch(error){
  if(error instanceof FiscalMfaError)
   return Response.json({error:error.code},{status:error.status,headers});
  if(error instanceof FiscalRecoveryInputError)
   return Response.json({error:error.code},{status:400,headers});
  const code=error instanceof Error?error.message:"RECOVERY_UNAVAILABLE";
  if(code==="CSRF_FAILED"||code==="ORIGIN_NOT_ALLOWED")
   return Response.json({error:code},{status:403,headers});
  if(code==="FISCAL_ADMIN_AUTH_REQUIRED")
   return Response.json({error:code},{status:401,headers});
  return Response.json({error:"RECOVERY_UNAVAILABLE"},{status:503,headers});
 }
}
