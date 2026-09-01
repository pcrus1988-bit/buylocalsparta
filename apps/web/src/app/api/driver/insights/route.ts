import { deliveryDriverOperationsSnapshot } from "../../../../lib/delivery-operations-reporting";
import { requireDeliveryDriverSession } from "../../../../lib/delivery-driver-session";

export async function GET(request: Request) {
  try {
    const principal = await requireDeliveryDriverSession();
    const url = new URL(request.url);
    const days = Number(url.searchParams.get("days") ?? 30);
    return Response.json(await deliveryDriverOperationsSnapshot(principal, days), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "driver_auth_required" }, { status: 401 });
  }
}
