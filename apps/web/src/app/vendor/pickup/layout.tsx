import type { ReactNode } from "react";
import { VendorEntitlementLayout } from "../../../components/VendorEntitlementLayout";

export default function pickupEntitledLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <VendorEntitlementLayout capability="pickup.manage">{children}</VendorEntitlementLayout>;
}
