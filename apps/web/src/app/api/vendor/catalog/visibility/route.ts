import { requireVendorSession } from "../../../../../lib/vendor-session";
import { setVendorCatalogVisibility, vendorCatalogControlWorkspace } from "../../../../../lib/vendor-catalog-control-service";

export async function PUT(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const scope = body.scope === "category" ? "category" : body.scope === "product" ? "product" : undefined;
    if (!scope) throw new Error("Visibility scope must be product or category");
    if (typeof body.visible !== "boolean") throw new Error("Visibility must be true or false");
    await setVendorCatalogVisibility(principal, {
      scope,
      visible: body.visible,
      offerId: typeof body.offerId === "string" ? body.offerId : undefined,
      categoryId: typeof body.categoryId === "string" ? body.categoryId : undefined
    });
    return Response.json(await vendorCatalogControlWorkspace(principal));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "catalog_visibility_failed" }, { status: 400 });
  }
}
