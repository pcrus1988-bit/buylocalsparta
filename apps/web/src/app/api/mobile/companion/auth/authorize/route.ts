import {NextResponse} from "next/server";
import {requireAccountSession} from "../../../../../../lib/account-session";
import {assertCustomerCsrf} from "../../../../../../lib/customer-state-runtime";
import {COMPANION_CLIENT_ID,COMPANION_REDIRECT_URI,
  companionEnabled,issueAuthorizationCode,validChallenge,validClient,validState
} from "../../../../../../lib/companion-mobile-auth";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function POST(request:Request){
 try{
  if(!companionEnabled())throw new Error("NOT_ENABLED");
  // Browser form POST must have a matching first-party Origin + session CSRF.
  const origin=request.headers.get("origin");
  if(!origin||origin!==new URL(request.url).origin)throw new Error("INVALID_ORIGIN");
  const form=await request.formData();
  const field=(key:string)=>typeof form.get(key)==="string"?String(form.get(key)):"";
  const challenge=field("code_challenge"),state=field("state");
  if(!validChallenge(challenge)||!validState(state)
    ||!validClient(field("client_id"),field("redirect_uri")))
    throw new Error("INVALID_REQUEST");
  const user=await requireAccountSession();
  assertCustomerCsrf(user,field("csrf_token"));
  const code=await issueAuthorizationCode(user,challenge);
  const url=`${COMPANION_REDIRECT_URI}?${new URLSearchParams({code,state}).toString()}`;
  const result=NextResponse.redirect(url,{status:303});
  result.headers.set("Cache-Control","no-store");
  result.headers.set("Referrer-Policy","no-referrer");
  return result;
 }catch{
  return NextResponse.json({error:"COMPANION_CONNECT_FAILED"},{status:403,headers:{"Cache-Control":"no-store"}});
 }
}
