import { driverScanDeliveryProof, driverSetLiveTracking } from "../../../../lib/delivery-driver-runtime";
import { assertCustomerDeliveryLegActive, driverStartCustomerDeliveryLeg } from "../../../../lib/delivery-customer-leg-runtime";
import {
  acceptDeliveryAssignmentOffer,
  declineDeliveryAssignmentOffer,
  deliveryDriverDispatchWorkspace,
  runAdaptiveDeliveryDispatcher,
} from "../../../../lib/delivery-dispatch-runtime";
import {
  getDeliveryDriverPresenceState,
  type DeliveryDriverAvailability,
} from "../../../../lib/delivery-driver-presence";
import { clockInDeliveryDriverForToday, getDeliveryDriverMobileMeta } from "../../../../lib/delivery-driver-mobile-runtime";
import { setDeliveryDriverAvailabilityWithTimekeeping } from "../../../../lib/delivery-operations-reporting";
import { requireDeliveryDriverSession } from "../../../../lib/delivery-driver-session";

export async function GET() {
  try {
    const principal = await requireDeliveryDriverSession();
    const workspace = await deliveryDriverDispatchWorkspace(principal);
    const [driver, meta] = await Promise.all([
      getDeliveryDriverPresenceState(principal),
      getDeliveryDriverMobileMeta(principal),
    ]);
    return Response.json({ ...workspace, driver, meta }, { headers: { "Cache-Control": "no-store" } });
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
    if (action === "clock_in") {
      await clockInDeliveryDriverForToday(principal);
      const driver = await setDeliveryDriverAvailabilityWithTimekeeping(principal, "available");
      const meta = await getDeliveryDriverMobileMeta(principal);
      await runAdaptiveDeliveryDispatcher(Date.now(), 4);
      return Response.json({ ok: true, driver, meta });
    }
    if (action === "availability") {
      const availability = String(body.availability ?? "") as DeliveryDriverAvailability;
      if (!(["available", "paused", "off_shift"] as const).includes(availability)) {
        return Response.json({ error: "invalid_driver_availability" }, { status: 400 });
      }
      const driver = await setDeliveryDriverAvailabilityWithTimekeeping(principal, availability);
      if (availability === "available") await runAdaptiveDeliveryDispatcher(Date.now(), 4);
      return Response.json({ ok: true, driver });
    }
    if (action === "scan") {
      const token = String(body.token ?? "");
      await assertCustomerDeliveryLegActive(principal, token);
      return Response.json(await driverScanDeliveryProof(principal, token));
    }
    if (action === "start_customer_leg") {
      return Response.json(await driverStartCustomerDeliveryLeg(principal, { jobId: String(body.jobId ?? "") }));
    }
    if (action === "tracking") {
      return Response.json(await driverSetLiveTracking(principal, { jobId: String(body.jobId ?? ""), enabled: body.enabled === true }));
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "delivery_operation_failed" }, { status: 400 });
  }
}
