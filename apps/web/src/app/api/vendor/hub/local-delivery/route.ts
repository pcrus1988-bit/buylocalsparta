import { requireVendorCapability } from "../../../../../../lib/vendor-session";
import { updateVendorHubLocalDelivery } from "../../../../../../lib/vendor-hub-controls-service";

export async function PUT(request: Request) {
  try {
    const { principal } = await requireVendorCapability("local_delivery.manage", request, true);
    const body = await request.json() as Record<string, unknown>;
    return Response.json(await updateVendorHubLocalDelivery(principal, {
      active: body.active === true,
      postcodePrefixes: body.postcodePrefixes
    }), { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "hub_local_delivery_failed";
    return Response.json({ error: message }, { status: /AUTH_REQUIRED|capability denied|SELF_GOVERNED/.test(message) ? 403 : 400 });
  }
}
