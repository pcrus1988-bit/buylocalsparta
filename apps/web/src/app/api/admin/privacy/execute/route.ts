import { requireAdminSession } from "../../../../../lib/admin-session";
import { executeAdminPrivacyRequest } from "../../../../../lib/admin-privacy-operations";
import type { CustomerProfileLocale } from "../../../../../lib/admin-customer-profile";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(request:Request){
  try{
    const principal=await requireAdminSession(request,{csrf:true,permission:"privacy.manage"});
    const body=await request.json().catch(()=>({})) as Record<string,unknown>;
    const raw=body.correction&&typeof body.correction==="object"&&!Array.isArray(body.correction)?body.correction as Record<string,unknown>:{};
    const correction={
      firstName:typeof raw.firstName==="string"?raw.firstName:undefined,
      lastName:typeof raw.lastName==="string"?raw.lastName:undefined,
      phone:typeof raw.phone==="string"?raw.phone:undefined,
      preferredLocale:(raw.preferredLocale==="el"||raw.preferredLocale==="en"?raw.preferredLocale:undefined) as CustomerProfileLocale|undefined
    };
    return Response.json(await executeAdminPrivacyRequest(principal,{requestId:String(body.requestId??""),correction}),{headers:{"cache-control":"no-store"}});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"privacy_execution_failed"},{status:400,headers:{"cache-control":"no-store"}});
  }
}
