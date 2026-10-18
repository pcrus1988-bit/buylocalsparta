import {publicSessionView,SessionError} from "../../../../../../../lib/drinkstock-session-service";
import {buildGuestPricePreview,validateGuestCart,GuestQuoteError} from "../../../../../../../lib/drinkstock-guest-quote";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow","referrer-policy":"no-referrer"};
const fail=(code:string,status:number)=>Response.json({error:code,checkoutEnabled:false},{status,headers});

/** No order creation. This endpoint recomputes a temporary cart preview from venue data. */
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
 if(request.headers.get("origin")!==new URL(request.url).origin)
  return fail("BAD_ORIGIN",403);
 if(request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()!=="application/json")
  return fail("BAD_CONTENT_TYPE",415);
 const declaredSize=Number(request.headers.get("content-length")??0);
 if(!Number.isFinite(declaredSize)||declaredSize>4096)
  return fail("CART_TOO_LARGE",413);
 try{
  const raw=await request.text();
  if(raw.length>4096)return fail("CART_TOO_LARGE",413);
  let parsed:unknown;
  try{parsed=JSON.parse(raw);}catch{return fail("INVALID_JSON",400);}
  const items=validateGuestCart(parsed);
  const {token}=await params;
  const view=await publicSessionView(token,"table");
  const preview=buildGuestPricePreview({items,products:view.products,
   session:view.session,venueId:view.venue.id,tableLabel:view.tableLabel??null});
  return Response.json(preview,{headers});
 }catch(e){
  if(e instanceof GuestQuoteError||e instanceof SessionError)return fail(e.code,e.status);
  return fail("PREVIEW_UNAVAILABLE",503);
 }
}
