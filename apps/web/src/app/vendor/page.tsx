import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorDashboardClient } from "../../components/VendorDashboardClient";
import { VendorCatalogDashboardOverview } from "../../components/VendorCatalogDashboardOverview";
import { VendorWorkspaceHeader } from "../../components/VendorWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../components/WorkspacePagePrimitives";
import { getVendorSession } from "../../lib/vendor-session";
import { vendorDashboard } from "../../lib/vendor-runtime";
import { vendorCatalogControlWorkspace } from "../../lib/vendor-catalog-control-service";
import { vendorProductAnalytics } from "../../lib/vendor-product-analytics";
import { vendorOrderNotificationWorkspace } from "../../lib/order-sla";

export const metadata: Metadata = { title: "Vendor Backoffice", robots: { index: false, follow: false } };

function euro(minor: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

export default async function VendorBackofficePage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const [dashboard, catalog, analytics, orderNotifications] = await Promise.all([
    vendorDashboard(principal),
    vendorCatalogControlWorkspace(principal),
    vendorProductAnalytics(principal.vendorId ?? "", { periodDays: 30 }),
    vendorOrderNotificationWorkspace(principal)
  ]);
  const performance = analytics.totals;

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

    <section className="shell vendor-section" id="order-notifications">
      <WorkspaceSectionHeading eyebrow="Orders · SLA" title="Ειδοποιήσεις & προθεσμίες" note="Η προθεσμία προκύπτει από την ενεργή συμφωνία συνεργασίας και σταματά μόλις αλλάξει το fulfilment status." />
      <WorkspaceMetricStrip items={[
        { label: "Χρειάζονται ενέργεια", value: orderNotifications.metrics.requiringAction, tone: orderNotifications.metrics.requiringAction ? "attention" : "default" },
        { label: "Breached", value: orderNotifications.metrics.breached, tone: orderNotifications.metrics.breached ? "attention" : "default" },
        { label: "Escalated", value: orderNotifications.metrics.escalated, tone: orderNotifications.metrics.escalated ? "attention" : "default" },
        { label: "Νέα alerts", value: orderNotifications.metrics.unread }
      ]} />
      <div className="workspace-queue-card" style={{ marginTop: 14 }}>
        <div className="workspace-queue-head">
          <div><strong>{orderNotifications.notifications[0]?.title ?? "Δεν υπάρχει νέα ειδοποίηση"}</strong><small>{orderNotifications.notifications[0]?.body ?? "Οι νέες παραγγελίες και οι SLA υπενθυμίσεις θα εμφανίζονται εδώ."}</small></div>
          <Link className="button" href="/vendor/notifications">Κέντρο ειδοποιήσεων</Link>
        </div>
      </div>
    </section>

    <section className="shell vendor-section" id="performance-overview">
      <WorkspaceSectionHeading eyebrow="Performance · 30 days" title="Από ενδιαφέρον σε αγορά" note="Ζωντανά supplier-scoped στοιχεία από Fair Vendor Exposure και το commerce funnel." />
      <WorkspaceMetricStrip items={[
        { label: "Fair impressions", value: performance.impressions },
        { label: "Product views", value: performance.pageViews },
        { label: "Cart adds", value: performance.addToCarts },
        { label: "Checkout starts", value: performance.checkoutStarts },
        { label: "Sales", value: performance.purchases },
        { label: "Retail sales", value: euro(performance.revenueMinor) }
      ]} />
      <div className="workspace-queue-card" style={{ marginTop: 14 }}>
        <div className="workspace-queue-head"><div><strong>Αναλυτικά στατιστικά</strong><small>Όλο το κατάστημα, ανά κατηγορία, ανά προϊόν και με χρονικά φίλτρα.</small></div><Link className="button" href="/vendor/analytics">Analytics & φίλτρα</Link></div>
      </div>
    </section>

    <VendorDashboardClient initial={dashboard} />
  </main>;
}
