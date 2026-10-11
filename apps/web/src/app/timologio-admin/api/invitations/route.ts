import {FiscalMfaError,requireFiscalOperatorMfa} from "../../../../lib/fiscal-operator-mfa";
import {assertFiscalOrigin,requireFiscalAdmin} from "../../../../lib/fiscal-auth";
import {FiscalInvitationError,issueFiscalInvitation,revokeFiscalInvitation} from "../../../../lib/fiscal-invitations";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","referrer-policy":"no-referrer"};
export async function POST(request:Request){
 try{
  assertFiscalOrigin(request);
  const actor=await requireFiscalAdmin(request);
  await requireFiscalOperatorMfa(actor);
  if(request.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json")
   return Response.json({error:"JSON_REQUIRED"},{status:415,headers});
  if(Number(request.headers.get("content-length")??0)>2500)
   return Response.json({error:"INVITATION_TOO_LARGE"},{status:413,headers});
  const raw=await request.text();
  if(Buffer.byteLength(raw,"utf8")>2500)
   return Response.json({error:"INVITATION_TOO_LARGE"},{status:413,headers});
  let body:unknown;
  try{body=JSON.parse(raw)}catch{return Response.json({error:"INVALID_JSON"},{status:400,headers});}
  if(!body||typeof body!=="object"||Array.isArray(body))
   return Response.json({error:"INVITATION_INVALID"},{status:400,headers});
  const input=body as Record<string,unknown>;
  if(input.action==="issue"){
   const {action,...candidate}=input;
   const invite=await issueFiscalInvitation(actor,candidate);
   return Response.json(invite,{status:201,headers});
  }
  if(input.action==="revoke"){
   const {action,...candidate}=input;
   const result=await revokeFiscalInvitation(actor,candidate);
   return Response.json(result,{headers});
  }
  return Response.json({error:"INVITATION_ACTION_INVALID"},{status:400,headers});
 }catch(error){
  if(error instanceof FiscalMfaError)
   return Response.json({error:error.code},{status:error.status,headers:headers});
  if(error instanceof FiscalInvitationError)
   return Response.json({error:error.code},{status:error.status,headers});
  const code=error instanceof Error?error.message:"INVITATION_SERVICE_UNAVAILABLE";
  const permitted=["FISCAL_ADMIN_AUTH_REQUIRED","CSRF_FAILED","ORIGIN_NOT_ALLOWED"];
  return Response.json({error:permitted.includes(code)?code:"INVITATION_SERVICE_UNAVAILABLE"},{
   status:code==="FISCAL_ADMIN_AUTH_REQUIRED"?401:
    code==="CSRF_FAILED"||code==="ORIGIN_NOT_ALLOWED"?403:503,headers});
 }
}
