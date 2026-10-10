import {assertFiscalCsrf,assertFiscalOrigin,getFiscalActor} from "../../../../../lib/fiscal-auth";
import {FiscalApiError} from "../../../../../lib/fiscal-api-clients";
import {createFiscalCounterparty} from "../../../../../lib/fiscal-counterparties";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-content-type-options":"nosniff"};
/** Merchant-only test registry. Deliberately no bulk import, actual verification or real-person field. */
export async function POST(request:Request){
 try{
  assertFiscalOrigin(request);
  const actor=await getFiscalActor();
  if(!actor||actor.role!=="merchant")
   return Response.json({error:"MERCHANT_AUTH_REQUIRED"},{status:401,headers});
  assertFiscalCsrf(actor,request.headers.get("x-csrf-token"));
  if(request.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json")
   return Response.json({error:"JSON_REQUIRED"},{status:415,headers});
  if(Number(request.headers.get("content-length")??0)>2048)
   return Response.json({error:"COUNTERPARTY_TOO_LARGE"},{status:413,headers});
  const body=await request.text();
  if(Buffer.byteLength(body,"utf8")>2048)
   return Response.json({error:"COUNTERPARTY_TOO_LARGE"},{status:413,headers});
  let data:unknown;
  try{data=JSON.parse(body)}catch{
   return Response.json({error:"INVALID_JSON"},{status:400,headers});
  }
  if(!data||typeof data!=="object"||Array.isArray(data))
   return Response.json({error:"INVALID_COUNTERPARTY"},{status:400,headers});
  const fields=data as Record<string,unknown>;
  if(Object.keys(fields).some(k=>!["organizationId","kind","legalName","vatNumber"].includes(k)))
   return Response.json({error:"UNEXPECTED_COUNTERPARTY_FIELDS"},{status:400,headers});
  const result=await createFiscalCounterparty(actor,fields.organizationId as string,{
   kind:fields.kind,legalName:fields.legalName,vatNumber:fields.vatNumber
  });
  return Response.json({...result,verificationStatus:"unverified",fiscalIssuanceEnabled:false},
   {status:result.created?201:200,headers});
 }catch(error){
  if(error instanceof FiscalApiError)
   return Response.json({error:error.code},{status:error.status,headers});
  if(error instanceof Error&&["ORIGIN_NOT_ALLOWED","CSRF_FAILED"].includes(error.message))
   return Response.json({error:error.message},{status:403,headers});
  return Response.json({error:"COUNTERPARTY_SERVICE_UNAVAILABLE"},{status:503,headers});
 }
}
