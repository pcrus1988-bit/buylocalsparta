import {assertFiscalOrigin,fiscalPasswordHash} from "../../../../../lib/fiscal-auth";
import {FiscalInvitationError,redeemFiscalInvitation} from "../../../../../lib/fiscal-invitations";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"no-store","referrer-policy":"no-referrer"};
export async function POST(request:Request){
 try{
  assertFiscalOrigin(request);
  if(request.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json")
   return Response.json({error:"JSON_REQUIRED"},{status:415,headers});
  if(Number(request.headers.get("content-length")??0)>3000)
   return Response.json({error:"INVITATION_TOO_LARGE"},{status:413,headers});
  const raw=await request.text();
  if(Buffer.byteLength(raw,"utf8")>3000)
   return Response.json({error:"INVITATION_TOO_LARGE"},{status:413,headers});
  let body:unknown;
  try{body=JSON.parse(raw)}catch{return Response.json({error:"INVALID_JSON"},{status:400,headers});}
  if(!body||typeof body!=="object"||Array.isArray(body))
   return Response.json({error:"INVITATION_INVALID"},{status:400,headers});
  const obj=body as Record<string,unknown>;
  if(Object.keys(obj).some(k=>!["token","password"].includes(k)))
   return Response.json({error:"INVITATION_INVALID"},{status:400,headers});
  const result=await redeemFiscalInvitation(obj.token,obj.password,fiscalPasswordHash);
  return Response.json(result,{status:201,headers});
 }catch(error){
  if(error instanceof FiscalInvitationError)
   return Response.json({error:error.code},{status:error.status,headers});
  const code=error instanceof Error?error.message:"INVITATION_SERVICE_UNAVAILABLE";
  return Response.json({error:code==="ORIGIN_NOT_ALLOWED"?code:"INVITATION_SERVICE_UNAVAILABLE"},{
   status:code==="ORIGIN_NOT_ALLOWED"?403:503,headers});
 }
}
