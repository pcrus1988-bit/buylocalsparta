import { requireVendorSession } from "../../../../../lib/vendor-session";
import { updateVendorCatalogInventory, vendorCatalogControlWorkspace } from "../../../../../lib/vendor-catalog-control-service";

export async function PUT(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    await updateVendorCatalogInventory(principal, {
      offerId: typeof body.offerId === "string" ? body.offerId : "",
      onHand: Number(body.onHand),
      safetyStock: Number(body.safetyStock ?? 0)
    });
    return Response.json(await vendorCatalogControlWorkspace(principal));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "catalog_inventory_failed" }, { status: 400 });
  }
}
