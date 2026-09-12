import { requireVendorSession } from "../../../../../lib/vendor-session";
import {
  resetDropshippingProductPublicFields,
  saveDropshippingProductPublicFields,
  saveDropshippingSupplierPublicFields
} from "../../../../../lib/vendor-dropshipping-presentation";

export async function PUT(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    if (!principal.vendorId) throw new Error("VENDOR_AUTH_REQUIRED");
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "save-supplier") {
      const supplierCode = typeof body.supplierCode === "string" ? body.supplierCode.trim() : "";
      const fields = await saveDropshippingSupplierPublicFields(principal.vendorId, supplierCode, body.fields);
      return Response.json({ ok: true, fields });
    }
    if (action === "save-product") {
      const offerId = typeof body.offerId === "string" ? body.offerId.trim() : "";
      const fields = await saveDropshippingProductPublicFields(principal.vendorId, offerId, body.fields);
      return Response.json({ ok: true, fields });
    }
    if (action === "reset-product") {
      const offerId = typeof body.offerId === "string" ? body.offerId.trim() : "";
      await resetDropshippingProductPublicFields(principal.vendorId, offerId);
      return Response.json({ ok: true });
    }
    throw new Error("Μη έγκυρη ενέργεια public fields.");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "dropshipping_presentation_failed" }, { status: 400 });
  }
}
