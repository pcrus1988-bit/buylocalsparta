import {requireAdminSession} from "../../../../../lib/admin-session";
import {CheckoutFallbackInputError,parseCheckoutFallbackCommand} from "../../../../../lib/drinkstock-checkout-fallback-policy";
import {CheckoutFallbackError,changeCheckoutFallback} from "../../../../../lib/drinkstock-checkout-fallback-service";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow"};
const fail=(error:string,status:number)=>Response.json({error},{status,headers});
/** Admin-only switch. Never a guest payment/order/redirect route. */
export async function POST(request:Request){
 if(request.headers.get("origin")!==new URL(request.url).origin)return fail("INVALID_ORIGIN",403);
 if(request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()!=="application/json")
  return fail("BAD_CONTENT_TYPE",415);
 const len=Number(request.headers.get("content-length")??0);
 if(!Number.isFinite(len)||len>2048)return fail("REQUEST_TOO_LARGE",413);
 try{
  const principal=await requireAdminSession(request,{csrf:true,permission:"vendor.manage"});
  const raw=await request.text();
  if(raw.length>2048)return fail("REQUEST_TOO_LARGE",413);
  const action=parseCheckoutFallbackCommand(JSON.parse(raw) as unknown);
  return Response.json(await changeCheckoutFallback(principal,action),{headers});
 }catch(error){
  if(error instanceof CheckoutFallbackInputError)return fail(error.code,400);
  if(error instanceof CheckoutFallbackError)return fail(error.code,error.status);
  const message=error instanceof Error?error.message:"";
  if(/ADMIN_AUTH_REQUIRED|Admin permission required|CSRF validation failed/.test(message))
    return fail("UNAUTHORIZED",403);
  if(error instanceof SyntaxError)return fail("INVALID_JSON",400);
  return fail("CHECKOUT_FALLBACK_UNAVAILABLE",503);
 }
}
