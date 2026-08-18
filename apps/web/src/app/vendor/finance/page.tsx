import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorFinanceClient } from "../../../components/VendorFinanceClient";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorFinanceWorkspace } from "../../../lib/vendor-backoffice-service";

export const metadata: Metadata = { title: "Vendor Finance", robots: { index: false, follow: false } };

export default async function VendorFinancePage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Οικονομικά</div><h1>Invoices & settlements</h1><p className="lead">Υπέβαλε invoice όταν υπάρχει accrued procurement και παρακολούθησε την πορεία μέχρι settlement χωρίς να μπερδεύονται operational value και payout.</p></div>
    </section>
    <VendorFinanceClient initial={await vendorFinanceWorkspace(principal)} />
  </main>;
}
