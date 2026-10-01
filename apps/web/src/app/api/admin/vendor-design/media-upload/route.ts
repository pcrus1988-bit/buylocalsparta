import type { VendorProfileMediaRole } from "@buy-local-sparta/postgres-runtime";
import { revalidatePath } from "next/cache";
import { requireAdminSession } from "../../../../../lib/admin-session";
import { recordAdminAudit } from "../../../../../lib/admin-runtime";
import { createAdminVendorProfileDatabaseUpload } from "../../../../../lib/admin-vendor-media-database-upload";

const PROFILE_ROLES = new Set<VendorProfileMediaRole>(["logo", "storefront", "team", "gallery"]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "vendor.manage" });
    const data = await request.formData();
    const file = data.get("file");
    const profileRole = String(data.get("profileRole") ?? "") as VendorProfileMediaRole;
    if (!(file instanceof File)) throw new Error("Choose an image first");
    if (!PROFILE_ROLES.has(profileRole)) throw new Error("Invalid vendor storefront media role");

    const result = await createAdminVendorProfileDatabaseUpload(principal, {
      vendorId: String(data.get("vendorId") ?? ""),
      profileRole,
      file,
      altText: String(data.get("altText") ?? ""),
      rightsOwner: String(data.get("rightsOwner") ?? "")
    });

    await recordAdminAudit(
      principal,
      "vendor.storefront_media_uploaded",
      "product_media",
      result.assetId,
      "Admin storefront media uploaded through private database fallback",
      { ...result, byteSize: file.size, contentType: file.type }
    );

    revalidatePath("/admin/partners/design");
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "admin_vendor_media_database_upload_failed" },
      { status: 400 }
    );
  }
}
