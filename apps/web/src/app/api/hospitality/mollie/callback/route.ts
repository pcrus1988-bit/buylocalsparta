import {hospitalityIdentity} from "../../../../../lib/hospitality-partner-access";
import {completeMerchantMollieConnect,MerchantConnectionError} from "../../../../../lib/drinkstock-merchant-connections";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request){
 if(process.env.DRINKSTOCK_PARTNER_CONNECT_ENABLED!=="true")
  return Response.json({error:"PARTNER_PROVIDER_CONNECTION_NOT_USED_FOR_FALLBACK",
   providerMode:"kontamou_existing_mollie_and_aade",
   guestPaymentsEnabled:false},{status:410,headers:{"cache-control":"private, no-store"}});

 const url=new URL(request.url);
 if(url.hostname!=="hospitality.kontamou.site")
  return Response.json({error:"INVALID_CALLBACK_HOST"},{status:403});
 const principal=await hospitalityIdentity();
 if(!principal)return Response.redirect("https://hospitality.kontamou.site/drinkStock/login",303);
 if(url.searchParams.get("error"))
  return Response.redirect("https://hospitality.kontamou.site/drinkStock/dashboard?mollie=denied",303);
 try{
  const state=url.searchParams.get("state")??"",code=url.searchParams.get("code")??"";
  const result=await completeMerchantMollieConnect(principal.userId,state,code);
  const done=new URL("/drinkStock/dashboard/"+result.partnerId+"/payments","https://hospitality.kontamou.site");
  done.searchParams.set("mollie",result.merchantOperational?"connected":"needs_verification");
  return Response.redirect(done,303);
 }catch(e){
  const code=e instanceof MerchantConnectionError?e.code:"MOLLIE_CONNECT_UNAVAILABLE";
  return Response.json({error:code,guestPaymentsEnabled:false},{status:e instanceof MerchantConnectionError?e.status:503,headers:{"cache-control":"no-store","referrer-policy":"no-referrer"}});
 }
}