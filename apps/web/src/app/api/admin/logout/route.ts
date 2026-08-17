import { cookies } from "next/headers";
import { requireAdminSession } from "../../../../lib/admin-session";
import { ADMIN_SESSION_COOKIE, logoutAdmin, recordAdminAudit } from "../../../../lib/admin-runtime";
export async function POST(request:Request){
  try{
    const p=await requireAdminSession(request,{csrf:true});
    const store=await cookies();
    await logoutAdmin(store.get(ADMIN_SESSION_COOKIE)?.value);
    store.delete(ADMIN_SESSION_COOKIE);
    await recordAdminAudit(p,"admin.logout","session",p.sessionId);
    return Response.json({ok:true});
  }catch(e){return Response.json({error:e instanceof Error?e.message:"logout_failed"},{status:400})}
}
