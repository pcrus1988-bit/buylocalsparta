import { requireAdminSession } from "../../../../lib/admin-session";
import { adminQuickAddLookup, adminQuickAddSave, adminQuickAddWorkspace } from "../../../../lib/admin-quickadd-service";

export async function GET(request: Request) {
  try {
    const principal = await requireAdminSession(request);
    const url = new URL(request.url);
    const gtin = url.searchParams.get("gtin") ?? "";
    const q = url.searchParams.get("q") ?? "";
    const vendorId = url.searchParams.get("vendorId") ?? "";
    if (gtin || q) return Response.json(await adminQuickAddLookup(principal, { vendorId, gtin, q }));
    return Response.json(await adminQuickAddWorkspace(principal));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "admin_quickadd_failed" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true });
    const body = await request.json() as Record<string, unknown>;
    return Response.json(await adminQuickAddSave(principal, {
      vendorId: typeof body.vendorId === "string" ? body.vendorId : "",
      canonicalVariantId: typeof body.canonicalVariantId === "string" ? body.canonicalVariantId : undefined,
      title: typeof body.title === "string" ? body.title : "",
      description: typeof body.description === "string" ? body.description : undefined,
      gtin: typeof body.gtin === "string" ? body.gtin : undefined,
      brand: typeof body.brand === "string" ? body.brand : undefined,
      model: typeof body.model === "string" ? body.model : undefined,
      mpn: typeof body.mpn === "string" ? body.mpn : undefined,
      categoryCode: typeof body.categoryCode === "string" ? body.categoryCode : "",
      vendorSku: typeof body.vendorSku === "string" ? body.vendorSku : undefined,
      customerPriceMinor: Number(body.customerPriceMinor),
      onHand: Number(body.onHand),
      safetyStock: Number(body.safetyStock ?? 0),
      visible: body.visible !== false
    }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "admin_quickadd_save_failed" }, { status: 400 });
  }
}
