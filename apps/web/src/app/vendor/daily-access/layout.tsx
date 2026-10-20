import type { ReactNode } from "react";
import { VendorEntitlementLayout } from "../../../components/VendorEntitlementLayout";

export default function daily_accessEntitledLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <VendorEntitlementLayout capability="staff.manage">{children}</VendorEntitlementLayout>;
}
