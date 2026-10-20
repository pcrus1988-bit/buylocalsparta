import {hospitalityIdentity} from "../../../../../../../../lib/hospitality-partner-access";
import {assertCustomerCsrf} from "../../../../../../../../lib/customer-state-runtime";
import {parseVatReviewCommand,DrinkStockVatReviewError} from "../../../../../../../../lib/drinkstock-vat-review-policy";
import {reviewDrinkStockProductVat} from "../../../../../../../../lib/drinkstock-vat-review-service";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow"};
const fail=(code:string,status:number)=>Response.json({error:code},{status,headers});

export async function POST(request:Request,{params}:{params:Promise<{partnerId:string;venueId:string}>}){
 if(request.headers.get("origin")!==new URL(request.url).origin)
  return fail("INVALID_ORIGIN",403);
 if(request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()!=="application/json")
  return fail("BAD_CONTENT_TYPE",415);
 const len=Number(request.headers.get("content-length")??0);
 if(!Number.isFinite(len)||len>2048)return fail("REQUEST_TOO_LARGE",413);
 try{
  const principal=await hospitalityIdentity();
  if(!principal)return fail("AUTH_REQUIRED",401);
  assertCustomerCsrf(principal,request.headers.get("x-csrf-token")??undefined);
  const raw=await request.text();
  if(raw.length>2048)return fail("REQUEST_TOO_LARGE",413);
  const command=parseVatReviewCommand(JSON.parse(raw) as unknown);
  const {partnerId,venueId}=await params;
  return Response.json(await reviewDrinkStockProductVat(
   principal.userId,partnerId,venueId,command),{headers});
 }catch(error){
  if(error instanceof DrinkStockVatReviewError)return fail(error.code,error.status);
  if(error instanceof SyntaxError)return fail("INVALID_JSON",400);
  if(error instanceof Error&&/CSRF validation failed/.test(error.message))
   return fail("INVALID_CSRF",403);
  return fail("VAT_REVIEW_UNAVAILABLE",503);
 }
}
