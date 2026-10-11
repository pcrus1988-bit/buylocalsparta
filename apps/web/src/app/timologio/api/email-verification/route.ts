import {assertFiscalOrigin,assertFiscalCsrf,getFiscalActor,fiscalCsrfValue} from "../../../../lib/fiscal-auth";
import {
 FiscalEmailVerificationError,requestFiscalEmailVerification,confirmFiscalEmailVerification
} from "../../../../lib/fiscal-email-verification";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","referrer-policy":"no-referrer"};
export async function GET(){
 const actor=await getFiscalActor();
 if(!actor||actor.role!=="merchant")
  return Response.json({authenticated:false},{status:401,headers});
 const csrfToken=await fiscalCsrfValue();
 if(!csrfToken)return Response.json({authenticated:false},{status:401,headers});
 return Response.json({authenticated:true,csrfToken},{headers});
}
export async function POST(request:Request){
 try{
  assertFiscalOrigin(request);
  const actor=await getFiscalActor();
  if(!actor||actor.role!=="merchant")
   return Response.json({error:"MERCHANT_AUTH_REQUIRED"},{status:401,headers});
  assertFiscalCsrf(actor,request.headers.get("x-csrf-token"));
  if(request.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json")
   return Response.json({error:"JSON_REQUIRED"},{status:415,headers});
  if(Number(request.headers.get("content-length")??0)>1100)
   return Response.json({error:"EMAIL_REQUEST_TOO_LARGE"},{status:413,headers});
  const text=await request.text();
  if(Buffer.byteLength(text,"utf8")>1100)
   return Response.json({error:"EMAIL_REQUEST_TOO_LARGE"},{status:413,headers});
  let body:unknown;
  try{body=JSON.parse(text)}catch{return Response.json({error:"INVALID_JSON"},{status:400,headers});}
  if(!body||typeof body!=="object"||Array.isArray(body))
   return Response.json({error:"EMAIL_PROOF_INVALID"},{status:400,headers});
  const obj=body as Record<string,unknown>;
  if(obj.action==="request"&&Object.keys(obj).length===1)
   return Response.json(await requestFiscalEmailVerification(actor),{headers});
  if(obj.action==="confirm"&&Object.keys(obj).length===2&&typeof obj.token==="string")
   return Response.json(await confirmFiscalEmailVerification(actor,{token:obj.token}),{headers});
  return Response.json({error:"EMAIL_PROOF_INVALID"},{status:400,headers});
 }catch(error){
  if(error instanceof FiscalEmailVerificationError)
   return Response.json({error:error.code},{status:error.status,headers});
  const code=error instanceof Error?error.message:"EMAIL_VERIFICATION_UNAVAILABLE";
  if(code==="ORIGIN_NOT_ALLOWED"||code==="CSRF_FAILED")
   return Response.json({error:code},{status:403,headers});
  return Response.json({error:"EMAIL_VERIFICATION_UNAVAILABLE"},{status:503,headers});
 }
}
