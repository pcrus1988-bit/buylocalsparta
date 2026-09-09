import { requireVendorSession } from "../../../../../lib/vendor-session";
import { readVendorStructuredPricing, updateVendorRetailPrice, updateVendorStructuredPricing } from "../../../../../lib/vendor-price-service";
import type { VendorPricingAdjustmentType, VendorPricingMode } from "../../../../../lib/vendor-pricing-calculation";

function optionalNumber(body: Record<string, unknown>, key: string): number | undefined {
  if (!(key in body) || body[key] === "" || body[key] == null) return undefined;
  const value = Number(body[key]);
  return Number.isFinite(value) ? value : Number.NaN;
}

function optionalMinor(body: Record<string, unknown>, key: string): number | null | undefined {
  if (!(key in body)) return undefined;
  if (body[key] === "" || body[key] == null) return null;
  return Number(body[key]);
}

function adjustmentType(body: Record<string, unknown>, key: string): VendorPricingAdjustmentType | null | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (value === "" || value == null) return null;
  if (value === "percent" || value === "fixed") return value;
  throw new Error("Μη έγκυρος τύπος προσαύξησης τιμής.");
}

export async function GET(request: Request) {
  try {
    const principal = await requireVendorSession(request);
    const pricing = await readVendorStructuredPricing(principal);
    return Response.json({ pricing });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "catalog_pricing_failed" }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const offerId = typeof body.offerId === "string" ? body.offerId : "";

    const structured = "pricingMode" in body || "buyingPriceMinor" in body || "markupType" in body
      || "discountType" in body || "msrpMinor" in body || "showMsrp" in body;
    if (!structured) {
      const priceMinor = Number(body.priceMinor);
      const result = await updateVendorRetailPrice(principal, { offerId, priceMinor });
      return Response.json(result);
    }

    const pricingMode: VendorPricingMode = body.pricingMode === "calculated" ? "calculated" : "manual";
    const result = await updateVendorStructuredPricing(principal, {
      offerId,
      pricingMode,
      priceMinor: optionalNumber(body, "priceMinor"),
      buyingPriceMinor: optionalMinor(body, "buyingPriceMinor"),
      markupType: adjustmentType(body, "markupType"),
      markupValue: optionalNumber(body, "markupValue"),
      discountType: adjustmentType(body, "discountType"),
      discountValue: optionalNumber(body, "discountValue"),
      msrpMinor: optionalMinor(body, "msrpMinor"),
      showMsrp: typeof body.showMsrp === "boolean" ? body.showMsrp : undefined
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "catalog_pricing_failed" }, { status: 400 });
  }
}
