import { driverScanDeliveryProof, driverSetLiveTracking } from "../../../../lib/delivery-driver-runtime";
import {
  acceptDeliveryAssignmentOffer,
  declineDeliveryAssignmentOffer,
  deliveryDriverDispatchWorkspace,
  runAdaptiveDeliveryDispatcher,
} from "../../../../lib/delivery-dispatch-runtime";
import {
  getDeliveryDriverPresenceState,
  setDeliveryDriverAvailability,
  type DeliveryDriverAvailability,
} from "../../../../lib/delivery-driver-presence";
import { requireDeliveryDriverSession } from "../../../../lib/delivery-driver-session";

export async function GET() {
  try {
    const principal = await requireDeliveryDriverSession();
    const [workspace, driver] = await Promise.all([
      deliveryDriverDispatchWorkspace(principal),
      getDeliveryDriverPresenceState(principal),
    ]);
    return Response.json({ ...workspace, driver }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "driver_auth_required" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireDeliveryDriverSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (action === "claim" || action === "accept_offer") {
      return Response.json(await acceptDeliveryAssignmentOffer(principal, String(body.jobId ?? "")));
    }
    if (action === "decline_offer") {
      const result = await declineDeliveryAssignmentOffer(principal, String(body.jobId ?? ""), String(body.reason ?? ""));
      await runAdaptiveDeliveryDispatcher(Date.now(), 4);
      return Response.json(result);
    }
    if (action === "availability") {
      const availability = String(body.availability ?? "") as DeliveryDriverAvailability;
      if (!(["available", "paused", "off_shift"] as const).includes(availability)) {
        return Response.json({ error: "invalid_driver_availability" }, { status: 400 });
      }
      const driver = await setDeliveryDriverAvailability(principal, availability);
      if (availability === "available") await runAdaptiveDeliveryDispatcher(Date.now(), 4);
      return Response.json({ ok: true, driver });
    }
    if (action === "scan") return Response.json(await driverScanDeliveryProof(principal, String(body.token ?? "")));
    if (action === "tracking") {
      return Response.json(await driverSetLiveTracking(principal, { jobId: String(body.jobId ?? ""), enabled: body.enabled === true }));
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "delivery_operation_failed" }, { status: 400 });
  }
}
