import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorTrustClient } from "../../../components/VendorTrustClient";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorTrustWorkspace } from "../../../lib/vendor-backoffice-service";

export const metadata: Metadata = { title: "Φωτογραφίες & έγγραφα προϊόντων", robots: { index: false, follow: false } };

export default async function VendorTrustPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const workspace = await vendorTrustWorkspace(principal);
  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Προϊόντα · υλικό & έγγραφα</div>
        <h1>Φωτογραφίες & έγγραφα προϊόντων</h1>
        <p className="lead">Στείλε το σωστό υλικό για το σωστό προϊόν και παρακολούθησε αν βρίσκεται σε έλεγχο, εγκρίθηκε ή χρειάζεται διόρθωση.</p>
      </div>
    </section>

    <VendorTrustClient initial={workspace} />
  </main>;
}
