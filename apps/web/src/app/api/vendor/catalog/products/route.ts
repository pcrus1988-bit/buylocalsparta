import { requireVendorCapability, requireVendorSession } from "../../../../../lib/vendor-session";
import { isDropshippingOnlyVendor } from "../../../../../lib/vendor-dropshipping-access";
import { createVendorProductDraft, vendorCatalogWorkspace } from "../../../../../lib/vendor-backoffice-service";
import { searchVendorCatalogProducts } from "../../../../../lib/vendor-catalog-control-service";
import { getVendorAdminArchivedOfferIds } from "../../../../../lib/vendor-offer-reactivation-state";
import { createVendorProductFromCanonicalPrefill } from "../../../../../lib/vendor-canonical-prefill-service";
import {
  createVendorStructuredProductDraft,
  createVendorStructuredProductFromCanonical,
  type VendorVariantAttributes
} from "../../../../../lib/vendor-structured-product-identity-service";
import { postgresVendorRuntimeEnabled } from "../../../../../lib/vendor-runtime";

export async function GET(request: Request) {
  try {
    const principal = await requireVendorSession();
    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim() ?? "";
    const categoryId = url.searchParams.get("category")?.trim() ?? "";
    const visibility = url.searchParams.get("visibility")?.trim() ?? "all";
    const stock = url.searchParams.get("stock")?.trim() ?? "all";
    const brand = url.searchParams.get("brand")?.trim() ?? "";
    const sort = url.searchParams.get("sort")?.trim() ?? "updated";
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 24);
    const hasSearchIntent = Boolean(query || categoryId || brand || visibility !== "all" || stock !== "all");

    const result = await searchVendorCatalogProducts(principal, {
      query,
      categoryId: categoryId || undefined,
      visibility: visibility as "all" | "visible" | "hidden",
      stock: stock as "all" | "in" | "low" | "out",
      brand,
      sort: sort as "updated" | "title" | "category" | "stock",
      offset,
      limit
    });

    if (!hasSearchIntent || result.products.length === 0) return Response.json(result);

    const adminArchivedOfferIds = await getVendorAdminArchivedOfferIds(principal);
    return Response.json({
      ...result,
      products: result.products.map((item) => ({
        ...item,
        canToggleVisibility: item.canToggleVisibility && !adminArchivedOfferIds.has(item.offerId)
      }))
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "catalog_search_failed" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const { principal } = await requireVendorCapability("catalogue.submit", request, true);
    if (await isDropshippingOnlyVendor(principal.vendorId)) throw new Error("This vendor can only sell products supplied by approved dropshipping integrations");
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
    return Response.json(await vendorCatalogWorkspace(principal, { loadCatalogProducts: false }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "catalog_create_failed" }, { status: 400 });
  }
}
