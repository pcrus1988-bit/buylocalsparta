import type { ReactNode } from "react";
import { VendorEntitlementLayout } from "../../../components/VendorEntitlementLayout";

export default function reportsEntitledLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <VendorEntitlementLayout capability="analytics.read">{children}</VendorEntitlementLayout>;
}
