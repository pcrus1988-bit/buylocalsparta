import { archiveApprovedGreekRetailQ18 } from "../../../../lib/research-q18-approved-sidecar";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;
/** Private pre-publication appendix creation, independent from the sealed results artifact. */
export async function GET(request:Request){
  const secret=process.env.CRON_SECRET?.trim();
  if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`){
    return Response.json({error:"unauthorized"},{status:401});
  }
  try{
    const result=await archiveApprovedGreekRetailQ18();
    return Response.json({ok:true,...result},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    const reason=error instanceof Error?error.message:"Q18_ARCHIVE_FAILED";
    console.error(JSON.stringify({level:"error",event:"research.q18_approved_archive_failed",reason}));
    return Response.json({ok:false,error:"archive_unavailable"},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
