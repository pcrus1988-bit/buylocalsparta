import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorReturnsClient } from "../../../components/VendorReturnsClient";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorReturnsWorkspace } from "../../../lib/vendor-backoffice-service";

export const metadata: Metadata = { title: "Vendor Returns", robots: { index: false, follow: false } };

export default async function VendorReturnsPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">After-sales</div><h1>Returns</h1><p className="lead">Δες μόνο τα repair/replacement tasks που έχουν ανατεθεί στο κατάστημά σου και συνέχισε από το τρέχον operational στάδιο.</p></div>
    </section>
    <VendorReturnsClient initial={await vendorReturnsWorkspace(principal)} />
  </main>;
}
