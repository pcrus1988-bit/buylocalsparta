import { requireVendorCapability } from "../../../../../lib/vendor-session";
import { requestVendorHubSubscriptionChange } from "../../../../../lib/vendor-hub-controls-service";

export async function POST(request: Request) {
  try {
    const { principal } = await requireVendorCapability("subscription.manage", request, true);
    const body = await request.json() as Record<string, unknown>;
    return Response.json(await requestVendorHubSubscriptionChange(principal, body), {
      status: 201,
      headers: { "cache-control": "private, no-store" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "hub_subscription_request_failed";
    return Response.json({ error: message }, { status: /AUTH_REQUIRED|capability denied|SELF_GOVERNED/.test(message) ? 403 : 400 });
  }
}
