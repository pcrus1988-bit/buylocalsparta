import { requireDailySession } from "../../../../../../lib/daily-session";
import { createVendorMediaUploadIntent } from "../../../../../../lib/media-upload-service";

export async function POST(request: Request) {
  try {
    const principal = await requireDailySession(request, true);
    const body = await request.json() as Record<string, unknown>;
    return Response.json(await createVendorMediaUploadIntent(principal, {
      canonicalVariantId: typeof body.canonicalVariantId === "string" ? body.canonicalVariantId : undefined,
      kind: "image",
      filename: typeof body.filename === "string" ? body.filename : "",
      contentType: typeof body.contentType === "string" ? body.contentType : "",
      byteSize: Number(body.byteSize),
      altText: typeof body.altText === "string" ? body.altText : undefined,
      rightsOwner: typeof body.rightsOwner === "string" ? body.rightsOwner : ""
    }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "daily_quickadd_media_intent_failed" }, { status: 400 });
  }
}
