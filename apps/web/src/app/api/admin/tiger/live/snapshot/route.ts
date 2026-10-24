import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../../lib/admin-session";
import { getTigerLiveSnapshot } from "../../../../../../lib/tiger-live";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
  try{
    await requireAdminSession(undefined,{permission:"admin.audit.read"});
    return NextResponse.json(await getTigerLiveSnapshot(),{headers:{"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow"}});
  }catch(error){
    const status=error instanceof Error&&error.message==="ADMIN_AUTH_REQUIRED"?401:403;
    return NextResponse.json({error:"FORBIDDEN"},{status,headers:{"cache-control":"private, no-store"}});
  }
}
