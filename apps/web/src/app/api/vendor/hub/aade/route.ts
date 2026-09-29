import { requireVendorCapability } from "../../../../../../lib/vendor-session";
import { requestVendorHubAadeAction } from "../../../../../../lib/vendor-hub-controls-service";

export async function POST(request: Request) {
  try {
    const { principal } = await requireVendorCapability("aade.manage", request, true);
    const body = await request.json() as Record<string, unknown>;
    return Response.json(await requestVendorHubAadeAction(principal, body), {
      status: 201,
      headers: { "cache-control": "private, no-store" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "hub_aade_request_failed";
    return Response.json({ error: message }, { status: /AUTH_REQUIRED|capability denied|SELF_GOVERNED/.test(message) ? 403 : 400 });
  }
}
