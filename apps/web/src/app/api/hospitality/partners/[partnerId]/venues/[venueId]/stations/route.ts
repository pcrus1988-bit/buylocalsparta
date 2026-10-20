import {hospitalityIdentity} from "../../../../../../../../lib/hospitality-partner-access";
import {assertCustomerCsrf} from "../../../../../../../../lib/customer-state-runtime";
import {StationAccessError,stationStaffDirectory,changeStationAssignment} from "../../../../../../../../lib/drinkstock-station-access-service";
import {parseStationAssignment} from "../../../../../../../../lib/drinkstock-station-policy";
export const runtime="nodejs";export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow"};
const fail=(error:string,status:number)=>Response.json({error},{status,headers});
const err=(e:unknown)=>e instanceof StationAccessError?
 fail(e.code,e.status):fail("STAFF_DIRECTORY_UNAVAILABLE",503);
type Params={partnerId:string;venueId:string};
export async function GET(_request:Request,{params}:{params:Promise<Params>}){
 try{
  const identity=await hospitalityIdentity();
  if(!identity)return fail("AUTH_REQUIRED",401);
  const p=await params;
  return Response.json(await stationStaffDirectory(identity.userId,p.partnerId,p.venueId),{headers});
 }catch(e){return err(e);}
}
export async function POST(request:Request,{params}:{params:Promise<Params>}){
 if(request.headers.get("origin")!==new URL(request.url).origin)return fail("BAD_ORIGIN",403);
 if(request.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json")return fail("BAD_CONTENT_TYPE",415);
 if(Number(request.headers.get("content-length")??0)>2048)return fail("REQUEST_TOO_LARGE",413);
 try{
  const identity=await hospitalityIdentity();
  if(!identity)return fail("AUTH_REQUIRED",401);
  assertCustomerCsrf(identity,request.headers.get("x-csrf-token")??undefined);
  const raw=await request.text();if(raw.length>2048)return fail("REQUEST_TOO_LARGE",413);
  let command;
  try{command=parseStationAssignment(JSON.parse(raw) as unknown);}
  catch{return fail("INVALID_STATION_ASSIGNMENT",400);}
  const p=await params;
  return Response.json(await changeStationAssignment(identity.userId,p.partnerId,p.venueId,command),{headers});
 }catch(e){
  if(e instanceof Error&&e.message.includes("CSRF validation failed"))return fail("BAD_CSRF",403);
  return err(e);
 }
}
