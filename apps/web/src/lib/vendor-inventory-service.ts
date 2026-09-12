import {
  assertVendorCapability,
  buildVendorOperatingContextFromSession,
  type SessionPrincipal
} from "@buy-local-sparta/core";
import { updateVendorStock as updateVendorStockRuntime } from "./vendor-runtime";

export async function updateVendorStock(
  principal: SessionPrincipal,
  input: { offerId: string; onHand: number; now?: number }
) {
  assertVendorCapability(buildVendorOperatingContextFromSession(principal), "inventory.manage");
  return updateVendorStockRuntime(principal, input);
}
