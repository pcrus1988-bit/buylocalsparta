import { requireDailySession } from "../../../../../lib/daily-session";
import { resolveDailyPickupNotifications } from "../../../../../lib/daily-order-inbox";
import { collectVendorPickup } from "../../../../../lib/vendor-pickup-collection";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const principal = await requireDailySession(request, true);
    const body = await request.json() as { token?: unknown };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) throw new Error("Pickup token is required");
    const now = Date.now();
    const pickup = await collectVendorPickup(principal, token, now);
    await resolveDailyPickupNotifications(principal, token, now);
    return Response.json(pickup);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "pickup_collection_failed" }, { status: 400 });
  }
}
