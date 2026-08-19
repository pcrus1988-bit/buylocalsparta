import { requireVendorSession } from "../../../../../../lib/vendor-session";
import { collectVendorPickup } from "../../../../../../lib/vendor-pickup-collection";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json() as { token?: unknown };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) throw new Error("Pickup token is required");
    return Response.json(await collectVendorPickup(principal, token, Date.now()));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "pickup_collection_failed" }, { status: 400 });
  }
}
