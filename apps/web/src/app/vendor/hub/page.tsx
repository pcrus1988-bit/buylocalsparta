import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getVendorSession, vendorOperatingContextForPrincipal } from "../../../lib/vendor-session";

export const metadata: Metadata = { title: "Ρυθμίσεις HUB", robots: { index: false, follow: false } };

export default async function VendorHubPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const context = await vendorOperatingContextForPrincipal(principal);
  if (context.operatingModel !== "SELF_GOVERNED") redirect("/vendor");
  redirect("/vendor/settings");
}
