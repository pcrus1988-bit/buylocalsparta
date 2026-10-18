import {notFound} from "next/navigation";
import {publicSessionView,SessionError} from "../../../../../../lib/drinkstock-session-service";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{kind:string;token:string}>}){
 try{
 const {kind,token}=await params;
 if(kind!=="screen"&&kind!=="table")return Response.json({error:"NOT_FOUND"},{status:404});
 const data=await publicSessionView(token,kind);
 return Response.json(data,{headers:{"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow","referrer-policy":"no-referrer"}});
 }catch(error){
 return Response.json({error:error instanceof SessionError?error.code:"UNAVAILABLE"},
 {status:error instanceof SessionError?error.status:503,
 headers:{"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow"}});
 }
}
