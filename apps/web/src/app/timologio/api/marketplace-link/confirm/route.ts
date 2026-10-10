import {getVendorImpersonationSession,getVendorSession} from "../../../../../lib/vendor-session";
import {isVendorTrialPrincipal} from "../../../../../lib/vendor-trial-runtime";
import {assertVendorCsrf} from "../../../../../lib/vendor-runtime";
import {getProductionPostgresRuntime} from "../../../../../lib/postgres-runtime";
import {assertFiscalOrigin} from "../../../../../lib/fiscal-auth";
import {marketplaceLinkSignature} from "../../../../../lib/fiscal-marketplace-links";
export const runtime="nodejs";
const headers={"cache-control":"no-store"};
export async function POST(request:Request){
 try{
  assertFiscalOrigin(request);
  if(await getVendorImpersonationSession())return Response.json({error:"IMPERSONATION_CANNOT_AUTHORIZE_LINK"},{status:403,headers});
  const vendor=await getVendorSession();
  if(!vendor||!vendor.vendorId||!vendor.roles.includes("vendor_owner")||isVendorTrialPrincipal(vendor))
    return Response.json({error:"VERIFIED_VENDOR_OWNER_REQUIRED"},{status:403,headers});
  assertVendorCsrf(vendor,request.headers.get("x-csrf-token")??undefined);
  const input=await request.json() as Record<string,unknown>;
  const code=typeof input.code==="string"?input.code.trim():"";
  if(!/^kmfl_[A-Za-z0-9_-]{43}$/.test(code))return Response.json({error:"INVALID_PAIRING_CODE"},{status:400,headers});
  // Marketplace source of truth: activated business, verified identity, active contract and a live owner membership.
  // Deny research, trial and admin impersonation accounts even if a frontend happens to be visible.
  const result=await getProductionPostgresRuntime().nativePool.query<{
    id:string;public_id:string;tax_number:string
  }>(`SELECT v.id,v.public_id,v.tax_number FROM vendor_businesses v
    JOIN vendor_users vu ON vu.vendor_id=v.id AND vu.active=true
    JOIN vendor_user_roles vr ON vr.vendor_user_id=vu.id AND vr.role='vendor_owner'
    JOIN users u ON u.id=vu.user_id
    WHERE (v.public_id=$1 OR v.id::text=$1)
      AND (u.public_id=$2 OR u.id::text=$2)
      AND v.status='active'
      AND v.verification_completed_at IS NOT NULL
      AND v.contract_started_at IS NOT NULL
      AND v.contract_started_at<=now()
      AND (v.contract_ended_at IS NULL OR v.contract_ended_at>now())
      AND v.tax_number ~ '^[0-9]{9}$'
    LIMIT 1`,[vendor.vendorId,vendor.userId]);
  const identity=result.rows[0];
  if(!identity)return Response.json({error:"VERIFIED_VENDOR_LEGAL_IDENTITY_REQUIRED"},{status:403,headers});
  const base=process.env.FISCAL_SERVICE_BASE_URL?.trim();
  if(!base)return Response.json({error:"FISCAL_CONNECTOR_NOT_CONFIGURED"},{status:503,headers});
  let url:URL;
  try{
   const candidate=new URL(base);
   if(candidate.protocol!=="https:"||candidate.username||candidate.password||candidate.hash||candidate.search)
    throw new Error("INVALID_URL");
   url=new URL("/timologio/api/internal/marketplace-links/redeem",candidate);
  }catch{return Response.json({error:"FISCAL_SERVICE_URL_INVALID"},{status:503,headers});}
  const body=JSON.stringify({code,vendorId:identity.id,vendorPublicId:identity.public_id,vatNumber:identity.tax_number});
  const timestamp=String(Date.now());
  const response=await fetch(url,{
    method:"POST",headers:{"content-type":"application/json","x-kmf-timestamp":timestamp,
      "x-kmf-signature":marketplaceLinkSignature(body,timestamp)},
    body,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)
  });
  const json=await response.json() as {linked?:boolean;linkId?:string;error?:string};
  if(!response.ok)return Response.json({error:json.error??"FISCAL_LINK_REJECTED"},{status:[400,403,409].includes(response.status)?response.status:502,headers});
  if(!json.linked||!json.linkId)return Response.json({error:"FISCAL_LINK_RESULT_INVALID"},{status:502,headers});
  return Response.json({linked:true,linkId:json.linkId,marketplaceVendorId:identity.public_id},{headers});
 }catch(e){
  const code=e instanceof Error?e.message:"ERROR";
  return Response.json({error:["ORIGIN_NOT_ALLOWED","CSRF_FAILED"].includes(code)?code:"MARKETPLACE_LINK_UNAVAILABLE"},
    {status:["ORIGIN_NOT_ALLOWED","CSRF_FAILED"].includes(code)?403:503,headers});
 }
}
