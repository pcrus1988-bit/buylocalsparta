import type { VendorProfileMediaRole } from "@buy-local-sparta/postgres-runtime";
import { requireAdminSession } from "../../../../../lib/admin-session";
import { createAdminVendorProfileMediaUploadIntent } from "../../../../../lib/media-upload-service";

const PROFILE_ROLES = new Set<VendorProfileMediaRole>(["logo", "storefront", "team", "gallery"]);

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "vendor.manage" });
    const body = await request.json();
    const profileRole = String(body.profileRole ?? "") as VendorProfileMediaRole;
    if (!PROFILE_ROLES.has(profileRole)) throw new Error("Invalid vendor storefront media role");
    const result = await createAdminVendorProfileMediaUploadIntent(principal, {
      vendorId: String(body.vendorId ?? ""),
      profileRole,
      filename: String(body.filename ?? ""),
      contentType: String(body.contentType ?? ""),
      byteSize: Number(body.byteSize),
      altText: String(body.altText ?? ""),
      rightsOwner: String(body.rightsOwner ?? "")
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "admin_vendor_media_intent_failed" }, { status: 400 });
  }
}
