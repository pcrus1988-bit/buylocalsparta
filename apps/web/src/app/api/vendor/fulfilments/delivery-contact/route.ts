import { requireVendorSession } from "../../../../../lib/vendor-session";
import { vendorLocalDeliveryContact } from "../../../../../lib/vendor-runtime";

export async function POST(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json() as { fulfilmentId?: unknown };
    const fulfilmentId = typeof body.fulfilmentId === "string" ? body.fulfilmentId.trim() : "";
    if (!fulfilmentId || fulfilmentId.length > 128) throw new Error("Fulfilment is required");
    const contact = await vendorLocalDeliveryContact(principal, fulfilmentId);
    return Response.json(contact, {
      headers: {
        "cache-control": "no-store, private",
        "pragma": "no-cache"
      }
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "delivery_contact_failed" }, {
      status: 400,
      headers: { "cache-control": "no-store, private" }
    });
  }
}
