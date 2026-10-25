import type { ReactNode } from "react";
import { VendorEntitlementLayout } from "../../../components/VendorEntitlementLayout";

export default function analyticsEntitledLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <VendorEntitlementLayout capability="analytics.read">{children}</VendorEntitlementLayout>;
}
