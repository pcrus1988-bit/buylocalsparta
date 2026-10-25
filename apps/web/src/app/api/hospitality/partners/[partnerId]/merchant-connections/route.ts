import {hospitalityIdentity} from "../../../../../../lib/hospitality-partner-access";
import {merchantConnectionsStatus,MerchantConnectionError} from "../../../../../../lib/drinkstock-merchant-connections";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{partnerId:string}>}){
 if(process.env.DRINKSTOCK_PARTNER_CONNECT_ENABLED!=="true")
  return Response.json({error:"PARTNER_PROVIDER_CONNECTION_NOT_USED_FOR_FALLBACK",
   providerMode:"kontamou_existing_mollie_and_aade",
   guestPaymentsEnabled:false},{status:410,headers:{"cache-control":"private, no-store"}});

 try{const principal=await hospitalityIdentity();if(!principal)return Response.json({error:"SIGN_IN_REQUIRED"},{status:401});
  const {partnerId}=await params;
  return Response.json(await merchantConnectionsStatus(principal.userId,partnerId),{headers:{"cache-control":"private, no-store"}});
 }catch(e){return Response.json({error:e instanceof MerchantConnectionError?e.code:"UNAVAILABLE"},{status:e instanceof MerchantConnectionError?e.status:503});}
}