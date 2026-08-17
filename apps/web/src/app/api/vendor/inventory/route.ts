import { requireVendorSession } from "../../../../lib/vendor-session";
import { updateVendorStock, vendorDashboard } from "../../../../lib/vendor-runtime";

export async function PUT(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json() as { offerId?: unknown; onHand?: unknown };
    const offerId = typeof body.offerId === "string" ? body.offerId.trim() : "";
    const onHand = typeof body.onHand === "number" ? body.onHand : Number.NaN;
    if (!offerId) throw new Error("offerId is required");
    await updateVendorStock(principal, { offerId, onHand });
    return Response.json(await vendorDashboard(principal));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "inventory_update_failed" }, { status: 400 });
  }
}
