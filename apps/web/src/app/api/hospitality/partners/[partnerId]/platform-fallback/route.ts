import {hospitalityIdentity} from "../../../../../../lib/hospitality-partner-access";
import {PlatformFallbackError,platformFallbackDiagnostics} from "../../../../../../lib/drinkstock-platform-fallback-provider";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow"};
export async function GET(_request:Request,{params}:{params:Promise<{partnerId:string}>}){
 try{
  const principal=await hospitalityIdentity();
  if(!principal)return Response.json({error:"SIGN_IN_REQUIRED"},{status:401,headers});
  const {partnerId}=await params;
  return Response.json(await platformFallbackDiagnostics(principal.userId,partnerId),{headers});
 }catch(error){
  if(error instanceof PlatformFallbackError)return Response.json({error:error.code},{status:error.status,headers});
  return Response.json({error:"PLATFORM_FALLBACK_UNAVAILABLE",checkoutEnabled:false},{status:503,headers});
 }
}