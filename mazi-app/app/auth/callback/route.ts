import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

/** Supports both Supabase SSR PKCE and token-hash email templates. */
export async function GET(request:Request){
  const url=new URL(request.url);
  const db=await createClient();
  const code=url.searchParams.get("code");
  const hash=url.searchParams.get("token_hash");
  const type=url.searchParams.get("type");
  let verified=false;
  if(code && !hash){
    const {error}=await db.auth.exchangeCodeForSession(code);
    verified=!error;
  }else if(hash && (type==="email"||type==="magiclink") && !code){
    const {error}=await db.auth.verifyOtp({token_hash:hash,type});
    verified=!error;
  }
  // Fixed return target: no redirect_to/next open-redirect parameter.
  return NextResponse.redirect(new URL(verified?"/members":"/join?notice=expired_link","https://mazi.kontamou.site"));
}
