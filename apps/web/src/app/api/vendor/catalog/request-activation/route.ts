import { requireVendorSession } from "../../../../../lib/vendor-session";
import { requestVendorProductActivation } from "../../../../../lib/product-lifecycle-service";

export async function POST(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const offerId = typeof body.offerId === "string" ? body.offerId.trim() : "";
    if (!offerId) throw new Error("Product offer is required");
    return Response.json(await requestVendorProductActivation(principal, offerId));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "activation_request_failed" }, { status: 400 });
  }
}
