import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorDashboardClient } from "../../components/VendorDashboardClient";
import { VendorWorkspaceHeader } from "../../components/VendorWorkspaceHeader";
import { getVendorSession } from "../../lib/vendor-session";
import { vendorDashboard } from "../../lib/vendor-runtime";

export const metadata: Metadata = { title: "Vendor Backoffice", robots: { index: false, follow: false } };

export default async function VendorBackofficePage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const dashboard = await vendorDashboard(principal);
  return <main className="vendor-app"><VendorWorkspaceHeader /><section className="shell vendor-hero"><div><div className="eyebrow">Vendor workspace · isolated scope</div><h1>{dashboard.vendor.name}</h1><p className="lead">Καθαρός χώρος για τις δικές σου αναθέσεις, το δικό σου stock και τις operational ενέργειες που επιτρέπονται στον ρόλο σου.</p></div><aside><span>Local adviser</span><strong>{dashboard.vendor.adviser}</strong><p>Οι competitor offers, supplier costs άλλων καταστημάτων και customer-level marketplace analytics δεν εκτίθενται εδώ.</p></aside></section><VendorDashboardClient initial={dashboard} /></main>;
}
