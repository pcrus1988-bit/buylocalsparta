import type { SessionPrincipal } from "@buy-local-sparta/core";
import { customerCheckoutProfile } from "./customer-address-runtime";
import { customerAccountProfile } from "./customer-account-profile-security";
import { productionDatabaseConfigured } from "./postgres-runtime";

export type CustomerAccountSetup = Readonly<{
  profileComplete: boolean;
  addressComplete: boolean;
  completedCount: number;
  totalCount: 2;
  complete: boolean;
}>;

export async function customerAccountSetup(principal: SessionPrincipal): Promise<CustomerAccountSetup> {
  const profile = await customerAccountProfile(principal);
  const profileComplete = Boolean(profile.firstName.trim() && profile.lastName.trim());
  let addressComplete = false;

  if (productionDatabaseConfigured()) {
    const checkoutProfile = await customerCheckoutProfile(principal);
    addressComplete = checkoutProfile.addresses.length > 0;
  }

  const completedCount = Number(profileComplete) + Number(addressComplete);
  return {
    profileComplete,
    addressComplete,
    completedCount,
    totalCount: 2,
    complete: completedCount === 2
  };
}
