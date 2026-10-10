import { NextResponse } from "next/server";
import { redeemFiscalSsoTicket } from "../../../../lib/fiscal-superadmin-sso";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request){
  const noStore={"cache-control":"no-store","referrer-policy":"no-referrer"};
  if(process.env.FISCAL_STANDALONE_MODE!=="true")
    return Response.json({error:"FISCAL_SSO_REQUIRES_INDEPENDENT_RUNTIME"},{status:503,headers:noStore});
  const trusted=process.env.FISCAL_MARKETPLACE_BASE_URL?.trim();
  if(!trusted)return Response.json({error:"SSO_MARKETPLACE_ORIGIN_NOT_CONFIGURED"},{status:503,headers:noStore});
  let origin:string;
  try{const candidate=new URL(trusted);if(candidate.protocol!=="https:"||candidate.pathname!=="/"||candidate.search||candidate.hash)
    throw Error();origin=candidate.origin;}catch{
    return Response.json({error:"SSO_MARKETPLACE_ORIGIN_INVALID"},{status:503,headers:noStore});
  }
  if(request.headers.get("origin")!==origin)
    return Response.json({error:"SSO_ORIGIN_NOT_ALLOWED"},{status:403,headers:noStore});
  if(Number(request.headers.get("content-length")??0)>4096)
    return Response.json({error:"SSO_BODY_TOO_LARGE"},{status:413,headers:noStore});
  try{
    const body=await request.text();
    if(body.length>4096)throw Error("SSO_BODY_TOO_LARGE");
    const ticket=new URLSearchParams(body).get("ticket")??"";
    await redeemFiscalSsoTicket(ticket,new URL(request.url).origin);
    const res=NextResponse.redirect(new URL("/timologio-admin",request.url),{status:303});
    res.headers.set("cache-control","no-store");
    res.headers.set("referrer-policy","no-referrer");
    return res;
  }catch{
    return Response.json({error:"SSO_TICKET_INVALID_OR_ALREADY_REDEEMED"},{status:403,headers:noStore});
  }
}
