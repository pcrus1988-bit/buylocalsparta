import { requireAdminSession } from "../../../../../../lib/admin-session";
import { hardDeleteVendorApplication } from "../../../../../../lib/vendor-application-deletion";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "vendor.manage" });
    const { id } = await context.params;
    const body = await request.json() as { confirmation?: unknown; reason?: unknown };
    if (typeof body.confirmation !== "string") throw new Error("Application ID confirmation is required");
    if (typeof body.reason !== "string" || body.reason.trim().length < 3) throw new Error("Deletion reason is required");

    const deleted = await hardDeleteVendorApplication(principal, {
      applicationId: id,
      confirmation: body.confirmation,
      reason: body.reason
    });

    return Response.json({ deleted });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_application_delete_failed" }, { status: 400 });
  }
}
