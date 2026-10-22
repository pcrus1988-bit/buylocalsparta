import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
export async function GET(request:Request){
  const origin=new URL(request.url).origin;
  const code=new URL(request.url).searchParams.get("code");
  if(!code)return NextResponse.redirect(new URL("/join?notice=expired_link",origin));
  const db=await createClient();
  const {error}=await db.auth.exchangeCodeForSession(code);
  if(error)return NextResponse.redirect(new URL("/join?notice=expired_link",origin));
  return NextResponse.redirect(new URL("/members",origin));
}
