import { requireVendorSession } from "../../../../../../../lib/vendor-session";
import { isDropshippingOnlyVendor } from "../../../../../../../lib/vendor-dropshipping-access";
import { submitVendorProduct, vendorCatalogWorkspace } from "../../../../../../../lib/vendor-backoffice-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireVendorSession(request, true);
    if (await isDropshippingOnlyVendor(principal.vendorId)) {
      throw new Error("Manual product submission is disabled for the dropshipping-only vendor");
    }
    const { id } = await context.params;
    await submitVendorProduct(principal, id);
    return Response.json(await vendorCatalogWorkspace(principal));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "catalog_submit_failed" }, { status: 400 });
  }
}
