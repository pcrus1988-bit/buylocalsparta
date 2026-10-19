import {hospitalityIdentity} from "../../../../../../../../lib/hospitality-partner-access";
import {assertCustomerCsrf} from "../../../../../../../../lib/customer-state-runtime";
import {readPosDraft,savePosDraft} from "../../../../../../../../lib/drinkstock-pos-draft-service";
import {PosDraftError} from "../../../../../../../../lib/drinkstock-pos-draft";
export const runtime="nodejs";export const dynamic="force-dynamic";
type P={partnerId:string;venueId:string};
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow"};
const err=(e:unknown)=>Response.json({error:e instanceof PosDraftError?e.code:"POS_DRAFT_UNAVAILABLE"},
 {status:e instanceof PosDraftError?e.status:503,headers});
export async function GET(_req:Request,{params}:{params:Promise<P>}){
 try{
  const actor=await hospitalityIdentity();
  if(!actor)return Response.json({error:"AUTH_REQUIRED"},{status:401,headers});
  const p=await params;
  return Response.json(await readPosDraft(actor.userId,p.partnerId,p.venueId),{headers});
 }catch(e){return err(e);}
}
export async function PUT(req:Request,{params}:{params:Promise<P>}){
 if(req.headers.get("origin")!==new URL(req.url).origin)
  return Response.json({error:"BAD_ORIGIN"},{status:403,headers});
 if(!req.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
  return Response.json({error:"JSON_REQUIRED"},{status:415,headers});
 if(Number(req.headers.get("content-length")||0)>150000)
  return Response.json({error:"DRAFT_TOO_LARGE"},{status:413,headers});
 try{
  const actor=await hospitalityIdentity();
  if(!actor)return Response.json({error:"AUTH_REQUIRED"},{status:401,headers});
  assertCustomerCsrf(actor,req.headers.get("x-csrf-token")??undefined);
  const raw=await req.text();
  if(raw.length>150000)return Response.json({error:"DRAFT_TOO_LARGE"},{status:413,headers});
  const payload=JSON.parse(raw) as Record<string,unknown>;
  const p=await params;
  return Response.json(await savePosDraft(actor.userId,p.partnerId,p.venueId,payload.draft,payload.expectedRevision),{headers});
 }catch(e){
  if(e instanceof SyntaxError)return Response.json({error:"BAD_JSON"},{status:400,headers});
  if(e instanceof Error&&/CSRF validation failed/.test(e.message))
   return Response.json({error:"BAD_CSRF"},{status:403,headers});
  return err(e);
 }
}
