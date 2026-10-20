import type { ReactNode } from "react";
import type { VendorCapability } from "@buy-local-sparta/core";
import { redirect } from "next/navigation";
import { getVendorSession, vendorOperatingContextForPrincipal } from "../lib/vendor-session";

/** Server route guard: removing a navigation link never constitutes permission. */
export async function VendorEntitlementLayout({ children, capability }: Readonly<{
  children: ReactNode;
  capability: VendorCapability;
}>) {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const operating = await vendorOperatingContextForPrincipal(principal);
  if (!operating.capabilities.includes(capability)) redirect("/vendor?plan=restricted");
  return children;
}
