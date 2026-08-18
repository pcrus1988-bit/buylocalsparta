import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorDashboardClient } from "../../components/VendorDashboardClient";
import { VendorWorkspaceHeader } from "../../components/VendorWorkspaceHeader";
import { getVendorSession } from "../../lib/vendor-session";
import { vendorDashboard } from "../../lib/vendor-runtime";

export const metadata: Metadata = { title: "Vendor Backoffice", robots: { index: false, follow: false } };

export default async function VendorBackofficePage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const dashboard = await vendorDashboard(principal);

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero dashboard-hero-refined">
      <div>
        <div className="eyebrow">Vendor workspace</div>
        <h1>{dashboard.vendor.name}</h1>
        <p className="lead">Παραγγελίες, stock, πελάτες και οικονομικά — χωρίς θόρυβο.</p>
      </div>
      <aside className="dashboard-health-card">
        <span>Τοπικός σύμβουλος</span>
        <strong>{dashboard.vendor.adviser}</strong>
        <p>Το workspace παραμένει αποκλειστικά στο scope του καταστήματός σου.</p>
      </aside>
    </section>
    <VendorDashboardClient initial={dashboard} />
  </main>;
}
