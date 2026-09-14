import {
  assertVendorCapability,
  buildVendorOperatingContextFromSession,
  type SessionPrincipal
} from "@buy-local-sparta/core";
import { createVendorBoxNowShipment } from "./boxnow-shipping-runtime";
import { resolveVendorOperatingAssignment } from "./vendor-operating-assignment";

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
  const assignment = await resolveVendorOperatingAssignment(principal);
  const context = buildVendorOperatingContextFromSession(principal, assignment);
  assertVendorCapability(context, "fulfilment.manage");
  return createVendorBoxNowShipment(principal, fulfilmentId);
}
