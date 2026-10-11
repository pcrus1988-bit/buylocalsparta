import { getAdminSession } from "../../../../../../lib/admin-session";
import { getHubClaimImageAccess, readHubClaimImage } from "../../../../../../lib/hub-claim-media";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const admin=await getAdminSession();
  const access=await getHubClaimImageAccess(id,Boolean(admin?.roles.includes("super_admin")));
  if(!access) return new Response("Not found",{status:404,headers:{"Cache-Control":"no-store"}});
  try{
    const bytes=await readHubClaimImage(access.key);
    return new Response(new Blob([Uint8Array.from(bytes)],{type:access.type}),{
      headers:{"Content-Type":access.type,"Content-Disposition":"inline","X-Content-Type-Options":"nosniff",
        "Cache-Control":access.status==="approved"?"public, max-age=600":"private, no-store"}
    });
  }catch{return new Response("Unavailable",{status:503,headers:{"Cache-Control":"no-store"}});}
}
