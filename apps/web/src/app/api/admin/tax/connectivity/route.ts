import { getProductionPostgresRuntime } from "../../../../../../lib/postgres-runtime";
import { requireAdminSession } from "../../../../../../lib/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request:Request){
  try{
    await requireAdminSession(request,{csrf:true,permission:"finance.read"});
    const service=getProductionPostgresRuntime().myData;
    if(!service)throw new Error("AADE myDATA credentials are not configured");
    return Response.json(await service.connectivityCheck(),{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return Response.json({ok:false,error:error instanceof Error?error.message:"AADE myDATA connectivity check failed"},{status:400,headers:{"Cache-Control":"no-store"}});
  }
}
