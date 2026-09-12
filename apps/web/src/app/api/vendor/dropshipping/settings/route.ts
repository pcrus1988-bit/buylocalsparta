import { requireVendorSession } from "../../../../../lib/vendor-session";
import { applyDropshippingSupplierDefaultsSequential } from "../../../../../lib/vendor-dropshipping-bulk-apply";
import { saveDropshippingSupplierDefaults } from "../../../../../lib/vendor-dropshipping-service";

function numberValue(body: Record<string, unknown>, key: string): number {
  const value = Number(body[key]);
  if (!Number.isFinite(value)) throw new Error(`Μη έγκυρη αριθμητική τιμή: ${key}`);
  return value;
}

export async function PUT(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    if (!principal.vendorId) throw new Error("VENDOR_AUTH_REQUIRED");
    const body = await request.json() as Record<string, unknown>;
    const supplierCode = typeof body.supplierCode === "string" ? body.supplierCode.trim() : "";
    if (!supplierCode) throw new Error("Απαιτείται supplier.");
    if (typeof body.visible !== "boolean" || typeof body.showMsrp !== "boolean") throw new Error("Μη έγκυρες global ρυθμίσεις ορατότητας.");
    const defaults = await saveDropshippingSupplierDefaults(principal.vendorId, supplierCode, {
      visible: body.visible,
      markupPercent: numberValue(body, "markupPercent"),
      discountPercent: numberValue(body, "discountPercent"),
      showMsrp: body.showMsrp
    });
    return Response.json({ ok: true, defaults });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "dropshipping_supplier_settings_failed" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    if (!principal.vendorId) throw new Error("VENDOR_AUTH_REQUIRED");
    const body = await request.json() as Record<string, unknown>;
    const supplierCode = typeof body.supplierCode === "string" ? body.supplierCode.trim() : "";
    if (!supplierCode) throw new Error("Απαιτείται supplier.");
    const result = await applyDropshippingSupplierDefaultsSequential(principal.vendorId, supplierCode);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "dropshipping_supplier_apply_failed" }, { status: 400 });
  }
}
