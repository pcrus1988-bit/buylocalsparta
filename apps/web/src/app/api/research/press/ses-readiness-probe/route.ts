import {createHash,timingSafeEqual} from "node:crypto";
import {getSesAccountSendingStatus,sesMailConfigFromEnv} from "../../../../../lib/admin-mail-ses";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const DIGEST="aac94c5230dceb7409537361ae69bb9880823c2fe19e7ed97ebc610c6c0f1d95";
export async function GET(req:Request) {
  if(Date.now()>Date.parse("2026-10-18T02:00:00Z"))
    return Response.json({error:"expired"},{status:410});
  const header=req.headers.get("authorization")||"";
  const value=header.startsWith("Bearer ")?header.slice(7):"";
  if(!value||value.length>100)
    return Response.json({error:"Not found"},{status:404});
  const hashed=createHash("sha256").update(value).digest();
  if(!timingSafeEqual(hashed,Buffer.from(DIGEST,"hex")))
    return Response.json({error:"Not found"},{status:404});
  try{
    const state=await getSesAccountSendingStatus(sesMailConfigFromEnv());
    return Response.json({ok:true,productionAccess:state.productionAccess,
      sendingEnabled:state.sendingEnabled,enforcementStatus:state.enforcementStatus,
      reviewStatus:state.reviewStatus,quota:state.max24HourSend,used:state.sentLast24Hours,
      permitted:state.canSendToUnverifiedRecipients},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"SES account inspection unavailable"},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
