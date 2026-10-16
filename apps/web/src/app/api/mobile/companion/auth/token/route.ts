import {exchangeAuthorizationCode,rotateMobileSession,revokeMobileSession,
  companionEnabled} from "../../../../../../lib/companion-mobile-auth";
import {PostgresFixedWindowRateLimiter} from "@buy-local-sparta/postgres-runtime";
import {getProductionPostgresRuntime} from "../../../../../../lib/postgres-runtime";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const HEADERS={"Cache-Control":"no-store","Referrer-Policy":"no-referrer","Pragma":"no-cache"};
async function body(request:Request):Promise<Record<string,unknown>>{
 const raw=await request.text();
 if(raw.length>1200)throw new Error("INVALID_REQUEST");
 const value=JSON.parse(raw) as unknown;
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("INVALID_REQUEST");
 return value as Record<string,unknown>;
}
async function throttle(request:Request){
 const ip=request.headers.get("x-real-ip")??request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"unknown";
 const limiter=new PostgresFixedWindowRateLimiter(getProductionPostgresRuntime().sqlPool);
 const verdict=await limiter.consume({route:"companion-mobile-token",key:ip.slice(0,128),limit:25,windowMs:60_000,now:Date.now()});
 if(!verdict.allowed)throw new Error("RATE_LIMITED");
}
export async function POST(request:Request){
 try{
  if(!companionEnabled())return Response.json({error:"NOT_ENABLED"},{status:503,headers:HEADERS});
  await throttle(request);
  const input=await body(request);
  let result;
  if(input.grant_type==="authorization_code"&&typeof input.code==="string"&&typeof input.code_verifier==="string"){
    result=await exchangeAuthorizationCode(input.code,input.code_verifier);
  }else if(input.grant_type==="refresh_token"&&typeof input.refresh_token==="string"){
    result=await rotateMobileSession(input.refresh_token);
  }else throw new Error("INVALID_REQUEST");
  return Response.json({...result},{headers:HEADERS});
 }catch{
  return Response.json({error:"INVALID_GRANT"},{status:401,headers:HEADERS});
 }
}
export async function DELETE(request:Request){
 try {
  if(!companionEnabled())return Response.json({error:"NOT_ENABLED"},{status:503,headers:HEADERS});
  const input=await body(request);
  if(typeof input.refresh_token==="string")await revokeMobileSession(input.refresh_token);
  // Explicit logout is idempotent even if the session has expired.
  return Response.json({revoked:true},{headers:HEADERS});
 }catch{
  return Response.json({error:"LOGOUT_UNAVAILABLE"},{status:503,headers:HEADERS});
 }
}
