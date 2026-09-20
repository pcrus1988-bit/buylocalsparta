import {
  assertVendorCapability,
  buildVendorOperatingContextFromSession,
  type SessionPrincipal
} from "@buy-local-sparta/core";
import { actOnVendorFulfilment as actOnVendorFulfilmentRuntime } from "./vendor-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export async function actOnVendorFulfilment(
  principal: SessionPrincipal,
  input: { fulfilmentId: string; action: string; now?: number }
) {
  assertVendorCapability(buildVendorOperatingContextFromSession(principal), "fulfilment.manage");
  return actOnVendorFulfilmentRuntime(principal, input);
}


export async function recordVendorManualShipment(
  principal: SessionPrincipal,
  input: { fulfilmentId: string; carrier: string; trackingNumber: string; deliveryNote?: string; now?: number }
) {
  assertVendorCapability(buildVendorOperatingContextFromSession(principal), "fulfilment.manage");
  return getProductionPostgresRuntime().vendorOperations.recordManualShipment(principal, input);
}
