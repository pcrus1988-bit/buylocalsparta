import { requireVendorSession } from "../../../../../lib/vendor-session";
import { updateVendorRetailPrice } from "../../../../../lib/vendor-price-service";

export async function PUT(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const offerId = typeof body.offerId === "string" ? body.offerId : "";
    const priceMinor = Number(body.priceMinor);
    const result = await updateVendorRetailPrice(principal, { offerId, priceMinor });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "catalog_price_failed" }, { status: 400 });
  }
}
