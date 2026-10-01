import { assertVendorCapability } from "@buy-local-sparta/core";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorFinanceClient } from "../../../components/VendorFinanceClient";
import { VendorFiscalSettingsClient } from "../../../components/VendorFiscalSettingsClient";
import { VendorLifecycle } from "../../../components/VendorLifecycle";
import { VendorPlatformInvoicesPanel } from "../../../components/VendorPlatformInvoicesPanel";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceHowItWorks, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getVendorSession, vendorOperatingContextForPrincipal } from "../../../lib/vendor-session";
import { isExpansionHubScope } from "../../../lib/vendor-hub-display";
import { vendorFiscalSettings } from "../../../lib/vendor-fiscal-settings";
import { vendorFinanceWorkspace } from "../../../lib/vendor-backoffice-service";
import { vendorPlatformInvoices } from "../../../lib/vendor-platform-invoices";

export const metadata: Metadata = { title: "Οικονομικά & πληρωμές", robots: { index: false, follow: false } };

export default async function VendorFinancePage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const operatingContext = await vendorOperatingContextForPrincipal(principal);
  assertVendorCapability(operatingContext, "finance.read");
  const hubFiscalEnabled = isExpansionHubScope(operatingContext) && principal.roles.includes("vendor_owner");
  const [finance, platformInvoices, fiscalSettings] = await Promise.all([
    vendorFinanceWorkspace(principal),
    vendorPlatformInvoices(principal),
    hubFiscalEnabled ? vendorFiscalSettings(principal) : Promise.resolve(undefined)
  ]);
  const needsInvoice = finance.procurements.some((item) => ["accrued", "matched", "disputed"].includes(item.status) && !item.invoiceNumber);
  const inReview = finance.procurements.some((item) => ["matched", "disputed"].includes(item.status));
  const payable = finance.procurements.some((item) => item.status === "payable");
  const paid = finance.settlements.some((item) => ["paid", "settled", "closed"].includes(item.status));
  const labels = ["Παραγγελία ολοκληρώθηκε", "Παραστατικό", "Έλεγχος", "Προγραμματισμός πληρωμής", "Πληρωμή"];
  const current = needsInvoice ? 1 : inReview ? 2 : payable ? 3 : paid ? labels.length : 0;
  const steps = labels.map((label, index) => ({ label, tone: index < current ? "done" as const : index === current ? (current === 0 ? "current" as const : "attention" as const) : "future" as const }));

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Οικονομική διαχείριση</div>
        <h1>Πληρωμές & παραστατικά</h1>
        <p className="lead">Δες τι χρειάζεται από εσένα, τι ελέγχεται από το ΚΟΝΤΑ ΜΟΥ και ποια ποσά έχουν ήδη προχωρήσει προς πληρωμή.</p>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Πορεία πληρωμής" title="Από την πώληση έως την κατάθεση" note="Η οθόνη ξεχωρίζει τα βήματα που απαιτούν δική σου ενέργεια από όσα διαχειρίζεται το ΚΟΝΤΑ ΜΟΥ." />
      <VendorLifecycle steps={steps} ariaLabel="Πορεία πληρωμής vendor" />
      <WorkspaceHowItWorks>
        <p><strong>1. Ολοκλήρωση παραγγελίας:</strong> δημιουργείται η οικονομική εγγραφή για το κατάστημά σου.</p>
        <p><strong>2. Παραστατικό:</strong> όταν ζητείται, καταχωρείς τον αριθμό και το μικτό ποσό του παραστατικού.</p>
        <p><strong>3. Έλεγχος:</strong> το ΚΟΝΤΑ ΜΟΥ αντιστοιχίζει το παραστατικό και ελέγχει τις χρεώσεις.</p>
        <p><strong>4–5. Πληρωμή:</strong> όταν το ποσό γίνει πληρωτέο, εντάσσεται σε settlement και εμφανίζεται η ολοκλήρωση πληρωμής.</p>
      </WorkspaceHowItWorks>
    </section>

    {fiscalSettings && <VendorFiscalSettingsClient initial={fiscalSettings} />}
    <VendorFinanceClient initial={finance} />
    <VendorPlatformInvoicesPanel invoices={platformInvoices} />
  </main>;
}
