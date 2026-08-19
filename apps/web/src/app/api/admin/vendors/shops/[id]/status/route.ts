import { requireAdminSession } from "../../../../../../../lib/admin-session";
import { setVendorOperationalStatus, vendorOnboardingWorkspace } from "../../../../../../../lib/admin-vendor-governance";

const allowed = new Set(["active", "restricted", "suspended", "closed"] as const);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "vendor.manage" });
    const { id } = await context.params;
    const body = await request.json() as { to?: unknown; reason?: unknown };
    if (typeof body.to !== "string" || !allowed.has(body.to as "active" | "restricted" | "suspended" | "closed")) throw new Error("Invalid shop status");
    if (typeof body.reason !== "string" || body.reason.trim().length < 3) throw new Error("Status-change reason is required");
    await setVendorOperationalStatus(principal, { vendorId: id, to: body.to as "active" | "restricted" | "suspended" | "closed", reason: body.reason });
    return Response.json(await vendorOnboardingWorkspace(principal));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_status_failed" }, { status: 400 });
  }
}
