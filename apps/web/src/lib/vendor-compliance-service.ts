import {
  assertVendorCapability,
  buildVendorOperatingContextFromSession,
  type SessionPrincipal
} from "@buy-local-sparta/core";
import { submitVendorCompliance as submitVendorComplianceRuntime } from "./vendor-backoffice-service";

export async function submitVendorCompliance(
  principal: SessionPrincipal,
  input: {
    canonicalVariantId: string;
    type: string;
    issuer?: string;
    identifier?: string;
    mediaAssetId?: string;
    validTo?: number;
  }
) {
  assertVendorCapability(buildVendorOperatingContextFromSession(principal), "compliance.submit");
  return submitVendorComplianceRuntime(principal, input);
}
