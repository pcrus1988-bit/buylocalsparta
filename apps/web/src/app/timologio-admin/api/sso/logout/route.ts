import { getFiscalSsoAdmin,revokeFiscalSsoSession } from "../../../../../lib/fiscal-superadmin-sso";
import { assertFiscalOrigin } from "../../../../../lib/fiscal-auth";
import {timingSafeEqual} from "node:crypto";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request) {
  try{
    if(process.env.FISCAL_STANDALONE_MODE!=="true")return Response.json({error:"NOT_STANDALONE"},{status:404});
    assertFiscalOrigin(request);
    const actor=await getFiscalSsoAdmin();
    if(!actor)return Response.json({error:"AUTH_REQUIRED"},{status:401});
    const csrf=request.headers.get("x-csrf-token")??"";
    const a=Buffer.from(csrf),b=Buffer.from(actor.csrfToken);
    if(a.length!==b.length||!timingSafeEqual(a,b))return Response.json({error:"CSRF_FAILED"},{status:403});
    await revokeFiscalSsoSession();
    return Response.json({ok:true},{headers:{"cache-control":"no-store"}});
  }catch{return Response.json({error:"LOGOUT_UNAVAILABLE"},{status:503});}
}
