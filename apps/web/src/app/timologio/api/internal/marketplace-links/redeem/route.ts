import {redeemMarketplaceCode,verifyMarketplaceAssertion} from "../../../../../../lib/fiscal-marketplace-links";
import {FiscalApiError} from "../../../../../../lib/fiscal-api-clients";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"no-store"};
export async function POST(request:Request){
 try{
  if(request.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json")
    return Response.json({error:"JSON_REQUIRED"},{status:415,headers});
  if(Number(request.headers.get("content-length")??0)>1024)
    return Response.json({error:"ASSERTION_TOO_LARGE"},{status:413,headers});
  const body=await request.text();
  if(body.length>1024)return Response.json({error:"ASSERTION_TOO_LARGE"},{status:413,headers});
  const timestamp=request.headers.get("x-kmf-timestamp")??"";
  const signature=request.headers.get("x-kmf-signature")??"";
  if(!verifyMarketplaceAssertion(body,timestamp,signature))
    return Response.json({error:"INVALID_SERVICE_ASSERTION"},{status:401,headers});
  let decoded:unknown;
  try{decoded=JSON.parse(body);}catch{return Response.json({error:"INVALID_JSON"},{status:400,headers});}
  if(!decoded||typeof decoded!=="object"||Array.isArray(decoded))
    return Response.json({error:"INVALID_ASSERTION"},{status:400,headers});
  const input=decoded as Record<string,unknown>;
  if(Object.keys(input).sort().join(",")!=="code,vatNumber,vendorId,vendorPublicId")
    return Response.json({error:"INVALID_ASSERTION"},{status:400,headers});
  return Response.json(await redeemMarketplaceCode({code:input.code,vendorId:input.vendorId,vendorPublicId:input.vendorPublicId,vatNumber:input.vatNumber}),{headers});
 }catch(e){
  const status=e instanceof FiscalApiError?e.status:503;
  return Response.json({error:e instanceof FiscalApiError?e.code:"PAIRING_SERVICE_UNAVAILABLE"},{status,headers});
 }
}
