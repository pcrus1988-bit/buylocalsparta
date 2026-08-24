import { recordDeliveryDriverPresence } from "../../../../lib/delivery-driver-presence";
import { requireDeliveryDriverSession } from "../../../../lib/delivery-driver-session";

export async function POST(request: Request) {
  try {
    const principal = await requireDeliveryDriverSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    return Response.json(await recordDeliveryDriverPresence(principal, {
      jobId: typeof body.jobId === "string" && body.jobId.trim() ? body.jobId : undefined,
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      accuracy: body.accuracy == null ? undefined : Number(body.accuracy),
      heading: body.heading == null ? undefined : Number(body.heading),
      speed: body.speed == null ? undefined : Number(body.speed),
      deviceRecordedAt: body.deviceRecordedAt == null ? undefined : Number(body.deviceRecordedAt),
    }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "location_rejected" }, { status: 400 });
  }
}
