import {hospitalityIdentity} from "../../../../../../../lib/hospitality-partner-access";
import {assertCustomerCsrf} from "../../../../../../../lib/customer-state-runtime";
import {connectMerchantAade,MerchantConnectionError} from "../../../../../../../lib/drinkstock-merchant-connections";
export const runtime="nodejs";export const dynamic="force-dynamic";
const fail=(error:string,status:number)=>Response.json({error},{status,headers:{"cache-control":"no-store"}});
export async function POST(request:Request,{params}:{params:Promise<{partnerId:string}>}){
 if(request.headers.get("origin")!==new URL(request.url).origin)return fail("INVALID_ORIGIN",403);
 if(request.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json")return fail("INVALID_CONTENT_TYPE",415);
 if(Number(request.headers.get("content-length")??0)>1600)return fail("TOO_LARGE",413);
 try{
  const principal=await hospitalityIdentity();if(!principal)return fail("SIGN_IN_REQUIRED",401);
  assertCustomerCsrf(principal,request.headers.get("x-csrf-token")??undefined);
  const raw=await request.text();if(raw.length>1600)return fail("TOO_LARGE",413);
  const payload=JSON.parse(raw) as unknown;
  const {partnerId}=await params;
  return Response.json(await connectMerchantAade(principal.userId,partnerId,payload),{headers:{"cache-control":"no-store"}});
 }catch(e){
  if(e instanceof MerchantConnectionError)return fail(e.code,e.status);
  if(e instanceof SyntaxError)return fail("INVALID_JSON",400);
  return fail("AADE_CONNECT_UNAVAILABLE",503);
 }
}