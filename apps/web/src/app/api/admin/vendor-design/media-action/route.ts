import { requireAdminSession } from "../../../../../lib/admin-session";
import { adminMediaAction, assertAdminPermission, recordAdminAudit } from "../../../../../lib/admin-runtime";
import { adminVendorProfileMediaAssignments, adminVendorProfileMediaPublicationAction } from "../../../../../lib/vendor-profile-media-service";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "vendor.manage" });
    const body = await request.json();
    const assignmentId = String(body.assignmentId ?? "").trim();
    const action = String(body.action ?? "") as "approve_publish" | "publish" | "unpublish" | "reject";
    const reason = String(body.reason ?? "").trim();
    if (!assignmentId) throw new Error("Storefront media assignment is required");
    if (!["approve_publish", "publish", "unpublish", "reject"].includes(action)) throw new Error("Invalid storefront media action");

    const assignment = (await adminVendorProfileMediaAssignments(principal)).find((item) => item.id === assignmentId);
    if (!assignment) throw new Error("Storefront media assignment not found");

    if (action === "approve_publish") {
      assertAdminPermission(principal, "catalog.write");
      await adminMediaAction(principal, { assetId: assignment.mediaId, action: "approve", reason: reason || "Admin approved storefront media" });
      await adminVendorProfileMediaPublicationAction(principal, { assignmentId, action: "publish" });
    } else if (action === "publish") {
      await adminVendorProfileMediaPublicationAction(principal, { assignmentId, action: "publish" });
    } else if (action === "reject") {
      assertAdminPermission(principal, "catalog.write");
      await adminMediaAction(principal, { assetId: assignment.mediaId, action: "reject", reason: reason || "Rejected in partner storefront design" });
      await adminVendorProfileMediaPublicationAction(principal, { assignmentId, action: "unpublish" });
    } else {
      await adminVendorProfileMediaPublicationAction(principal, { assignmentId, action: "unpublish" });
    }

    await recordAdminAudit(principal, `vendor.storefront_media.${action}`, "vendor_profile_media", assignmentId, reason || undefined, {
      vendorId: assignment.vendorId,
      mediaId: assignment.mediaId,
      role: assignment.role
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "admin_vendor_media_action_failed" }, { status: 400 });
  }
}
