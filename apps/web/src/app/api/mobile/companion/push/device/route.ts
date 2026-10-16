import {requireMobileBearer} from "../../../../../../../lib/companion-mobile-auth";
import {pushRegistrationEnabled,enrollCompanionDevice,
  companionDeviceStatus,disableCompanionDevice} from "../../../../../../../lib/companion-push-service";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const H={"Cache-Control":"no-store","Referrer-Policy":"no-referrer"};
export async function GET(request:Request){
 try{
  if(!pushRegistrationEnabled())return Response.json({error:"PUSH_NOT_ENABLED"},{status:503,headers:H});
  const p=await requireMobileBearer(request);
  return Response.json(await companionDeviceStatus(p),{headers:H});
 }catch{return Response.json({error:"UNAUTHORIZED"},{status:401,headers:H});}
}
export async function PUT(request:Request){
 try{
  if(!pushRegistrationEnabled())return Response.json({error:"PUSH_NOT_ENABLED"},{status:503,headers:H});
  const p=await requireMobileBearer(request);
  const raw=await request.text();
  if(raw.length>2600)return Response.json({error:"INVALID_REQUEST"},{status:400,headers:H});
  const payload=JSON.parse(raw) as {token?:unknown;purposes?:unknown};
  const result=await enrollCompanionDevice(p,payload.token,payload.purposes);
  return Response.json(result,{headers:H});
 }catch{
  // Never reflect a supplied token, and never reveal whether it belongs to another user.
  return Response.json({error:"PUSH_REGISTRATION_FAILED"},{status:400,headers:H});
 }
}
export async function DELETE(request:Request){
 try{
  if(!pushRegistrationEnabled())return Response.json({error:"PUSH_NOT_ENABLED"},{status:503,headers:H});
  const p=await requireMobileBearer(request);
  return Response.json(await disableCompanionDevice(p),{headers:H});
 }catch{return Response.json({error:"PUSH_DISABLE_FAILED"},{status:401,headers:H});}
}
