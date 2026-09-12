import { getProductionPostgresRuntime } from "../../../../../lib/postgres-runtime";
import { isDropshippingOnlyVendor } from "../../../../../lib/vendor-dropshipping-access";
import { requireVendorSession } from "../../../../../lib/vendor-session";
import { readVendorStructuredPricing, updateVendorRetailPrice, updateVendorStructuredPricing } from "../../../../../lib/vendor-price-service";
import { calculateRetailPriceMinor, type VendorPricingAdjustmentType, type VendorPricingMode } from "../../../../../lib/vendor-pricing-calculation";

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

async function authoritativeDropshipCost(vendorId: string | null | undefined, offerId: string): Promise<number> {
  if (!vendorId) throw new Error("VENDOR_AUTH_REQUIRED");
  const result = await getProductionPostgresRuntime().sqlPool.query(`
    SELECT dso.supplier_cost_minor
    FROM vendor_offers vo
    JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
    JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
    WHERE vo.public_id=$1
      AND vo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2 OR id::text=$2 LIMIT 1)
      AND ds.owner_vendor_id=vo.vendor_id
      AND ds.active=true
      AND dso.supplier_cost_minor IS NOT NULL
    LIMIT 1
  `, [offerId, vendorId]);
  const cost = Number(result.rows[0]?.supplier_cost_minor);
  if (result.rowCount !== 1 || !Number.isSafeInteger(cost) || cost < 0) {
    throw new Error("Δεν υπάρχει έγκυρη supplier buying price για αυτό το Dropshipping προϊόν.");
  }
  return cost;
}

async function markDropshippingManualOverride(vendorId: string | null | undefined, offerId: string): Promise<void> {
  if (!vendorId || !offerId) return;
  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE vendor_offers vo
       SET source_payload=COALESCE(vo.source_payload,'{}'::jsonb)
             || jsonb_build_object(
                  'pricingManualOverride',true,
                  'pricingManagedBy','manual_override',
                  'pricingManualOverrideAt',now()
                ),
           updated_at=now()
     WHERE vo.public_id=$1
       AND vo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2 OR id::text=$2 LIMIT 1)
       AND EXISTS (
         SELECT 1
           FROM dropship_supplier_offers dso
           JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
          WHERE dso.vendor_offer_id=vo.id
            AND ds.owner_vendor_id=vo.vendor_id
       )
  `, [offerId, vendorId]);
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
    const dropshippingOnly = await isDropshippingOnlyVendor(principal.vendorId);

    const structured = "pricingMode" in body || "buyingPriceMinor" in body || "markupType" in body
      || "discountType" in body || "msrpMinor" in body || "showMsrp" in body;
    if (!structured) {
      if (dropshippingOnly) throw new Error("Τα Dropshipping προϊόντα τιμολογούνται μόνο από την supplier buying price και κανόνες markup/discount.");
      const priceMinor = Number(body.priceMinor);
      const result = await updateVendorRetailPrice(principal, { offerId, priceMinor });
      return Response.json(result);
    }

    const markupType = adjustmentType(body, "markupType");
    const markupValue = optionalNumber(body, "markupValue");
    const discountType = adjustmentType(body, "discountType");
    const discountValue = optionalNumber(body, "discountValue");
    let pricingMode: VendorPricingMode = body.pricingMode === "calculated" ? "calculated" : "manual";
    let buyingPriceMinor = optionalMinor(body, "buyingPriceMinor");

    if (dropshippingOnly) {
      if (body.pricingMode !== "calculated") throw new Error("Τα Dropshipping προϊόντα απαιτούν calculated pricing.");
      if (markupType !== "percent" && markupType !== "fixed") throw new Error("Απαιτείται markup για το Dropshipping προϊόν.");
      if (markupValue === undefined) throw new Error("Απαιτείται τιμή markup για το Dropshipping προϊόν.");
      const supplierCostMinor = await authoritativeDropshipCost(principal.vendorId, offerId);
      const calculated = calculateRetailPriceMinor({
        buyingPriceMinor: supplierCostMinor,
        markupType,
        markupValue,
        discountType: discountType ?? undefined,
        discountValue: discountType ? discountValue : undefined
      });
      if (calculated < supplierCostMinor) throw new Error("Η τελική Dropshipping τιμή δεν μπορεί να είναι χαμηλότερη από την supplier buying price.");
      pricingMode = "calculated";
      buyingPriceMinor = supplierCostMinor;
    }

    const result = await updateVendorStructuredPricing(principal, {
      offerId,
      pricingMode,
      priceMinor: dropshippingOnly ? undefined : optionalNumber(body, "priceMinor"),
      buyingPriceMinor,
      markupType,
      markupValue,
      discountType,
      discountValue,
      msrpMinor: dropshippingOnly ? undefined : optionalMinor(body, "msrpMinor"),
      showMsrp: typeof body.showMsrp === "boolean" ? body.showMsrp : undefined
    });
    if (dropshippingOnly) await markDropshippingManualOverride(principal.vendorId, offerId);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "catalog_pricing_failed" }, { status: 400 });
  }
}
