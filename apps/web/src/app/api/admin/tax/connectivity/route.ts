import { requireAdminSession } from "../../../../../lib/admin-session";
import { myDataConnectivityCheck } from "../../../../../lib/mydata-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request:Request){
  try{
    await requireAdminSession(request,{csrf:true,permission:"finance.read"});
    return Response.json(await myDataConnectivityCheck(),{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return Response.json({ok:false,error:error instanceof Error?error.message:"AADE myDATA connectivity check failed"},{status:400,headers:{"Cache-Control":"no-store"}});
  }
}
