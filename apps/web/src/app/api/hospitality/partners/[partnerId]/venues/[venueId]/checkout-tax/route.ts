import {hospitalityIdentity} from "../../../../../../../../lib/hospitality-partner-access";
import {assertCustomerCsrf} from "../../../../../../../../lib/customer-state-runtime";
import {updateVenueStandardTaxContext,parseTaxContextAction,VenueTaxContextError} from "../../../../../../../../lib/drinkstock-venue-tax-context-service";
export const runtime="nodejs";export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow"};
const fail=(code:string,status:number)=>Response.json({error:code},{status,headers});
export async function POST(request:Request,{params}:{params:Promise<{partnerId:string;venueId:string}>}){
 if(request.headers.get("origin")!==new URL(request.url).origin)return fail("INVALID_ORIGIN",403);
 if(request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()!=="application/json")return fail("INVALID_TYPE",415);
 const size=Number(request.headers.get("content-length")??0);
 if(!Number.isFinite(size)||size>1200)return fail("REQUEST_TOO_LARGE",413);
 try{
  const user=await hospitalityIdentity();if(!user)return fail("AUTH_REQUIRED",401);
  assertCustomerCsrf(user,request.headers.get("x-csrf-token")??undefined);
  const raw=await request.text();if(raw.length>1200)return fail("REQUEST_TOO_LARGE",413);
  const action=parseTaxContextAction(JSON.parse(raw) as unknown);
  const {partnerId,venueId}=await params;
  return Response.json(await updateVenueStandardTaxContext(user.userId,partnerId,venueId,action),{headers});
 }catch(e){
  if(e instanceof SyntaxError)return fail("INVALID_JSON",400);
  if(e instanceof Error&&e.message.includes("CSRF validation failed"))return fail("CSRF_FAILED",403);
  if(e instanceof VenueTaxContextError)return fail(e.code,e.status);
  return fail("TAX_REVIEW_UNAVAILABLE",503);
 }
}
