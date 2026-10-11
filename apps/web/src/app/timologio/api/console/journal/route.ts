import {assertFiscalCsrf,assertFiscalOrigin,getFiscalActor} from "../../../../../lib/fiscal-auth";
import {FiscalApiError} from "../../../../../lib/fiscal-api-clients";
import {saveFiscalSandboxJournal} from "../../../../../lib/fiscal-sandbox-journal-store";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-content-type-options":"nosniff"};

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
  let parsed:unknown;
  try{parsed=JSON.parse(raw)}catch{
   return Response.json({error:"INVALID_JSON"},{status:400,headers});
  }
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))
   return Response.json({error:"JOURNAL_INVALID_INPUT"},{status:400,headers});
  const data=parsed as Record<string,unknown>;
  if(Object.keys(data).some(key=>!["organizationId","externalId","entries"].includes(key)))
   return Response.json({error:"JOURNAL_UNKNOWN_FIELDS"},{status:400,headers});
  if(typeof data.organizationId!=="string"||typeof data.externalId!=="string")
   return Response.json({error:"JOURNAL_INVALID_INPUT"},{status:400,headers});
  const result=await saveFiscalSandboxJournal(actor,data.organizationId,data.externalId,{entries:data.entries});
  return Response.json({
   id:result.id,created:result.created,status:"saved_test",
   accountingPosted:false,fiscalIssuanceEnabled:false
  },{status:result.created?201:200,headers});
 }catch(error){
  if(error instanceof FiscalApiError)
   return Response.json({error:error.code},{status:error.status,headers});
  if(error instanceof Error&&["ORIGIN_NOT_ALLOWED","CSRF_FAILED"].includes(error.message))
   return Response.json({error:error.message},{status:403,headers});
  return Response.json({error:"JOURNAL_SERVICE_UNAVAILABLE"},{status:503,headers});
 }
}
