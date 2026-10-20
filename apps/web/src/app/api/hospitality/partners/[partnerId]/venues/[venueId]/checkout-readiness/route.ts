import {hospitalityIdentity} from "../../../../../../../../lib/hospitality-partner-access";
import {drinkStockVenueCheckoutReadiness} from "../../../../../../../../lib/drinkstock-checkout-readiness-service";
import {SessionError} from "../../../../../../../../lib/drinkstock-session-service";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow"};

export async function GET(_request:Request,{params}:{params:Promise<{partnerId:string;venueId:string}>}){
 try {
  const user=await hospitalityIdentity();
  if(!user)return Response.json({error:"AUTH_REQUIRED"},{status:401,headers});
  const {partnerId,venueId}=await params;
  const result=await drinkStockVenueCheckoutReadiness(user.userId,partnerId,venueId);
  return Response.json(result,{headers});
 }catch(error){
  if(error instanceof SessionError)
   return Response.json({error:error.code},{status:error.status,headers});
  return Response.json({error:"CHECKOUT_READINESS_UNAVAILABLE"},{status:503,headers});
 }
}
