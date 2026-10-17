import {createHash,timingSafeEqual} from "node:crypto";
import {getSesAccountSendingStatus,sesMailConfigFromEnv} from "../../../../../lib/admin-mail-ses";

export const runtime="nodejs";
export const dynamic="force-dynamic";
// Single-purpose, bearer-restricted SES account status probe; removed immediately after use.
const EXPECTED_SHA256="65be2602bce6be0b54cd1a518be50d9d1e5138af1ea6b3039dd1aba7a1a613d7";
export async function GET(request:Request){
  const reject=()=>Response.json({error:"Not found"},{status:404,headers:{"cache-control":"no-store"}});
  if(Date.now()>Date.parse("2026-10-18T02:00:00Z"))return reject();
  const bearer=request.headers.get("authorization")||"";
  const token=bearer.startsWith("Bearer ")?bearer.slice(7):"";
  if(!token||token.length>120)return reject();
  if(!timingSafeEqual(createHash("sha256").update(token).digest(),Buffer.from(EXPECTED_SHA256,"hex")))return reject();
  try{
    const status=await getSesAccountSendingStatus(sesMailConfigFromEnv());
    return Response.json({
      ok:true,productionAccess:status.productionAccess,
      sendingEnabled:status.sendingEnabled,enforcementStatus:status.enforcementStatus,
      reviewStatus:status.reviewStatus,
      max24HourSend:status.max24HourSend,sentLast24Hours:status.sentLast24Hours,
      approvedForProduction:status.canSendToUnverifiedRecipients
    },{headers:{"cache-control":"no-store"}});
  }catch(e){
    return Response.json({ok:false,error:e instanceof Error?e.message:"SES account check unavailable"},{status:503,headers:{"cache-control":"no-store"}});
  }
}
