import { requireVendorSession } from "../../../../../lib/vendor-session";
import { isDropshippingOnlyVendor } from "../../../../../lib/vendor-dropshipping-access";
import {
  setVendorProductFulfilmentBulk,
  setVendorProductFulfilmentPreference,
  vendorProductDeliverySettings,
  type VendorProductDeliveryFilter
} from "../../../../../lib/vendor-delivery-eligibility-service";

function integerParam(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function filterParam(value: string | null): VendorProductDeliveryFilter {
  return value === "delivery" || value === "pickup" || value === "custom" ? value : "all";
}

async function assertDropshippingFulfilment(principalVendorId: string | null | undefined, pickupEligible: boolean): Promise<void> {
  if (pickupEligible && await isDropshippingOnlyVendor(principalVendorId)) {
    throw new Error("Local pickup is disabled for the dropshipping-only vendor. Supplier products can only use shipping/delivery fulfilment.");
  }
}

export async function GET(request: Request) {
  try {
    const principal = await requireVendorSession(request, false);
    const url = new URL(request.url);
    const result = await vendorProductDeliverySettings(principal, {
      query: url.searchParams.get("q") ?? "",
      filter: filterParam(url.searchParams.get("filter")),
      limit: integerParam(url.searchParams.get("limit"), 40),
      offset: integerParam(url.searchParams.get("offset"), 0)
    });
    return Response.json(result, { headers: { "cache-control": "private, no-store, max-age=0" } });
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
    const pickupEligible = typeof body.pickupEligible === "boolean" ? body.pickupEligible : true;
    await assertDropshippingFulfilment(principal.vendorId, pickupEligible);
    const result = await setVendorProductFulfilmentPreference(principal, {
      offerId,
      deliveryEligible: body.deliveryEligible,
      pickupEligible,
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
    await assertDropshippingFulfilment(principal.vendorId, body.pickupEligible);
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
