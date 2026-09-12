import {
  assertVendorCapability,
  buildVendorOperatingContextFromSession,
  type SessionPrincipal
} from "@buy-local-sparta/core";
import { collectVendorPickup as collectVendorPickupRuntime } from "./vendor-pickup-collection";

export async function collectVendorPickup(
  principal: SessionPrincipal,
  token: string,
  now = Date.now()
) {
  assertVendorCapability(buildVendorOperatingContextFromSession(principal), "pickup.manage");
  return collectVendorPickupRuntime(principal, token, now);
}
