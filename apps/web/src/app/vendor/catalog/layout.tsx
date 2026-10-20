import { redirect } from "next/navigation";
import { VendorEntitlementLayout } from "../../../components/VendorEntitlementLayout";
import { isDropshippingOnlyVendor } from "../../../lib/vendor-dropshipping-access";
import { getVendorSession } from "../../../lib/vendor-session";

export default async function VendorCatalogLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const principal = await getVendorSession();
  if (principal && await isDropshippingOnlyVendor(principal.vendorId)) redirect("/vendor/dropshipping");
  return <VendorEntitlementLayout capability="catalogue.read">{children}</VendorEntitlementLayout>;
}
