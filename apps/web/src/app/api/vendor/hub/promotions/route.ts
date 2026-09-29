import { requireVendorCapability } from "../../../../../../lib/vendor-session";
import { requestVendorHubPromotion } from "../../../../../../lib/vendor-hub-controls-service";

export async function POST(request: Request) {
  try {
    const { principal } = await requireVendorCapability("promotions.manage", request, true);
    const body = await request.json() as Record<string, unknown>;
    return Response.json(await requestVendorHubPromotion(principal, body), {
      status: 201,
      headers: { "cache-control": "private, no-store" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "hub_promotion_request_failed";
    return Response.json({ error: message }, { status: /AUTH_REQUIRED|capability denied|SELF_GOVERNED/.test(message) ? 403 : 400 });
  }
}
