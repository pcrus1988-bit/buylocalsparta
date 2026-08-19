import { requireAdminSession } from "../../../../../../../lib/admin-session";
import { setVendorDirectoryVisibility, vendorOnboardingWorkspace } from "../../../../../../../lib/admin-vendor-governance";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdminSession(request, {csrf:true,permission:"vendor.manage"});
    const { id } = await context.params;
    const body = await request.json() as { visible?: unknown; reason?: unknown };
    if (typeof body.visible !== "boolean") throw new Error("Visibility value is required");
    if (typeof body.reason !== "string" || body.reason.trim().length < 3) throw new Error("Visibility-change reason is required");
    await setVendorDirectoryVisibility(principal, { vendorId: id, visible: body.visible, reason: body.reason });
    return Response.json(await vendorOnboardingWorkspace(principal));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_visibility_failed" }, { status: 400 });
  }
}
