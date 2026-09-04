import { requireAdminSession } from "../../../../../lib/admin-session";
import { recordAdminAudit } from "../../../../../lib/admin-runtime";
import { completeAdminVendorProfileMediaUpload } from "../../../../../lib/media-upload-service";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "vendor.manage" });
    const body = await request.json();
    const intentId = String(body.intentId ?? "").trim();
    if (!intentId) throw new Error("Media upload intent is required");
    const result = await completeAdminVendorProfileMediaUpload(principal, intentId);
    await recordAdminAudit(principal, "vendor.storefront_media_uploaded", "product_media", result.assetId, "Admin storefront media upload completed", result);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "admin_vendor_media_complete_failed" }, { status: 400 });
  }
}
