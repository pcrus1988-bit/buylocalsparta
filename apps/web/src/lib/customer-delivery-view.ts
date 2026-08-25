import type { SessionPrincipal } from "@buy-local-sparta/core";
import { deliveryCustomerWorkspace, type DeliveryJobView } from "./delivery-driver-runtime";

function completedOrSkipped(status: string): boolean {
  return status === "completed" || status === "skipped";
}

function customerSafeDeliveryJob(job: DeliveryJobView): DeliveryJobView {
  const vendorPickups = job.stops.filter((stop) => stop.kind === "vendor_pickup");
  const vendorPickupsComplete = vendorPickups.length > 0 && vendorPickups.every((stop) => completedOrSkipped(stop.status));
  const customerDropoffOpen = job.stops.some((stop) => stop.kind === "customer_dropoff" && !["completed", "skipped", "failed"].includes(stop.status));
  const customerReturnPickupOpen = job.stops.some((stop) => stop.kind === "customer_return_pickup" && !["completed", "skipped", "failed"].includes(stop.status));
  const exposeDeliveryProof = job.type === "outbound"
    && Boolean(job.driverId)
    && job.status === "in_progress"
    && vendorPickupsComplete
    && customerDropoffOpen;
  const exposeReturnPickupProof = job.type === "return"
    && Boolean(job.driverId)
    && ["assigned", "in_progress"].includes(job.status)
    && customerReturnPickupOpen;
  const exposeLiveLocation = Boolean(job.driverId)
    && job.liveTracking
    && job.status === "in_progress"
    && (job.type === "outbound"
      ? vendorPickupsComplete && customerDropoffOpen
      : customerReturnPickupOpen);

  return {
    ...job,
    // Exact GPS is exposed only while the assigned driver is on the customer's active
    // leg. Before all vendor pickups are complete the general customer workspace keeps
    // the driver's position private.
    latestLocation: exposeLiveLocation ? job.latestLocation : undefined,
    pickupQr: undefined,
    customerQr: exposeDeliveryProof ? job.customerQr : undefined,
    returnPickupQr: exposeReturnPickupProof ? job.returnPickupQr : undefined,
  };
}

export async function customerDeliveryWorkspace(principal: SessionPrincipal) {
  const workspace = await deliveryCustomerWorkspace(principal);
  return { jobs: workspace.jobs.map(customerSafeDeliveryJob) };
}
