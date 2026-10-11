import {fiscalPool} from "../../../../../../lib/fiscal-runtime";
import {verifyMarketplaceAssertion} from "../../../../../../lib/fiscal-marketplace-links";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"no-store"};
export async function POST(request:Request){
 try{
  if(request.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json")
   return Response.json({error:"JSON_REQUIRED"},{status:415,headers});
  if(Number(request.headers.get("content-length")??0)>512)
   return Response.json({error:"ASSERTION_TOO_LARGE"},{status:413,headers});
  const body=await request.text();
  if(body.length>512)return Response.json({error:"ASSERTION_TOO_LARGE"},{status:413,headers});
  const timestamp=request.headers.get("x-kmf-timestamp")??"";
  const signature=request.headers.get("x-kmf-signature")??"";
  if(!verifyMarketplaceAssertion(body,timestamp,signature))
   return Response.json({error:"INVALID_SERVICE_ASSERTION"},{status:401,headers});
  let decoded:unknown;
  try{decoded=JSON.parse(body);}catch{return Response.json({error:"INVALID_JSON"},{status:400,headers});}
  if(!decoded||typeof decoded!=="object"||Array.isArray(decoded))
   return Response.json({error:"INVALID_ASSERTION"},{status:400,headers});
  const input=decoded as Record<string,unknown>;
  if(Object.keys(input).sort().join(",")!=="vatNumber,vendorPublicId" ||
     typeof input.vendorPublicId!=="string"||!(/^[A-Za-z0-9_-]{5,160}$/).test(input.vendorPublicId)||
     typeof input.vatNumber!=="string"||!(/^\d{9}$/).test(input.vatNumber))
   return Response.json({error:"INVALID_ASSERTION"},{status:400,headers});
  const r=await fiscalPool().query<{id:string;organization_id:string}>(
   "SELECT l.id,l.organization_id FROM fiscal_marketplace_links l JOIN fiscal_organizations o ON o.id=l.organization_id WHERE l.marketplace_vendor_public_id=$1 AND l.issuer_vat_number=$2 AND l.revoked_at IS NULL AND o.status='approved' AND o.vat_number=l.issuer_vat_number LIMIT 1",
   [input.vendorPublicId,input.vatNumber]);
  return Response.json({linked:Boolean(r.rows[0]),linkId:r.rows[0]?.id??null},{headers});
 }catch{
  return Response.json({error:"FISCAL_LINK_STATUS_UNAVAILABLE"},{status:503,headers});
 }
}
