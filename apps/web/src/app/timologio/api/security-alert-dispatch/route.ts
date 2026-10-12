import {authorizeFiscalAlertDispatch,runFiscalAlertDispatch} from "../../../../lib/fiscal-security-alert-dispatch";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"no-store","x-content-type-options":"nosniff",
 "referrer-policy":"no-referrer"};
export async function POST(request:Request){
 if(!authorizeFiscalAlertDispatch(request))
  return Response.json({error:"UNAUTHORIZED"},{status:401,headers});
 try{return Response.json(await runFiscalAlertDispatch(),{headers});}
 catch{return Response.json({error:"SECURITY_DISPATCH_UNAVAILABLE"},{status:503,headers});}
}
