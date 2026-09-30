import { runZendropCatalogueSyncSlice } from "../../../../lib/zendrop-catalogue-sync-runtime";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=55;

export async function GET(request:Request){
  if(!authorized(request)){
    return Response.json({error:"unauthorized"},{status:401,headers:{"cache-control":"no-store"}});
  }
  try{
    const result=await runZendropCatalogueSyncSlice({maxPages:8});
    return Response.json({ok:true,...result},{headers:{"cache-control":"no-store"}});
  }catch(error){
    const message=error instanceof Error?error.message:"zendrop_catalogue_sync_failed";
    console.error(JSON.stringify({level:"error",event:"zendrop.catalogue_cron_failed",message,at:new Date().toISOString()}));
    return Response.json({error:message},{status:500,headers:{"cache-control":"no-store"}});
  }
}
function authorized(request:Request):boolean{
  const secret=process.env.CRON_SECRET?.trim();
  return Boolean(secret)&&request.headers.get("authorization")===`Bearer ${secret}`;
}
