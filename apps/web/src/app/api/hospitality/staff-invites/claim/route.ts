import {hospitalityIdentity} from "../../../../../lib/hospitality-partner-access";
import {assertCustomerCsrf} from "../../../../../lib/customer-state-runtime";
import {claimVenueStaffInvite,StaffInviteError} from "../../../../../lib/drinkstock-staff-invite-service";
import {parseStaffInviteClaim} from "../../../../../lib/drinkstock-staff-invite-policy";
export const runtime="nodejs";export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow","referrer-policy":"no-referrer"};
const fail=(error:string,status:number)=>Response.json({error},{headers,status});
export async function POST(req:Request){
 if(req.headers.get("origin")!==new URL(req.url).origin)return fail("INVALID_ORIGIN",403);
 if(req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()!=="application/json")return fail("BAD_CONTENT_TYPE",415);
 if(Number(req.headers.get("content-length")??0)>512)return fail("REQUEST_TOO_LARGE",413);
 try{
  const identity=await hospitalityIdentity();if(!identity)return fail("AUTH_REQUIRED",401);
  assertCustomerCsrf(identity,req.headers.get("x-csrf-token")??undefined);
  const raw=await req.text();if(raw.length>512)return fail("REQUEST_TOO_LARGE",413);
  let token:string;
  try{token=parseStaffInviteClaim(JSON.parse(raw) as unknown).token;}
  catch{return fail("INVALID_STAFF_CLAIM",400);}
  return Response.json(await claimVenueStaffInvite(identity.userId,token),{headers});
 }catch(e){
  if(e instanceof Error&&e.message.includes("CSRF validation failed"))return fail("INVALID_CSRF",403);
  if(e instanceof StaffInviteError)return fail(e.code,e.status);
  return fail("STAFF_CLAIM_UNAVAILABLE",503);
 }
}
