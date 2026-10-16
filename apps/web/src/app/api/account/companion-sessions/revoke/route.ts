import {NextResponse} from "next/server";
import {requireAccountSession} from "../../../../../lib/account-session";
import {assertCustomerCsrf} from "../../../../../lib/customer-state-runtime";
import {customerRevokeCompanionSession} from "../../../../../lib/companion-mobile-auth";
export const runtime="nodejs";
export async function POST(request:Request){
 try {
  const origin=request.headers.get("origin");
  if(!origin || origin!==new URL(request.url).origin)throw new Error("INVALID_ORIGIN");
  const form=await request.formData();
  const csrf=form.get("csrf_token"),id=form.get("session_id");
  if(typeof csrf!=="string"||typeof id!=="string")throw new Error("INVALID_REQUEST");
  const principal=await requireAccountSession();
  assertCustomerCsrf(principal,csrf);
  await customerRevokeCompanionSession(principal,id);
  const response=NextResponse.redirect(new URL("/account/companion-sessions",request.url),{status:303});
  response.headers.set("Cache-Control","no-store");
  return response;
 }catch{
  return Response.json({error:"REVOKE_FAILED"},{status:403,headers:{"Cache-Control":"no-store"}});
 }
}
