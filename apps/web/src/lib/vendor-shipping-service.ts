import {
  assertVendorCapability,
  buildVendorOperatingContextFromSession,
  type SessionPrincipal
} from "@buy-local-sparta/core";
import {
  createVendorBoxNowShipment,
  handoverVendorBoxNowShipment
} from "./boxnow-shipping-runtime";
import { resolveVendorOperatingAssignment } from "./vendor-operating-assignment";

async function requireFulfilmentManagement(principal: SessionPrincipal) {
  const assignment = await resolveVendorOperatingAssignment(principal);
  const context = buildVendorOperatingContextFromSession(principal, assignment);
  assertVendorCapability(context, "fulfilment.manage");
}

/**
 * Shared backend boundary for vendor shipment creation.
 *
 * Shipment creation is fulfilment execution, not shipping-settings administration, so it uses
 * fulfilment.manage. That capability intentionally exists for both MANAGED Sparta vendors and
 * SELF_GOVERNED expansion vendors. The underlying shipping runtime remains responsible for its
 * existing vendor/resource ownership checks.
 */
export async function createVendorShipment(
  principal: SessionPrincipal,
  fulfilmentId: string
) {
  await requireFulfilmentManagement(principal);
  return createVendorBoxNowShipment(principal, fulfilmentId);
}

/**
 * Shared backend boundary for marking a carrier shipment handed over.
 *
 * Handover mutates the vendor's fulfilment/order segment, so it is guarded by the same
 * fulfilment.manage capability while the BoxNow runtime continues to enforce shipment ownership.
 */
export async function handoverVendorShipment(
  principal: SessionPrincipal,
  shipmentId: string
) {
  await requireFulfilmentManagement(principal);
  return handoverVendorBoxNowShipment(principal, shipmentId);
}
