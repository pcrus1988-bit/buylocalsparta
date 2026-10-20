import {hospitalityIdentity} from "../../../../../../lib/hospitality-partner-access";
import {merchantConnectionsStatus,MerchantConnectionError} from "../../../../../../lib/drinkstock-merchant-connections";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{partnerId:string}>}){
 try{const principal=await hospitalityIdentity();if(!principal)return Response.json({error:"SIGN_IN_REQUIRED"},{status:401});
  const {partnerId}=await params;
  return Response.json(await merchantConnectionsStatus(principal.userId,partnerId),{headers:{"cache-control":"private, no-store"}});
 }catch(e){return Response.json({error:e instanceof MerchantConnectionError?e.code:"UNAVAILABLE"},{status:e instanceof MerchantConnectionError?e.status:503});}
}