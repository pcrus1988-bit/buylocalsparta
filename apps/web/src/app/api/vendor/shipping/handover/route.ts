import { handoverVendorShipment } from "../../../../../lib/vendor-shipping-service";
import { requireVendorSession } from "../../../../../lib/vendor-session";

export async function POST(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json() as { shipmentId?: unknown };
    const shipmentId = typeof body.shipmentId === "string" ? body.shipmentId.trim() : "";
    if (!shipmentId) throw new Error("shipmentId is required");
    return Response.json(await handoverVendorShipment(principal, shipmentId));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "boxnow_handover_failed" },
      { status: 400 }
    );
  }
}
