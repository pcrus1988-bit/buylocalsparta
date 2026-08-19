import type { VendorOnboardingState } from "@buy-local-sparta/core";
import { requireAdminSession } from "../../../../../../lib/admin-session";
import { governedVendorTransition, vendorOnboardingWorkspace } from "../../../../../../lib/admin-vendor-governance";

const allowed = new Set<VendorOnboardingState>([
  "verification_pending",
  "catalog_onboarding",
  "test_ready",
  "active",
  "restricted",
  "suspended",
  "closed"
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdminSession(request, {csrf:true,permission:"vendor.manage"});
    const { id } = await context.params;
    const body = await request.json() as { to?: unknown; reason?: unknown };
    if (typeof body.to !== "string" || !allowed.has(body.to as VendorOnboardingState)) throw new Error("Invalid vendor transition");
    if (typeof body.reason !== "string" || body.reason.trim().length < 3) throw new Error("Transition reason is required");
    await governedVendorTransition(principal, { applicationId: id, to: body.to as VendorOnboardingState, reason: body.reason });
    return Response.json(await vendorOnboardingWorkspace(principal));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_transition_failed" }, { status: 400 });
  }
}
