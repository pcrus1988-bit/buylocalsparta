import { recordVendorVisibilityInteraction, type VendorVisibilityInteraction } from "../../../../lib/vendor-visibility";

const allowed = new Set<VendorVisibilityInteraction>(["claim", "phone", "website", "directions"]);

export async function POST(request: Request) {
  try {
    const body = await request.json() as { vendorId?: unknown; event?: unknown };
    if (typeof body.vendorId !== "string" || body.vendorId.length < 3 || body.vendorId.length > 160 || typeof body.event !== "string" || !allowed.has(body.event as VendorVisibilityInteraction)) {
      return Response.json({ error: "invalid_vendor_interaction" }, { status: 400 });
    }
    const recorded = await recordVendorVisibilityInteraction(body.vendorId, body.event as VendorVisibilityInteraction);
    return recorded ? new Response(null, { status: 204 }) : Response.json({ error: "vendor_not_found" }, { status: 404 });
  } catch {
    return Response.json({ error: "invalid_vendor_interaction" }, { status: 400 });
  }
}
