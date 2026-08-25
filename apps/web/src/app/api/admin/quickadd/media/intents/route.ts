import { requireAdminSession } from "../../../../../../../lib/admin-session";
import { createAdminQuickAddMediaIntent } from "../../../../../../../lib/admin-quickadd-media-service";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "catalog.write" });
    const body = await request.json() as Record<string, unknown>;
    return Response.json(await createAdminQuickAddMediaIntent(principal, {
      vendorId: typeof body.vendorId === "string" ? body.vendorId : "",
      canonicalVariantId: typeof body.canonicalVariantId === "string" ? body.canonicalVariantId : "",
      filename: typeof body.filename === "string" ? body.filename : "",
      contentType: typeof body.contentType === "string" ? body.contentType : "",
      byteSize: Number(body.byteSize),
      altText: typeof body.altText === "string" ? body.altText : "",
      rightsOwner: typeof body.rightsOwner === "string" ? body.rightsOwner : ""
    }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "admin_quickadd_media_intent_failed" }, { status: 400 });
  }
}
