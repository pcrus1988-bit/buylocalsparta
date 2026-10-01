import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorReturnsClient } from "../../../components/VendorReturnsClient";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorReturnsWorkspace } from "../../../lib/vendor-backoffice-service";

export const metadata: Metadata = { title: "Επιστροφές", robots: { index: false, follow: false } };

export default async function VendorReturnsPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Μετά την πώληση</div><h1>Επιστροφές</h1><p className="lead">Δες μόνο τις επισκευές και αντικαταστάσεις που έχουν ανατεθεί στο κατάστημά σου και συνέχισε από το τρέχον στάδιο.</p></div>
    </section>
    <VendorReturnsClient initial={await vendorReturnsWorkspace(principal)} />
  </main>;
}
