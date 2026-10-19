import {requireAdminSession} from "../../../../../lib/admin-session";
import {adminDrinkStockScreens,adminSetDrinkStockScreenFeed} from "../../../../../lib/drinkstock-screen-admin";
import {SessionError} from "../../../../../lib/drinkstock-session-service";
export const runtime="nodejs";export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow"};
function fail(error:unknown){
 const status=error instanceof SessionError?error.status:
 error instanceof Error&&/ADMIN_AUTH_REQUIRED|Admin permission required|CSRF validation failed/.test(error.message)?403:503;
 return Response.json({error:error instanceof SessionError?error.code:status===403?"FORBIDDEN":"UNAVAILABLE"},{status,headers});
}
export async function GET(request:Request){
 try{
  const principal=await requireAdminSession(request,{permission:"vendor.manage"});
  return Response.json({screens:await adminDrinkStockScreens(principal)},{headers});
 }catch(e){return fail(e);}
}
export async function POST(request:Request){
 if(request.headers.get("origin")!==new URL(request.url).origin)
  return Response.json({error:"BAD_ORIGIN"},{status:403,headers});
 if(request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()!=="application/json")
  return Response.json({error:"BAD_CONTENT_TYPE"},{status:415,headers});
 try{
  const principal=await requireAdminSession(request,{permission:"vendor.manage",csrf:true});
  return Response.json(await adminSetDrinkStockScreenFeed(principal,await request.json()),{headers});
 }catch(e){return fail(e);}
}
