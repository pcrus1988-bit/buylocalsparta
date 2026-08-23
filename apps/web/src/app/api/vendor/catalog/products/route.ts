import { requireVendorSession } from "../../../../../lib/vendor-session";
import { createVendorProductDraft, vendorCatalogWorkspace } from "../../../../../lib/vendor-backoffice-service";
import { createVendorProductFromCanonicalPrefill } from "../../../../../lib/vendor-canonical-prefill-service";
import {
  createVendorStructuredProductDraft,
  createVendorStructuredProductFromCanonical,
  type VendorVariantAttributes
} from "../../../../../lib/vendor-structured-product-identity-service";
import { postgresVendorRuntimeEnabled } from "../../../../../lib/vendor-runtime";

export async function POST(request: Request) {
  try {
    const principal = await requireVendorSession(request,true);
    const body = await request.json() as Record<string, unknown>;
    const text = (key: string) => typeof body[key] === "string" ? String(body[key]).trim() : "";
    const rawCustomerPrice = body.customerPriceMinor ?? body.supplierUnitPriceMinor;
    const canonicalVariantId = text("canonicalVariantId");
    const rawVariantAttributes = body.variantAttributes;
    const variantAttributes = rawVariantAttributes && typeof rawVariantAttributes === "object" && !Array.isArray(rawVariantAttributes)
      ? rawVariantAttributes as VendorVariantAttributes
      : undefined;
    const common = {
      title: text("title"),
      categoryCode: text("categoryCode"),
      productTypeCode: text("productTypeCode") || undefined,
      vendorSku: text("vendorSku") || undefined,
      brand: text("brand") || undefined,
      model: text("model") || undefined,
      mpn: text("mpn") || undefined,
      gtin: text("gtin") || undefined,
      variantAttributes,
      variantNote: text("variantNote") || undefined,
      // Compatibility name inside the runtime. This value is the vendor-defined FINAL customer price;
      // migration 0041 mirrors it into vendor_offers.customer_price_minor.
      supplierUnitPriceMinor: Number(rawCustomerPrice),
      stockOnHand: Number(body.stockOnHand),
      safetyStock: Number(body.safetyStock ?? 0),
      adviceAvailable: body.adviceAvailable !== false
    };

    if (canonicalVariantId) {
      if (postgresVendorRuntimeEnabled()) await createVendorStructuredProductFromCanonical(principal, { ...common, canonicalVariantId });
      else await createVendorProductFromCanonicalPrefill(principal, { ...common, canonicalVariantId });
    } else if (postgresVendorRuntimeEnabled()) {
      await createVendorStructuredProductDraft(principal, common);
    } else {
      await createVendorProductDraft(principal, common);
    }
    return Response.json(await vendorCatalogWorkspace(principal));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "catalog_create_failed" }, { status: 400 });
  }
}
