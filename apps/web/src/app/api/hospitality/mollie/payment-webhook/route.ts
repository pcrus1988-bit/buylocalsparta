import {readDrinkStockMollieWebhook,reconcileDrinkStockMollieWebhook,DrinkStockPaymentVerifyError} from "../../../../../lib/drinkstock-mollie-payment-reconciliation";
export const runtime="nodejs";export const dynamic="force-dynamic";
const headers={"cache-control":"no-store","x-robots-tag":"noindex, nofollow"};
/** Mollie's webhook body only supplies an untrusted payment ID; the payment is
 * retrieved again via this hospitality partner's OWN OAuth connection.
 * Never reuse the marketplace Mollie webhook/order state.
 */
export async function POST(request:Request){
 if(request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()!=="application/x-www-form-urlencoded")
  return Response.json({error:"UNSUPPORTED_WEBHOOK_TYPE"},{status:415,headers});
 const declared=Number(request.headers.get("content-length")??0);
 if(!Number.isFinite(declared)||declared>250)return Response.json({error:"WEBHOOK_TOO_LARGE"},{status:413,headers});
 try{
  const raw=await request.text();
  const paymentId=readDrinkStockMollieWebhook(raw);
  const result=await reconcileDrinkStockMollieWebhook(paymentId);
  return Response.json({ok:true,recognized:result.recognized},{headers});
 }catch(e){
  if(e instanceof DrinkStockPaymentVerifyError)
   return Response.json({error:e.code},{status:e.status,headers});
  // Retryable: provider token expired, unreachable, or database unavailable.
  return Response.json({error:"PAYMENT_VERIFICATION_UNAVAILABLE"},{status:503,headers});
 }
}
