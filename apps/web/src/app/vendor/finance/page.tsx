import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorFinanceClient } from "../../../components/VendorFinanceClient";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorFinanceWorkspace } from "../../../lib/vendor-backoffice-service";

export const metadata: Metadata = { title: "Οικονομικά & πληρωμές", robots: { index: false, follow: false } };

export default async function VendorFinancePage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Οικονομική διαχείριση</div>
        <h1>Οικονομικά & πληρωμές</h1>
        <p className="lead">Παρακολούθησε τι οφείλεται στο κατάστημά σου, ποια παραστατικά χρειάζονται ενέργεια και ποια ποσά έχουν προχωρήσει σε settlement. Η ιστορική ανάλυση πωλήσεων και προμηθειών βρίσκεται στα Reports.</p>
      </div>
    </section>
    <VendorFinanceClient initial={await vendorFinanceWorkspace(principal)} />
  </main>;
}
