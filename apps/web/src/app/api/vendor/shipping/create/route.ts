import { createVendorShipment } from "../../../../../lib/vendor-shipping-service";
import { requireVendorCapability } from "../../../../../lib/vendor-session";

export async function POST(request: Request) {
  try {
    const { principal } = await requireVendorCapability("shipping.manage", request, true);
    const body = await request.json() as { fulfilmentId?: unknown };
    const fulfilmentId = typeof body.fulfilmentId === "string" ? body.fulfilmentId.trim() : "";
    if (!fulfilmentId) throw new Error("fulfilmentId is required");
    return Response.json(await createVendorShipment(principal, fulfilmentId));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "boxnow_create_failed" },
      { status: 400 }
    );
  }
}
