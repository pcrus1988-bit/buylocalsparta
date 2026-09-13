import { assertDropshippingOnlyVendor } from "../../../../../lib/vendor-dropshipping-access";
import { requireVendorSession } from "../../../../../lib/vendor-session";
import {
  resetDropshippingProductToSupplierDefaults,
  setDropshippingSupplierVisibility
} from "../../../../../lib/vendor-dropshipping-actions";

export async function POST(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    if (!principal.vendorId) throw new Error("VENDOR_AUTH_REQUIRED");
    await assertDropshippingOnlyVendor(principal.vendorId);

    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action.trim() : "";

    if (action === "reset-product") {
      const offerId = typeof body.offerId === "string" ? body.offerId.trim() : "";
      if (!offerId) throw new Error("Απαιτείται προϊόν.");
      return Response.json({ ok: true, ...(await resetDropshippingProductToSupplierDefaults(principal.vendorId, offerId)) });
    }

    if (action === "set-supplier-visibility") {
      const supplierCode = typeof body.supplierCode === "string" ? body.supplierCode.trim() : "";
      if (!supplierCode || typeof body.visible !== "boolean") throw new Error("Μη έγκυρη μαζική αλλαγή ορατότητας.");
      return Response.json({ ok: true, ...(await setDropshippingSupplierVisibility(principal.vendorId, supplierCode, body.visible)) });
    }

    throw new Error("Μη υποστηριζόμενη Dropshipping ενέργεια.");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "dropshipping_action_failed" }, { status: 400 });
  }
}
