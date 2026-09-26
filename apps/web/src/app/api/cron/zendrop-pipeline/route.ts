import { runZendropCatalogueMaterializationSlice } from "../../../../lib/zendrop-catalogue-materializer";
import { runZendropShopifyProvisioningSlice } from "../../../../lib/zendrop-shopify-provisioning";
import { runZendropShopifyInventorySweep } from "../../../../lib/zendrop-shopify-inventory";
import { runZendropAutoPublicationSlice } from "../../../../lib/zendrop-auto-publication-runtime";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=55;

export async function GET(request:Request){
  if(!authorized(request)){
    return Response.json({error:"unauthorized"},{status:401,headers:{"cache-control":"no-store"}});
  }
  try{
    const materialization=await runZendropCatalogueMaterializationSlice();
    const provisioning=await runZendropShopifyProvisioningSlice();
    const inventory=await runZendropShopifyInventorySweep(Date.now(),100);
    const publication=await runZendropAutoPublicationSlice();
    return Response.json({
      ok:true,
      materialization,
      provisioning,
      inventory,
      publication
    },{headers:{"cache-control":"no-store"}});
  }catch(error){
    const message=error instanceof Error?error.message:"zendrop_pipeline_failed";
    console.error(JSON.stringify({level:"error",event:"zendrop.pipeline_cron_failed",message,at:new Date().toISOString()}));
    return Response.json({error:message},{status:500,headers:{"cache-control":"no-store"}});
  }
}
function authorized(request:Request):boolean{
  const secret=process.env.CRON_SECRET?.trim();
  return Boolean(secret)&&request.headers.get("authorization")===`Bearer ${secret}`;
}
