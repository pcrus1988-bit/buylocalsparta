import { requireVendorSession } from "../../../../../lib/vendor-session";
import { vendorProductIdentitySchema } from "../../../../../lib/vendor-structured-product-identity-service";

export async function GET(request: Request) {
  try {
    const principal = await requireVendorSession(request);
    const url = new URL(request.url);
    const categoryCode = url.searchParams.get("categoryCode")?.trim() ?? "";
    const canonicalVariantId = url.searchParams.get("canonicalVariantId")?.trim() || undefined;
    if (!categoryCode) return Response.json({ error: "category_required" }, { status: 400 });
    const schema = await vendorProductIdentitySchema(principal, { categoryCode, canonicalVariantId });
    return Response.json({ schema });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "product_schema_lookup_failed" }, { status: 400 });
  }
}
