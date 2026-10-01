import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorOrdersClient } from "../../../components/VendorOrdersClient";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorDashboard } from "../../../lib/vendor-runtime";

export const metadata: Metadata = { title: "Παραγγελίες", robots: { index: false, follow: false } };

export default async function VendorOrdersPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Παραγγελίες</div>
        <h1>Οι παραγγελίες του καταστήματός σου</h1>
        <p className="lead">Δες τι χρειάζεται να κάνεις σε κάθε παραγγελία και προχώρησέ την μόνο όταν το αντίστοιχο βήμα έχει πραγματικά ολοκληρωθεί. Οι προθεσμίες, αποστολές, παραλαβές και επιστροφές βρίσκονται ακριβώς από πάνω.</p>
      </div>
    </section>
    <VendorOrdersClient initial={await vendorDashboard(principal)} />
  </main>;
}
