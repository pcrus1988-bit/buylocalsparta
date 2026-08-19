import { requireAdminSession } from "../../../../../../lib/admin-session";
import { setAdminVendorDirectoryVisibility } from "../../../../../../lib/vendor-admin-controls";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "vendor.manage" });
    const { id } = await context.params;
    const body = await request.json() as { visible?: unknown; reason?: unknown };
    if (typeof body.visible !== "boolean") throw new Error("Invalid directory visibility state");
    const result = await setAdminVendorDirectoryVisibility(principal, {
      vendorId: id,
      visible: body.visible,
      reason: typeof body.reason === "string" ? body.reason : undefined
    });
    return Response.json({ ok: true, result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_visibility_failed" }, { status: 400 });
  }
}
