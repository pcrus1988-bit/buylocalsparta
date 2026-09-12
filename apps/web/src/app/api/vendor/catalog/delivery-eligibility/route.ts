import { requireVendorSession } from "../../../../../lib/vendor-session";
import {
  setVendorProductFulfilmentBulk,
  setVendorProductFulfilmentPreference,
  vendorProductDeliverySettings
} from "../../../../../lib/vendor-delivery-eligibility-service";

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
    if (typeof body.deliveryEligible !== "boolean" || typeof body.pickupEligible !== "boolean") {
      throw new Error("Οι επιλογές παράδοσης και παραλαβής δεν είναι έγκυρες.");
    }
    const result = await setVendorProductFulfilmentPreference(principal, {
      offerId,
      deliveryEligible: body.deliveryEligible,
      pickupEligible: body.pickupEligible,
      source: "products"
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "catalog_delivery_update_failed" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.deliveryEligible !== "boolean" || typeof body.pickupEligible !== "boolean") {
      throw new Error("Οι επιλογές παράδοσης και παραλαβής δεν είναι έγκυρες.");
    }
    const offerIds = Array.isArray(body.offerIds) ? body.offerIds.filter((value): value is string => typeof value === "string") : undefined;
    const result = await setVendorProductFulfilmentBulk(principal, {
      offerIds,
      applyToAll: body.applyToAll === true,
      deliveryEligible: body.deliveryEligible,
      pickupEligible: body.pickupEligible,
      source: "products"
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "catalog_delivery_bulk_update_failed" }, { status: 400 });
  }
}
