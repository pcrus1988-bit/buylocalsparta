import {timingSafeEqual} from "node:crypto";
import {companionDispatcherEnabled,runCompanionTransactionalPushBatch} from "../../../../../../../lib/companion-push-dispatch";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=60;
const H={"Cache-Control":"no-store","Referrer-Policy":"no-referrer"};

function authorized(request:Request){
 const expected=process.env.COMPANION_PUSH_DISPATCH_SECRET;
 const received=request.headers.get("authorization")??"";
 if(!expected || expected.length<32 || !received.startsWith("Bearer "))return false;
 const actual=received.slice(7);
 const left=Buffer.from(expected,"utf8"),right=Buffer.from(actual,"utf8");
 return left.length===right.length && timingSafeEqual(left,right);
}
export async function POST(request:Request){
 if(!companionDispatcherEnabled())return Response.json(
  {error:"NOT_ENABLED"},{status:503,headers:H});
 if(!authorized(request))return Response.json(
  {error:"UNAUTHORIZED"},{status:401,headers:H});
 try{
  const result=await runCompanionTransactionalPushBatch();
  return Response.json(result,{headers:H});
 }catch{
  return Response.json({error:"DISPATCH_FAILED"},{status:503,headers:H});
 }
}
