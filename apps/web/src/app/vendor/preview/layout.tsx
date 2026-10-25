import type { ReactNode } from "react";
import { VendorEntitlementLayout } from "../../../components/VendorEntitlementLayout";

export default function previewEntitledLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <VendorEntitlementLayout capability="shop.read">{children}</VendorEntitlementLayout>;
}
