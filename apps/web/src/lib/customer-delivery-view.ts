import type { SessionPrincipal } from "@buy-local-sparta/core";
import { deliveryCustomerWorkspace, type DeliveryJobView } from "./delivery-driver-runtime";
import { marketplaceReferenceMap } from "./public-reference-service";

function completedOrSkipped(status: string): boolean {
  return status === "completed" || status === "skipped";
}

function customerSafeDeliveryJob(job: DeliveryJobView): DeliveryJobView {
  const vendorPickups = job.stops.filter((stop) => stop.kind === "vendor_pickup");
  const vendorPickupsComplete = vendorPickups.length > 0 && vendorPickups.every((stop) => completedOrSkipped(stop.status));
  const customerDropoffActive = job.stops.some((stop) => stop.kind === "customer_dropoff" && stop.status === "ready");
  const customerReturnPickupOpen = job.stops.some((stop) => stop.kind === "customer_return_pickup" && !["completed", "skipped", "failed"].includes(stop.status));
  const exposeDeliveryProof = job.type === "outbound"
    && Boolean(job.driverId)
    && job.status === "in_progress"
    && vendorPickupsComplete
    && customerDropoffActive;
  const exposeReturnPickupProof = job.type === "return"
    && Boolean(job.driverId)
    && ["assigned", "in_progress"].includes(job.status)
    && customerReturnPickupOpen;
  const exposeLiveLocation = Boolean(job.driverId)
    && job.liveTracking
    && job.status === "in_progress"
    && (job.type === "outbound"
      ? vendorPickupsComplete && customerDropoffActive
      : customerReturnPickupOpen);

  return {
    ...job,
    // Exact GPS and the delivery proof are exposed only after the driver explicitly
    // confirms that the final customer leg has started. The customer drop-off stop
    // uses status=ready as the active-leg marker, while pending remains private.
    latestLocation: exposeLiveLocation ? job.latestLocation : undefined,
    pickupQr: undefined,
    customerQr: exposeDeliveryProof ? job.customerQr : undefined,
    returnPickupQr: exposeReturnPickupProof ? job.returnPickupQr : undefined,
  };
}

export async function customerDeliveryWorkspace(principal: SessionPrincipal) {
  const workspace = await deliveryCustomerWorkspace(principal);
  const references = await marketplaceReferenceMap("order", workspace.jobs.map((job) => job.orderId));
  return {
    jobs: workspace.jobs.map((job) => ({
      ...customerSafeDeliveryJob(job),
      // Customer surfaces use the readable order number (ORD-...) rather than the
      // internal/public commerce identifier (ord_...). This also lets the order-detail
      // page bind the delivery job to its canonical customer-facing order route.
      orderId: references.get(job.orderId) ?? job.orderId,
    })),
  };
}
