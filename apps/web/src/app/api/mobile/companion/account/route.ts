import {mobileAccountSnapshot,requireMobileBearer} from "../../../../../lib/companion-mobile-auth";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(request:Request){
 try{
  const user=await requireMobileBearer(request);
  const snapshot=await mobileAccountSnapshot(user.userId);
  return Response.json(snapshot,{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
 }catch{
  return Response.json({error:"UNAUTHORIZED"},{status:401,headers:{"Cache-Control":"no-store"}});
 }
}
