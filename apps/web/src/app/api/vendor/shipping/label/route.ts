import { requireVendorSession } from "../../../../../lib/vendor-session";
import { vendorBoxNowLabel } from "../../../../../lib/boxnow-shipping-runtime";

export async function GET(request: Request) {
  try {
    const principal = await requireVendorSession();
    const shipmentId = new URL(request.url).searchParams.get("shipmentId")?.trim() ?? "";
    if (!shipmentId) throw new Error("shipmentId is required");

    const pdf = await vendorBoxNowLabel(principal, shipmentId);
    const body = Uint8Array.from(pdf).buffer;

    return new Response(body, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="boxnow-${shipmentId}.pdf"`,
        "cache-control": "private, no-store"
      }
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "boxnow_label_failed" },
      { status: 400 }
    );
  }
}
