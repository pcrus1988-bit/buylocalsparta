import {hospitalityIdentity} from "../../../../../../../../lib/hospitality-partner-access";
import {assertCustomerCsrf} from "../../../../../../../../lib/customer-state-runtime";
import {staffOrderQueue,advanceStaffOrder,validateFulfilmentAction,FulfilmentError} from "../../../../../../../../lib/drinkstock-fulfilment-service";
export const runtime="nodejs";export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow"};
type Params={partnerId:string;venueId:string};
function fail(e:unknown){return Response.json({error:e instanceof FulfilmentError?e.code:"ORDERS_UNAVAILABLE"},
 {status:e instanceof FulfilmentError?e.status:503,headers});}
export async function GET(_request:Request,{params}:{params:Promise<Params>}){
 try{const identity=await hospitalityIdentity();if(!identity)return Response.json({error:"AUTH_REQUIRED"},{status:401,headers});
 const p=await params;return Response.json(await staffOrderQueue(identity.userId,p.partnerId,p.venueId),{headers});
 }catch(e){return fail(e);}
}
export async function POST(request:Request,{params}:{params:Promise<Params>}){
 if(request.headers.get("origin")!==new URL(request.url).origin)
 return Response.json({error:"BAD_ORIGIN"},{status:403,headers});
 try{const identity=await hospitalityIdentity();if(!identity)return Response.json({error:"AUTH_REQUIRED"},{status:401,headers});
 assertCustomerCsrf(identity,request.headers.get("x-csrf-token")??undefined);
 const action=validateFulfilmentAction(await request.json());const p=await params;
 return Response.json(await advanceStaffOrder(identity.userId,p.partnerId,p.venueId,action),{headers});
 }catch(e){if(e instanceof Error&&/CSRF validation failed/.test(e.message))
 return Response.json({error:"BAD_CSRF"},{status:403,headers});return fail(e);}
}
