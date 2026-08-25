import { requireDailySession } from "../../../../../lib/daily-session";
import { completeVendorMediaUpload } from "../../../../../lib/media-upload-service";
import { vendorTrustWorkspace } from "../../../../../lib/vendor-backoffice-service";

export async function POST(request:Request){
  try{
    const principal=await requireDailySession(request,true);
    const body=await request.json();
    const intentId=String(body.intentId??"").trim();
    if(!intentId)throw new Error("Media upload intent is required");
    const completed=await completeVendorMediaUpload(principal,intentId);
    // The full vendor backoffice expects the refreshed trust workspace. Daily Quick Add
    // only needs acknowledgement that the asset entered the governed scan queue.
    if(principal.roles.includes("vendor_owner"))return Response.json(await vendorTrustWorkspace(principal));
    return Response.json(completed);
  }catch(e){return Response.json({error:e instanceof Error?e.message:"media_complete_failed"},{status:400})}
}
