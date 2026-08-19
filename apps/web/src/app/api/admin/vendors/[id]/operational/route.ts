import { requireAdminSession } from "../../../../../../lib/admin-session";
import { setAdminVendorOperationalState } from "../../../../../../lib/vendor-admin-controls";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "vendor.manage" });
    const { id } = await context.params;
    const body = await request.json() as { active?: unknown; reason?: unknown };
    if (typeof body.active !== "boolean") throw new Error("Invalid operational state");
    if (typeof body.reason !== "string" || body.reason.trim().length < 3) throw new Error("Operational-state reason is required");
    const result = await setAdminVendorOperationalState(principal, { vendorId: id, active: body.active, reason: body.reason });
    return Response.json({ ok: true, result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_operational_state_failed" }, { status: 400 });
  }
}
