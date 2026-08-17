import { requireVendorSession } from "../../../../../lib/vendor-session";
import { completeVendorMediaUpload } from "../../../../../lib/media-upload-service";
import { vendorTrustWorkspace } from "../../../../../lib/vendor-backoffice-service";
export async function POST(request:Request){try{const principal=await requireVendorSession(request,true);const body=await request.json();const intentId=String(body.intentId??"").trim();if(!intentId)throw new Error("Media upload intent is required");await completeVendorMediaUpload(principal,intentId);return Response.json(await vendorTrustWorkspace(principal));}catch(e){return Response.json({error:e instanceof Error?e.message:"media_complete_failed"},{status:400})}}
