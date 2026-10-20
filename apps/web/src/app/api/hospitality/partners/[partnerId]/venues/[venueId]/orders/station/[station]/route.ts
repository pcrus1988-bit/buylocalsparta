import {hospitalityIdentity} from "../../../../../../../../../../lib/hospitality-partner-access";
import {assertCustomerCsrf} from "../../../../../../../../../../lib/customer-state-runtime";
import {staffOrderQueue,advanceStaffOrder,validateFulfilmentAction,FulfilmentError} from "../../../../../../../../../../lib/drinkstock-fulfilment-service";
import {StationAccessError} from "../../../../../../../../../../lib/drinkstock-station-access-service";
import {isDrinkStockStation} from "../../../../../../../../../../lib/drinkstock-station-policy";
export const runtime="nodejs";export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow","referrer-policy":"no-referrer"};
const fail=(error:string,status:number)=>Response.json({error},{headers,status});
type Params={partnerId:string;venueId:string;station:string};
const err=(e:unknown)=>e instanceof StationAccessError||e instanceof FulfilmentError?
 fail(e.code,e.status):fail("STATION_BOARD_UNAVAILABLE",503);
export async function GET(_request:Request,{params}:{params:Promise<Params>}){
 try{
  const identity=await hospitalityIdentity();
  if(!identity)return fail("AUTH_REQUIRED",401);
  const p=await params;
  if(!isDrinkStockStation(p.station))return fail("INVALID_STATION",404);
  return Response.json(await staffOrderQueue(identity.userId,p.partnerId,p.venueId,p.station),{headers});
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
  const p=await params;
  if(!isDrinkStockStation(p.station))return fail("INVALID_STATION",404);
  const raw=await request.text();
  if(raw.length>2048)return fail("REQUEST_TOO_LARGE",413);
  const command=validateFulfilmentAction(JSON.parse(raw) as unknown);
  return Response.json(await advanceStaffOrder(identity.userId,p.partnerId,p.venueId,command,p.station),{headers});
 }catch(e){
  if(e instanceof SyntaxError)return fail("INVALID_JSON",400);
  if(e instanceof Error&&e.message.includes("CSRF validation failed"))return fail("BAD_CSRF",403);
  return err(e);
 }
}
