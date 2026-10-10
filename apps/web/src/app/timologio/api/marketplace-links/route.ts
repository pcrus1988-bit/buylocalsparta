import {assertFiscalCsrf,assertFiscalOrigin,getFiscalActor} from "../../../../lib/fiscal-auth";
import {FiscalApiError} from "../../../../lib/fiscal-api-clients";
import {createMarketplacePairingCode,revokeMarketplaceLink} from "../../../../lib/fiscal-marketplace-links";
export const runtime="nodejs";
const headers={"cache-control":"no-store"};
export async function POST(request:Request){
 try{
  assertFiscalOrigin(request);
  const actor=await getFiscalActor();
  if(!actor||actor.role!=="merchant")return Response.json({error:"FISCAL_MERCHANT_AUTH_REQUIRED"},{status:401,headers});
  assertFiscalCsrf(actor,request.headers.get("x-csrf-token"));
  const body=await request.json() as Record<string,unknown>;
  const organizationId=typeof body.organizationId==="string"?body.organizationId:"";
  if(body.action==="create")return Response.json(await createMarketplacePairingCode(actor,organizationId),{status:201,headers});
  if(body.action==="revoke")return Response.json(await revokeMarketplaceLink(actor,organizationId,String(body.linkId??"")),{headers});
  return Response.json({error:"UNSUPPORTED_ACTION"},{status:400,headers});
 }catch(e){
  const status=e instanceof FiscalApiError?e.status: e instanceof Error&&["ORIGIN_NOT_ALLOWED","CSRF_FAILED"].includes(e.message)?403:503;
  return Response.json({error:e instanceof FiscalApiError?e.code:status===403?"ACCESS_DENIED":"PAIRING_SERVICE_UNAVAILABLE"},{status,headers});
 }
}
