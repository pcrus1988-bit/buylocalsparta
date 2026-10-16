import {PostgresCustomerAddressService} from "@buy-local-sparta/postgres-runtime/customer-addresses";
import {PostgresFixedWindowRateLimiter} from "@buy-local-sparta/postgres-runtime";
import {requireMobileBearer,companionEnabled} from "../../../../../lib/companion-mobile-auth";
import {parseCompanionNewAddress} from "../../../../../lib/companion-address-policy";
import {customerBrowserAddressProfile} from "../../../../../lib/customer-account-browser-view";
import {getProductionPostgresRuntime,productionDatabaseConfigured} from "../../../../../lib/postgres-runtime";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const HEADERS={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"};
function active(){
 return companionEnabled()&&process.env.COMPANION_ANDROID_ADDRESSES_ENABLED==="true"
  &&productionDatabaseConfigured();
}
function service(){return new PostgresCustomerAddressService(getProductionPostgresRuntime().sqlPool);}
export async function GET(request:Request){
 if(!active())return Response.json({error:"NOT_ENABLED"},{status:503,headers:HEADERS});
 let customerId:string;
 try{customerId=(await requireMobileBearer(request)).publicId;}
 catch{return Response.json({error:"UNAUTHORIZED"},{status:401,headers:HEADERS});}
 try{
  const result=await service().profile(customerId);
  return Response.json({profile:customerBrowserAddressProfile(result)},{headers:HEADERS});
 }catch{
  return Response.json({error:"ADDRESS_UNAVAILABLE"},{status:503,headers:HEADERS});
 }
}
export async function POST(request:Request){
 if(!active())return Response.json({error:"NOT_ENABLED"},{status:503,headers:HEADERS});
 let customerId:string;
 try{customerId=(await requireMobileBearer(request)).publicId;}
 catch{return Response.json({error:"UNAUTHORIZED"},{status:401,headers:HEADERS});}
 let address:ReturnType<typeof parseCompanionNewAddress>;
 try{
  const raw=await request.text();
  if(raw.length>3600)return Response.json({error:"INVALID_ADDRESS"},{status:400,headers:HEADERS});
  address=parseCompanionNewAddress(JSON.parse(raw));
 }catch{
  return Response.json({error:"INVALID_ADDRESS"},{status:400,headers:HEADERS});
 }
 try{
  // Rate-limit address creation per authenticated account; avoid abuse or
  // accidental rapid repeats. No location, billing or payment data in the key.
  const limit=await new PostgresFixedWindowRateLimiter(
   getProductionPostgresRuntime().sqlPool
  ).consume({route:"companion-address-create",key:customerId,limit:5,
   windowMs:60000,now:Date.now()});
  if(!limit.allowed)return Response.json({error:"RATE_LIMITED"},
   {status:429,headers:HEADERS});
  // Solely creates a saved address for the authenticated user, through the same
  // account-owned service used by the existing web checkout. No order side effects.
  const result=await service().upsert(customerId,address,Date.now());
  return Response.json({profile:customerBrowserAddressProfile(result)},
   {status:201,headers:HEADERS});
 }catch{
  return Response.json({error:"ADDRESS_SAVE_UNAVAILABLE"},{status:503,headers:HEADERS});
 }
}
