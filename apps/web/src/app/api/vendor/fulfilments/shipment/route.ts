import { requireVendorSession } from "../../../../../lib/vendor-session";
import { vendorDashboard } from "../../../../../lib/vendor-runtime";
import { recordVendorManualShipment } from "../../../../../lib/vendor-fulfilment-service";
import { syncVendorFulfilmentLifecycle } from "../../../../../lib/order-lifecycle";

export async function POST(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json() as { fulfilmentId?: unknown; carrier?: unknown; trackingNumber?: unknown; deliveryNote?: unknown };
    const fulfilmentId = typeof body.fulfilmentId === "string" ? body.fulfilmentId.trim() : "";
    const carrier = typeof body.carrier === "string" ? body.carrier.trim() : "";
    const trackingNumber = typeof body.trackingNumber === "string" ? body.trackingNumber.trim() : "";
    const deliveryNote = typeof body.deliveryNote === "string" ? body.deliveryNote.trim() : undefined;
    if (!fulfilmentId || !carrier || !trackingNumber) throw new Error("Fulfilment, carrier and tracking number are required");
    const now = Date.now();
    await recordVendorManualShipment(principal, { fulfilmentId, carrier, trackingNumber, deliveryNote, now });
    await syncVendorFulfilmentLifecycle(principal, { fulfilmentId, action: "shipped", now });
    return Response.json(await vendorDashboard(principal), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "manual_shipment_failed" }, { status: 400 });
  }
}
