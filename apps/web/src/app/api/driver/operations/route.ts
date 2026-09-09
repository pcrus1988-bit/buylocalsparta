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
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import { molliePaymentsEnabled, requireMolliePayments } from "../../../../lib/mollie-runtime";

async function captureKlarnaAfterConfirmedDelivery(token: string): Promise<void> {
  if (!molliePaymentsEnabled()) return;
  const parts = token.trim().split(".");
  if (parts.length !== 5 || parts[0] !== "kmd1" || parts[1] !== "delivery") return;
  const jobId = parts[2];
  if (!/^delivery_job_[a-f0-9]{32}$/.test(jobId)) return;
  const result = await getProductionPostgresRuntime().nativePool.query<{ order_id: string }>(`
    SELECT o.public_id AS order_id
    FROM delivery_jobs j JOIN customer_orders o ON o.id=j.order_id
    WHERE j.public_id=$1 AND j.status='completed'
    LIMIT 1
  `, [jobId]);
  const orderId = result.rows[0]?.order_id;
  if (!orderId) return;
  await requireMolliePayments().captureKlarnaOrderIfFulfilled({ orderId, now: Date.now() });
}

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
      const result = await driverScanDeliveryProof(principal, token);
      if (result.completed) {
        try {
          await captureKlarnaAfterConfirmedDelivery(token);
        } catch (error) {
          console.error(JSON.stringify({
            level: "error",
            event: "mollie.klarna_capture_after_delivery_failed",
            message: error instanceof Error ? error.message : String(error),
          }));
        }
      }
      return Response.json(result);
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
