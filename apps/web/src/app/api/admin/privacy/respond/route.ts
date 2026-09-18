import { requireAdminSession } from "../../../../../lib/admin-session";
import { sendAdminPrivacyResponse } from "../../../../../lib/admin-privacy-operations";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(request:Request){
  try{
    const principal=await requireAdminSession(request,{csrf:true,permission:"privacy.manage"});
    const body=await request.json().catch(()=>({})) as Record<string,unknown>;
    return Response.json(await sendAdminPrivacyResponse(principal,{
      requestId:String(body.requestId??""),
      message:typeof body.message==="string"?body.message:undefined
    }),{headers:{"cache-control":"no-store"}});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"privacy_response_failed"},{status:400,headers:{"cache-control":"no-store"}});
  }
}
