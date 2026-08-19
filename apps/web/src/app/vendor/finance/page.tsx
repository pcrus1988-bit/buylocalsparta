import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorFinanceClient } from "../../../components/VendorFinanceClient";
import { VendorPlatformInvoicesPanel } from "../../../components/VendorPlatformInvoicesPanel";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorFinanceWorkspace } from "../../../lib/vendor-backoffice-service";
import { vendorPlatformInvoices } from "../../../lib/vendor-platform-invoices";

export const metadata: Metadata = { title: "Οικονομικά & πληρωμές", robots: { index: false, follow: false } };

export default async function VendorFinancePage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const [finance,platformInvoices]=await Promise.all([vendorFinanceWorkspace(principal),vendorPlatformInvoices(principal)]);
  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Οικονομική διαχείριση</div>
        <h1>Οικονομικά & πληρωμές</h1>
        <p className="lead">Παρακολούθησε τι οφείλεται στο κατάστημά σου, ποια παραστατικά χρειάζονται ενέργεια, ποια ποσά έχουν προχωρήσει σε settlement και τα τιμολόγια commission/fees που έχει εκδώσει το KONTA MOY προς την επιχείρησή σου.</p>
      </div>
    </section>
    <VendorFinanceClient initial={finance} />
    <VendorPlatformInvoicesPanel invoices={platformInvoices}/>
  </main>;
}
