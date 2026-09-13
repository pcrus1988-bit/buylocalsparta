import { assertDropshippingOnlyVendor } from "../../../../../lib/vendor-dropshipping-access";
import { requireVendorSession } from "../../../../../lib/vendor-session";
import {
  resetDropshippingProductPublicFields,
  saveDropshippingProductPublicFields,
  saveDropshippingSupplierPublicFields,
  vendorDropshippingProductPublicFields,
  vendorDropshippingSupplierPublicFields
} from "../../../../../lib/vendor-dropshipping-presentation";

export async function GET(request: Request) {
  try {
    const principal = await requireVendorSession(request);
    if (!principal.vendorId) throw new Error("VENDOR_AUTH_REQUIRED");
    await assertDropshippingOnlyVendor(principal.vendorId);
    const url = new URL(request.url);
    const offerId = url.searchParams.get("offerId")?.trim() ?? "";
    const supplierCode = url.searchParams.get("supplierCode")?.trim() ?? "";
    if (offerId) {
      const result = await vendorDropshippingProductPublicFields(principal.vendorId, offerId);
      return Response.json({ ok: true, ...result });
    }
    if (supplierCode) {
      const fields = await vendorDropshippingSupplierPublicFields(principal.vendorId, supplierCode);
      return Response.json({ ok: true, fields });
    }
    throw new Error("Απαιτείται supplierCode ή offerId.");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "dropshipping_presentation_failed" }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    if (!principal.vendorId) throw new Error("VENDOR_AUTH_REQUIRED");
    await assertDropshippingOnlyVendor(principal.vendorId);
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
