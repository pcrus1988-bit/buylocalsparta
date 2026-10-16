import {requireMobileBearer} from "../../../../../../../lib/companion-mobile-auth";
import {testCompanionPush} from "../../../../../../../lib/companion-push-service";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function POST(request:Request){
 try{
  const p=await requireMobileBearer(request);
  const result=await testCompanionPush(p);
  return Response.json(result,{headers:{"Cache-Control":"no-store"}});
 }catch{
  return Response.json({error:"PUSH_SELF_TEST_UNAVAILABLE"},{status:429,headers:{"Cache-Control":"no-store"}});
 }
}
