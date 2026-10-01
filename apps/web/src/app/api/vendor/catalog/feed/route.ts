import { requireVendorCapability } from "../../../../../../lib/vendor-session";
import { createVendorProductFeed, vendorProductFeedWorkspace } from "../../../../../../lib/vendor-product-feed-service";
import type { VendorFeedMapping } from "../../../../../../lib/vendor-product-feed-xml";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=55;

export async function GET(request:Request){
  try{
    const {principal}=await requireVendorCapability("catalogue.read",request);
    return Response.json(await vendorProductFeedWorkspace(principal),{headers:{"cache-control":"no-store"}});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"feed_workspace_failed"},{status:400,headers:{"cache-control":"no-store"}});
  }
}

export async function POST(request:Request){
  try{
    const {principal}=await requireVendorCapability("catalogue.import",request,true);
    const body=await request.json() as Record<string,unknown>;
    const sourceKind=body.sourceKind==="url"?"url":"upload";
    const mapping=body.mapping&&typeof body.mapping==="object"&&!Array.isArray(body.mapping)?body.mapping as VendorFeedMapping:undefined;
    const interval=Number(body.syncIntervalMinutes??360);
    const workspace=await createVendorProductFeed(principal,{
      name:typeof body.name==="string"?body.name:"",
      sourceKind,
      sourceUrl:typeof body.sourceUrl==="string"?body.sourceUrl:undefined,
      sourceFilename:typeof body.sourceFilename==="string"?body.sourceFilename:undefined,
      xml:typeof body.xml==="string"?body.xml:undefined,
      mapping,
      syncIntervalMinutes:([60,180,360,1440].includes(interval)?interval:360) as 60|180|360|1440
    });
    return Response.json(workspace,{status:201,headers:{"cache-control":"no-store"}});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"feed_create_failed"},{status:400,headers:{"cache-control":"no-store"}});
  }
}
