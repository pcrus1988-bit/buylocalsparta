import {createHash,timingSafeEqual} from "node:crypto";
import {getSesAccountSendingStatus,sesMailConfigFromEnv} from "../../../../../lib/admin-mail-ses";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const SHA256="865c9242f3d4bd77626ad8e38b96abc2a3ee876bbd92c5cc3b2c81a5f91c130a";
export async function GET(req:Request){
  const deny=()=>Response.json({error:"Not found"},{status:404,headers:{"Cache-Control":"no-store"}});
  if(Date.now()>Date.parse("2026-10-18T02:00:00Z"))return deny();
  const auth=req.headers.get("authorization")||"";
  const token=auth.startsWith("Bearer ")?auth.slice(7):"";
  if(!token||token.length>120)return deny();
  const received=createHash("sha256").update(token).digest();
  if(!timingSafeEqual(received,Buffer.from(SHA256,"hex")))return deny();
  try{
    const status=await getSesAccountSendingStatus(sesMailConfigFromEnv());
    return Response.json({productionAccess:status.productionAccess,sendingEnabled:status.sendingEnabled,
      enforcementStatus:status.enforcementStatus,reviewStatus:status.reviewStatus,
      max24HourSend:status.max24HourSend,sentLast24Hours:status.sentLast24Hours,
      canSendToUnverifiedRecipients:status.canSendToUnverifiedRecipients},
      {headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"SES status unavailable"},
      {status:503,headers:{"Cache-Control":"no-store"}});
  }
}
