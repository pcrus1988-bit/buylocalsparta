import { requireVendorSession } from "../../../../../lib/vendor-session";
import { createVendorProductDraft, vendorCatalogWorkspace } from "../../../../../lib/vendor-backoffice-service";
import { createVendorProductFromCanonical } from "../../../../../lib/vendor-canonical-match-service";

export async function POST(request: Request) {
  try {
    const principal = await requireVendorSession(request,true);
    const body = await request.json() as Record<string, unknown>;
    const text = (key: string) => typeof body[key] === "string" ? String(body[key]).trim() : "";
    const rawCustomerPrice = body.customerPriceMinor ?? body.supplierUnitPriceMinor;
    const canonicalVariantId = text("canonicalVariantId");
    const common = {
      title: text("title"),
      vendorSku: text("vendorSku") || undefined,
      brand: text("brand") || undefined,
      model: text("model") || undefined,
      gtin: text("gtin") || undefined,
      // Compatibility name inside the runtime. This value is the vendor-defined FINAL customer price;
      // migration 0041 mirrors it into vendor_offers.customer_price_minor.
      supplierUnitPriceMinor: Number(rawCustomerPrice),
      stockOnHand: Number(body.stockOnHand),
      safetyStock: Number(body.safetyStock ?? 0),
      adviceAvailable: body.adviceAvailable !== false
    };

    if (canonicalVariantId) {
      await createVendorProductFromCanonical(principal, {
        ...common,
        canonicalVariantId,
        variantNote: text("variantNote") || undefined
      });
    } else {
      await createVendorProductDraft(principal, {
        ...common,
        categoryCode: text("categoryCode")
      });
    }
    return Response.json(await vendorCatalogWorkspace(principal));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "catalog_create_failed" }, { status: 400 });
  }
}
