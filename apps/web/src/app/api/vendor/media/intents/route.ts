import type { VendorProfileMediaRole } from "@buy-local-sparta/postgres-runtime";
import { requireDailySession } from "../../../../../lib/daily-session";
import { createVendorMediaUploadIntent } from "../../../../../lib/media-upload-service";

const PROFILE_ROLES = new Set<VendorProfileMediaRole>(["logo","storefront","team","gallery"]);

export async function POST(request:Request){
  try{
    // Daily Quick Add is a scoped vendor session. requireDailySession verifies Daily
    // tokens with Daily CSRF and transparently falls back to a normal vendor session,
    // so this shared media endpoint stays usable by both operator surfaces.
    const principal=await requireDailySession(request,true);
    const body=await request.json();
    const kind=String(body.kind??"") as "image"|"video"|"document";
    if(!["image","video","document"].includes(kind))throw new Error("Invalid media kind");
    const canonicalVariantId=String(body.canonicalVariantId??"").trim()||undefined;
    const requestedRole=String(body.profileRole??"").trim();
    const profileRole=requestedRole ? requestedRole as VendorProfileMediaRole : undefined;
    if(profileRole&&!PROFILE_ROLES.has(profileRole))throw new Error("Invalid vendor storefront media role");
    return Response.json(await createVendorMediaUploadIntent(principal,{
      canonicalVariantId,
      profileRole,
      kind,
      filename:String(body.filename??""),
      contentType:String(body.contentType??""),
      byteSize:Number(body.byteSize),
      altText:String(body.altText??"").trim()||undefined,
      rightsOwner:String(body.rightsOwner??"").trim()
    }));
  }catch(e){return Response.json({error:e instanceof Error?e.message:"media_intent_failed"},{status:400})}
}
