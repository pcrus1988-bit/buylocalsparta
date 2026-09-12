import {
  assertVendorCapability,
  buildVendorOperatingContextFromSession,
  type SessionPrincipal
} from "@buy-local-sparta/core";
import { actOnVendorFulfilment as actOnVendorFulfilmentRuntime } from "./vendor-runtime";

export async function actOnVendorFulfilment(
  principal: SessionPrincipal,
  input: { fulfilmentId: string; action: string; now?: number }
) {
  assertVendorCapability(buildVendorOperatingContextFromSession(principal), "fulfilment.manage");
  return actOnVendorFulfilmentRuntime(principal, input);
}
