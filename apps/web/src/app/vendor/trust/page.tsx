import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorTrustClient } from "../../../components/VendorTrustClient";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorTrustWorkspace } from "../../../lib/vendor-backoffice-service";

export const metadata: Metadata = { title: "Vendor Media & Compliance", robots: { index: false, follow: false } };

export default async function VendorTrustPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Αξιοπιστία</div><h1>Media & compliance</h1><p className="lead">Ανέβασε τεκμήρια και παρακολούθησε scan, rights, moderation και verification χωρίς να δημοσιεύεται τίποτα πριν από έγκριση.</p></div>
    </section>
    <VendorTrustClient initial={await vendorTrustWorkspace(principal)} />
  </main>;
}
