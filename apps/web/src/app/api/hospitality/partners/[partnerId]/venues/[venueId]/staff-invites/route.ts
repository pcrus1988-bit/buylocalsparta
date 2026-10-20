import {hospitalityIdentity} from "../../../../../../../../lib/hospitality-partner-access";
import {assertCustomerCsrf} from "../../../../../../../../lib/customer-state-runtime";
import {createVenueStaffInvite,pendingVenueInvites,revokeVenueStaffInvite,StaffInviteError} from "../../../../../../../../lib/drinkstock-staff-invite-service";
import {parseStaffInviteCreate,parseStaffInviteRevoke} from "../../../../../../../../lib/drinkstock-staff-invite-policy";
export const runtime="nodejs";export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow","referrer-policy":"no-referrer"};
type Scope={partnerId:string;venueId:string};
const fail=(error:string,status:number)=>Response.json({error},{status,headers});
const errorOut=(e:unknown)=>e instanceof StaffInviteError?
 fail(e.code,e.status):fail("STAFF_INVITES_UNAVAILABLE",503);
export async function GET(_req:Request,{params}:{params:Promise<Scope>}){
 try{
  const id=await hospitalityIdentity();if(!id)return fail("AUTH_REQUIRED",401);
  const {partnerId,venueId}=await params;
  return Response.json({invitations:await pendingVenueInvites(id.userId,partnerId,venueId)},{headers});
 }catch(e){return errorOut(e);}
}
export async function POST(req:Request,{params}:{params:Promise<Scope>}){
 if(req.headers.get("origin")!==new URL(req.url).origin)return fail("INVALID_ORIGIN",403);
 if(req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()!=="application/json")return fail("BAD_CONTENT_TYPE",415);
 const rawLength=Number(req.headers.get("content-length")??0);
 if(!Number.isFinite(rawLength)||rawLength>1500)return fail("REQUEST_TOO_LARGE",413);
 try{
  const id=await hospitalityIdentity();if(!id)return fail("AUTH_REQUIRED",401);
  assertCustomerCsrf(id,req.headers.get("x-csrf-token")??undefined);
  const text=await req.text();if(text.length>1500)return fail("REQUEST_TOO_LARGE",413);
  const v=JSON.parse(text) as Record<string,unknown>;
  if(!v||typeof v!=="object"||Array.isArray(v))return fail("INVALID_STAFF_INVITE",400);
  const scope=await params;
  if(v.operation==="create"){
   let input;
   try{input=parseStaffInviteCreate({email:v.email,bar:v.bar,waiter:v.waiter,requestKey:v.requestKey});}
   catch{return fail("INVALID_STAFF_INVITE",400);}
   return Response.json(await createVenueStaffInvite(id.userId,scope.partnerId,scope.venueId,input),{headers});
  }
  if(v.operation==="revoke"){
   let input;
   try{input=parseStaffInviteRevoke({invitationId:v.invitationId});}
   catch{return fail("INVALID_STAFF_REVOKE",400);}
   return Response.json(await revokeVenueStaffInvite(id.userId,scope.partnerId,scope.venueId,input.invitationId),{headers});
  }
  return fail("INVALID_STAFF_INVITE_OPERATION",400);
 }catch(e){
  if(e instanceof SyntaxError)return fail("INVALID_JSON",400);
  if(e instanceof Error&&e.message.includes("CSRF validation failed"))return fail("INVALID_CSRF",403);
  return errorOut(e);
 }
}
