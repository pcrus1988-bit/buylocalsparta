import {assertFiscalCsrf,assertFiscalOrigin,getFiscalActor} from "../../../../../lib/fiscal-auth";
import {previewFiscalSandboxJournal} from "../../../../../lib/fiscal-sandbox-journal";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-content-type-options":"nosniff"};

/** Read-only, session-scoped sandbox preview; no legal book entries are created. */
export async function POST(request:Request){
 try{
  assertFiscalOrigin(request);
  const actor=await getFiscalActor();
  if(!actor||actor.role!=="merchant")
   return Response.json({error:"MERCHANT_AUTH_REQUIRED"},{status:401,headers});
  assertFiscalCsrf(actor,request.headers.get("x-csrf-token"));
  if(request.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json")
   return Response.json({error:"JSON_REQUIRED"},{status:415,headers});
  if(Number(request.headers.get("content-length")??0)>8192)
   return Response.json({error:"JOURNAL_TOO_LARGE"},{status:413,headers});
  const raw=await request.text();
  if(Buffer.byteLength(raw,"utf8")>8192)
   return Response.json({error:"JOURNAL_TOO_LARGE"},{status:413,headers});
  let data:unknown;
  try{data=JSON.parse(raw)}catch{
   return Response.json({error:"INVALID_JSON"},{status:400,headers});
  }
  try{
   const preview=previewFiscalSandboxJournal(data);
   return Response.json({preview},{status:200,headers});
  }catch(error){
   const code=error instanceof Error&&/^JOURNAL_[A-Z_]+$/.test(error.message)
    ?error.message:"JOURNAL_INVALID_INPUT";
   return Response.json({error:code},{status:400,headers});
  }
 }catch(error){
  if(error instanceof Error&&["ORIGIN_NOT_ALLOWED","CSRF_FAILED"].includes(error.message))
   return Response.json({error:error.message},{status:403,headers});
  return Response.json({error:"JOURNAL_SERVICE_UNAVAILABLE"},{status:503,headers});
 }
}
