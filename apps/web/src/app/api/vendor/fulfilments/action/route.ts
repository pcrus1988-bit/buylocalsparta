import { requireVendorSession } from "../../../../../lib/vendor-session";
import { actOnVendorFulfilment, vendorDashboard } from "../../../../../lib/vendor-runtime";

export async function POST(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json() as { fulfilmentId?: unknown; action?: unknown };
    const fulfilmentId = typeof body.fulfilmentId === "string" ? body.fulfilmentId.trim() : "";
    const action = typeof body.action === "string" ? body.action.trim() : "";
    if (!fulfilmentId || !action) throw new Error("Fulfilment and action are required");
    await actOnVendorFulfilment(principal, { fulfilmentId, action });
    return Response.json(await vendorDashboard(principal));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "fulfilment_action_failed" }, { status: 400 });
  }
}
