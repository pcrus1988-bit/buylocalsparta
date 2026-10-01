import { requireVendorCapability } from "../../../../../../../lib/vendor-session";
import { analyzeVendorFeedInput } from "../../../../../../../lib/vendor-product-feed-service";
import type { VendorFeedMapping } from "../../../../../../../lib/vendor-product-feed-xml";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=30;

export async function POST(request:Request){
  try{
    await requireVendorCapability("catalogue.import",request,true);
    const body=await request.json() as Record<string,unknown>;
    const sourceKind=body.sourceKind==="url"?"url":"upload";
    const result=await analyzeVendorFeedInput({
      sourceKind,
      sourceUrl:typeof body.sourceUrl==="string"?body.sourceUrl:undefined,
      xml:typeof body.xml==="string"?body.xml:undefined,
      mapping:body.mapping&&typeof body.mapping==="object"&&!Array.isArray(body.mapping)?body.mapping as VendorFeedMapping:undefined
    });
    return Response.json(result,{headers:{"cache-control":"no-store"}});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"feed_analysis_failed"},{status:400,headers:{"cache-control":"no-store"}});
  }
}
