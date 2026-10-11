import { requireVendorCapability } from "../../../../../lib/vendor-session";
import { uploadVendorProfileMediaServer } from "../../../../../lib/media-upload-service";
import { vendorProfileMediaWorkspace } from "../../../../../lib/vendor-profile-media-service";
import type { VendorProfileMediaRole } from "@buy-local-sparta/postgres-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = new Set<VendorProfileMediaRole>(["logo", "storefront", "team", "gallery"]);
const MAX_BYTES = 4 * 1024 * 1024;

// Scoped, authenticated intake. Files remain in private storage and cannot be
// publicly served until malware scanning, rights and moderation all approve.
export async function POST(request: Request) {
  try {
    const { principal } = await requireVendorCapability("shop.manage", request, true);
    const form = await request.formData();
    const file = form.get("file");
    const role = String(form.get("profileRole") ?? "") as VendorProfileMediaRole;
    if (!(file instanceof File) || !file.size || file.size > MAX_BYTES) {
      throw new Error("Επίλεξε εικόνα έως 4 MB.");
    }
    if (!ROLES.has(role)) throw new Error("Μη έγκυρος ρόλος εικόνας.");
    const altText = String(form.get("altText") ?? "").trim();
    const rightsOwner = String(form.get("rightsOwner") ?? "").trim();
    if (!altText || altText.length > 240) throw new Error("Συμπλήρωσε περιγραφή εικόνας έως 240 χαρακτήρες.");
    if (!rightsOwner || rightsOwner.length > 200) throw new Error("Συμπλήρωσε κάτοχο δικαιωμάτων έως 200 χαρακτήρες.");

    await uploadVendorProfileMediaServer(principal, {
      profileRole: role,
      filename: file.name,
      contentType: file.type,
      altText,
      rightsOwner,
      bytes: new Uint8Array(await file.arrayBuffer())
    });
    return Response.json({ ok: true, status: "pending_review", workspace: await vendorProfileMediaWorkspace(principal) }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "storefront_upload_failed" }, {
      status: 400,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
