import {assertFiscalCsrf,assertFiscalOrigin,getFiscalActor} from "../../../../../lib/fiscal-auth";
import {FiscalApiError} from "../../../../../lib/fiscal-api-clients";
import {createFiscalConsoleDraft} from "../../../../../lib/fiscal-drafts";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store"};

export async function POST(request:Request){
 try{
  assertFiscalOrigin(request);
  const actor=await getFiscalActor();
  if(!actor||actor.role!=="merchant")
   return Response.json({error:"MERCHANT_AUTH_REQUIRED"},{status:401,headers});
  assertFiscalCsrf(actor,request.headers.get("x-csrf-token"));
  if(request.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json")
   return Response.json({error:"JSON_REQUIRED"},{status:415,headers});
  if(Number(request.headers.get("content-length")??0)>16384)
   return Response.json({error:"DRAFT_TOO_LARGE"},{status:413,headers});
  const body=await request.text();
  if(Buffer.byteLength(body,"utf8")>16384)return Response.json({error:"DRAFT_TOO_LARGE"},{status:413,headers});
  let input:unknown;
  try{input=JSON.parse(body)}catch{return Response.json({error:"INVALID_JSON"},{status:400,headers})}
  if(!input||typeof input!=="object"||Array.isArray(input))
   return Response.json({error:"INVALID_DRAFT"},{status:400,headers});
  const data=input as Record<string,unknown>;
  const allowed=["organizationId","lane","externalId","reference","grossMinor","items"];
  if(Object.keys(data).some(key=>!allowed.includes(key)))
   return Response.json({error:"UNEXPECTED_DRAFT_FIELDS"},{status:400,headers});
  if(typeof data.organizationId!=="string")
   return Response.json({error:"INVALID_ORGANIZATION"},{status:400,headers});
  const result=await createFiscalConsoleDraft(actor,data.organizationId,{
   lane:data.lane,externalId:data.externalId,reference:data.reference,grossMinor:data.grossMinor,items:data.items
  });
  return Response.json({...result,status:"draft",fiscalIssuanceEnabled:false},
   {status:result.created?201:200,headers});
 }catch(error){
  if(error instanceof FiscalApiError)
   return Response.json({error:error.code},{status:error.status,headers});
  if(error instanceof Error&&["ORIGIN_NOT_ALLOWED","CSRF_FAILED"].includes(error.message))
   return Response.json({error:error.message},{status:403,headers});
  return Response.json({error:"FISCAL_CONSOLE_UNAVAILABLE"},{status:503,headers});
 }
}
