import {hospitalityIdentity} from "../../../../../../../../lib/hospitality-partner-access";
import {assertCustomerCsrf} from "../../../../../../../../lib/customer-state-runtime";
import {managerSessionView,sessionCommand,validateSessionAction,SessionError} from "../../../../../../../../lib/drinkstock-session-service";
export const runtime="nodejs";export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow"};
type P={partnerId:string;venueId:string};
const error=(e:unknown)=>Response.json({error:e instanceof SessionError?e.code:"SESSION_UNAVAILABLE"},
 {status:e instanceof SessionError?e.status:503,headers});
export async function GET(_request:Request,{params}:{params:Promise<P>}){
 try{const user=await hospitalityIdentity();if(!user)return Response.json({error:"AUTH_REQUIRED"},{status:401,headers});
 const p=await params;return Response.json(await managerSessionView(user.userId,p.partnerId,p.venueId),{headers});
 }catch(e){return error(e);}
}
export async function POST(request:Request,{params}:{params:Promise<P>}){
 if(request.headers.get("origin")!==new URL(request.url).origin)
 return Response.json({error:"BAD_ORIGIN"},{status:403,headers});
 try{const user=await hospitalityIdentity();if(!user)return Response.json({error:"AUTH_REQUIRED"},{status:401,headers});
 assertCustomerCsrf(user,request.headers.get("x-csrf-token")??undefined);
 const action=validateSessionAction(await request.json());const p=await params;
 return Response.json(await sessionCommand(user.userId,p.partnerId,p.venueId,action),{headers});
 }catch(e){if(e instanceof Error&&/CSRF validation failed/.test(e.message))
 return Response.json({error:"BAD_CSRF"},{status:403,headers});return error(e);}
}
