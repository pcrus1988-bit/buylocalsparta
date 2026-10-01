import { syncDueVendorProductFeeds } from "../../../../lib/vendor-product-feed-service";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=55;

export async function GET(request:Request){
  const secret=process.env.CRON_SECRET?.trim();
  if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`){
    return Response.json({error:"unauthorized"},{status:401,headers:{"cache-control":"no-store"}});
  }
  try{
    const result=await syncDueVendorProductFeeds(3);
    return Response.json({ok:true,...result},{headers:{"cache-control":"no-store"}});
  }catch(error){
    const message=error instanceof Error?error.message:"vendor_feed_cron_failed";
    console.error(JSON.stringify({level:"error",event:"vendor_product_feeds.cron_failed",message,at:new Date().toISOString()}));
    return Response.json({error:message},{status:500,headers:{"cache-control":"no-store"}});
  }
}
