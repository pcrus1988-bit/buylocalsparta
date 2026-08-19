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
  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Έλεγχος προϊόντων</div>
        <h1>Φωτογραφίες & έγγραφα προϊόντων</h1>
        <p className="lead">Εδώ στέλνεις φωτογραφίες, βίντεο και — όπου χρειάζεται — πιστοποιητικά ή άλλα έγγραφα για τα προϊόντα σου. Η πλατφόρμα τα ελέγχει πριν χρησιμοποιηθούν δημόσια. Δεν χρειάζεται να γνωρίζεις τεχνικούς όρους: η σελίδα σου δείχνει τι περιμένει έλεγχο, τι εγκρίθηκε και τι χρειάζεται διόρθωση.</p>
      </div>
    </section>
    <VendorTrustClient initial={await vendorTrustWorkspace(principal)} />
  </main>;
}
