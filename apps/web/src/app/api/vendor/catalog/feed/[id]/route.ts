import { requireVendorCapability } from "../../../../../../../lib/vendor-session";
import { updateVendorProductFeed } from "../../../../../../../lib/vendor-product-feed-service";
import type { VendorFeedMapping } from "../../../../../../../lib/vendor-product-feed-xml";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {principal}=await requireVendorCapability("catalogue.import",request,true);
    const {id}=await params;
    const body=await request.json() as Record<string,unknown>;
    const rawStatus=body.status;
    const status=rawStatus==="active"||rawStatus==="paused"?rawStatus:undefined;
    const rawInterval=body.syncIntervalMinutes===undefined?undefined:Number(body.syncIntervalMinutes);
    const mapping=body.mapping&&typeof body.mapping==="object"&&!Array.isArray(body.mapping)?body.mapping as VendorFeedMapping:undefined;
    const workspace=await updateVendorProductFeed(principal,id,{
      status,
      syncIntervalMinutes:rawInterval,
      mapping
    });
    return Response.json(workspace,{headers:{"cache-control":"no-store"}});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"feed_update_failed"},{status:400,headers:{"cache-control":"no-store"}});
  }
}
