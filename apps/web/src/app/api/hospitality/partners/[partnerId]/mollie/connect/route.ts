import {hospitalityIdentity} from "../../../../../../../lib/hospitality-partner-access";
import {beginMerchantMollieConnect,MerchantConnectionError} from "../../../../../../../lib/drinkstock-merchant-connections";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{partnerId:string}>}){
 if(process.env.DRINKSTOCK_PARTNER_CONNECT_ENABLED!=="true")
  return Response.json({error:"PARTNER_PROVIDER_CONNECTION_NOT_USED_FOR_FALLBACK",
   providerMode:"kontamou_existing_mollie_and_aade",
   guestPaymentsEnabled:false},{status:410,headers:{"cache-control":"private, no-store"}});

 try{
  const principal=await hospitalityIdentity();if(!principal)return Response.redirect("https://hospitality.kontamou.site/drinkStock/login",303);
  const {partnerId}=await params;
  const url=await beginMerchantMollieConnect(principal.userId,partnerId);
  return Response.redirect(url,303);
 }catch(e){
  const code=e instanceof MerchantConnectionError?e.code:"MOLLIE_CONNECT_UNAVAILABLE";
  return Response.json({error:code,guestPaymentsEnabled:false},{status:e instanceof MerchantConnectionError?e.status:503,headers:{"cache-control":"no-store"}});
 }
}