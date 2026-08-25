import { requireVendorSession } from "../../../../../lib/vendor-session";
import { setVendorProductDeliveryEligibility, vendorProductDeliverySettings } from "../../../../../lib/vendor-delivery-eligibility-service";

export async function GET(request: Request) {
  try {
    const principal = await requireVendorSession(request, false);
    return Response.json({ products: await vendorProductDeliverySettings(principal) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "catalog_delivery_settings_failed" }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const offerId = typeof body.offerId === "string" ? body.offerId : "";
    if (typeof body.deliveryEligible !== "boolean") throw new Error("Η επιλογή παράδοσης δεν είναι έγκυρη.");
    const result = await setVendorProductDeliveryEligibility(principal, {
      offerId,
      deliveryEligible: body.deliveryEligible,
      source: "products"
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "catalog_delivery_update_failed" }, { status: 400 });
  }
}
