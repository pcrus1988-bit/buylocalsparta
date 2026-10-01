import { requireVendorCapability } from "../../../../../../../../lib/vendor-session";
import { syncVendorProductFeed } from "../../../../../../../../lib/vendor-product-feed-service";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=55;

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {principal}=await requireVendorCapability("catalogue.import",request,true);
    const {id}=await params;
    let xml:string|undefined;
    const type=request.headers.get("content-type")??"";
    if(type.includes("application/json")){
      const body=await request.json() as Record<string,unknown>;
      if(typeof body.xml==="string")xml=body.xml;
    }
    const workspace=await syncVendorProductFeed(principal,id,xml);
    return Response.json(workspace,{headers:{"cache-control":"no-store"}});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"feed_sync_failed"},{status:400,headers:{"cache-control":"no-store"}});
  }
}
