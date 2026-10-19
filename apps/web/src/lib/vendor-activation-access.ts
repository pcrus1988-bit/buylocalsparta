import { prepareDedicatedVendorReset, type VendorIdentityReset } from "./vendor-identity-runtime";

export type VendorActivationAccess = VendorIdentityReset;

// Vendor activation and password recovery never mutate the consumer password hash.
export async function prepareVendorActivationAccess(input: {
  vendorId: string; actorUserId: string; now: number; forcePasswordSetup?: boolean
}): Promise<VendorActivationAccess> {
  return prepareDedicatedVendorReset({
    vendorId: input.vendorId,
    actorUserId: input.actorUserId,
    now: input.now
  });
}
export async function prepareHubClaimPasswordReset(input: {
  claimId: string; actorUserId: string; now: number
}): Promise<VendorActivationAccess> {
  return prepareDedicatedVendorReset({
    claimId: input.claimId,
    actorUserId: input.actorUserId,
    now: input.now
  });
}
