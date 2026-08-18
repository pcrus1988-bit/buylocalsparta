import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorDashboardClient } from "../../components/VendorDashboardClient";
import { VendorCatalogDashboardOverview } from "../../components/VendorCatalogDashboardOverview";
import { VendorWorkspaceHeader } from "../../components/VendorWorkspaceHeader";
import { getVendorSession } from "../../lib/vendor-session";
import { vendorDashboard } from "../../lib/vendor-runtime";
import { vendorCatalogControlWorkspace } from "../../lib/vendor-catalog-control-service";

export const metadata: Metadata = { title: "Vendor Backoffice", robots: { index: false, follow: false } };

export default async function VendorBackofficePage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const [dashboard, catalog] = await Promise.all([
    vendorDashboard(principal),
    vendorCatalogControlWorkspace(principal)
  ]);

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero dashboard-hero-refined">
      <div>
        <div className="eyebrow">Vendor workspace</div>
        <h1>{dashboard.vendor.name}</h1>
        <p className="lead">Παραγγελίες, προϊόντα, ορατότητα, απόθεμα και οικονομικά — με άμεσο έλεγχο του δικού σου καταστήματος.</p>
      </div>
      <aside className="dashboard-health-card">
        <span>Τοπικός σύμβουλος</span>
        <strong>{dashboard.vendor.adviser}</strong>
        <p>Το workspace παραμένει αποκλειστικά στο scope του καταστήματός σου.</p>
      </aside>
    </section>
    <VendorCatalogDashboardOverview metrics={catalog.catalogMetrics} products={catalog.catalogProducts} categories={catalog.categories} />
    <VendorDashboardClient initial={dashboard} />
  </main>;
}
