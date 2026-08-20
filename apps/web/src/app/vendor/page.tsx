import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorWorkspaceHeader } from "../../components/VendorWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../components/WorkspacePagePrimitives";
import { WorkspaceQuickLinks } from "../../components/WorkspaceQuickLinks";
import { getVendorSession } from "../../lib/vendor-session";
import { vendorDashboard } from "../../lib/vendor-runtime";
import { vendorCatalogControlWorkspace } from "../../lib/vendor-catalog-control-service";
import { vendorProductAnalytics } from "../../lib/vendor-product-analytics";
import { vendorOrderNotificationWorkspace } from "../../lib/order-sla";

export const metadata: Metadata = { title: "Χώρος συνεργάτη", robots: { index: false, follow: false } };

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
  const attention = [
    orderNotifications.metrics.requiringAction > 0 ? {
      title: `${orderNotifications.metrics.requiringAction} παραγγελίες χρειάζονται ενέργεια`,
      note: "Άνοιξε τις παραγγελίες και συνέχισε από το επόμενο επιτρεπόμενο στάδιο.",
      href: "/vendor/orders",
      urgent: true
    } : null,
    orderNotifications.metrics.breached > 0 ? {
      title: `${orderNotifications.metrics.breached} προθεσμίες έχουν λήξει`,
      note: "Δες τα ενεργά SLA cases και ολοκλήρωσε πρώτα τα εκπρόθεσμα.",
      href: "/vendor/notifications",
      urgent: true
    } : null,
    catalog.catalogMetrics.lowStockProducts > 0 ? {
      title: `${catalog.catalogMetrics.lowStockProducts} προϊόντα έχουν χαμηλό απόθεμα`,
      note: "Έλεγξε το πραγματικό stock και το απόθεμα ασφαλείας πριν εξαντληθούν.",
      href: "/vendor/catalog",
      urgent: false
    } : null,
    catalog.catalogMetrics.hiddenProducts > 0 ? {
      title: `${catalog.catalogMetrics.hiddenProducts} προϊόντα δεν είναι δημόσια ορατά`,
      note: "Έλεγξε αν είναι σκόπιμα κρυφά ή χρειάζονται διόρθωση.",
      href: "/vendor/catalog",
      urgent: false
    } : null
  ].filter((item): item is { title: string; note: string; href: string; urgent: boolean } => Boolean(item));

  return <main className="vendor-app">
    <VendorWorkspaceHeader />

    <section className="shell vendor-hero dashboard-hero-refined">
      <div>
        <div className="eyebrow">Αρχική · σήμερα</div>
        <h1>{dashboard.vendor.name}</h1>
        <p className="lead">Ό,τι χρειάζεται το κατάστημά σου τώρα — χωρίς να ψάχνεις ανάμεσα σε τεχνικά modules.</p>
      </div>
      <aside className="dashboard-health-card">
        <span>Τοπικός σύμβουλος</span>
        <strong>{dashboard.vendor.adviser}</strong>
        <p>Όλες οι ενέργειες παραμένουν αποκλειστικά στο scope του καταστήματός σου.</p>
      </aside>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Χρειάζονται ενέργεια", value: orderNotifications.metrics.requiringAction, tone: orderNotifications.metrics.requiringAction ? "attention" : "default" },
      { label: "Ενεργά προϊόντα", value: dashboard.metrics.activeProducts },
      { label: "Διαθέσιμες μονάδες", value: dashboard.metrics.availableUnits },
      { label: "Πωλήσεις · 30 ημέρες", value: performance.purchases },
      { label: "Τζίρος · 30 ημέρες", value: euro(performance.revenueMinor) }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Action centre" title="Τι χρειάζεται την προσοχή σου" note="Πρώτα οι πραγματικές εκκρεμότητες. Οι διαχειριστικές λειτουργίες βρίσκονται στα αντίστοιχα business domains." />
      {attention.length ? <div className="vendor-command-list">
        {attention.map((item) => <article className={`vendor-command-card${item.urgent ? " is-urgent" : ""}`} key={item.title}>
          <div><strong>{item.title}</strong><small>{item.note}</small></div>
          <Link className={item.urgent ? "button" : "button button-secondary"} href={item.href}>Άνοιγμα</Link>
        </article>)}
      </div> : <div className="workspace-empty-state"><strong>Δεν υπάρχει επείγουσα εκκρεμότητα αυτή τη στιγμή.</strong><p>Το κατάστημα είναι λειτουργικά ενήμερο.</p></div>}
    </section>

    <WorkspaceQuickLinks
      density="compact"
      eyebrow="Χώροι εργασίας"
      title="Διαχείριση καταστήματος"
      links={[
        { kicker: "Orders", label: "Παραγγελίες", description: "Αποδοχή, προετοιμασία, αποστολές, παραλαβές και επιστροφές.", href: "/vendor/orders", value: dashboard.metrics.ordersRequiringAction },
        { kicker: "Products", label: "Προϊόντα", description: "Κατάλογος, απόθεμα, ορατότητα και έγγραφα.", href: "/vendor/catalog", value: dashboard.metrics.activeProducts },
        { kicker: "Customers", label: "Πελάτες", description: "Μηνύματα, ραντεβού, Ask Local και προσφορές.", href: "/vendor/advice" },
        { kicker: "Store", label: "Κατάστημα", description: "Η δημόσια εικόνα και το προφίλ του καταστήματός σου.", href: "/vendor/storefront" },
        { kicker: "Money", label: "Οικονομικά", description: "Παραστατικά, πληρωμές και εμπορική συμφωνία.", href: "/vendor/finance" },
        { kicker: "Insights", label: "Στατιστικά", description: "Απόδοση, πωλήσεις και αναφορές.", href: "/vendor/analytics" }
      ]}
    />

    <section className="shell vendor-section">
      <div className="finance-panel dashboard-finance-panel">
        <div><div className="eyebrow">Οικονομικά</div><h2>{dashboard.finance.supplierValueSnapshot}</h2><p>Λειτουργικό snapshot αξίας προμηθευτή.</p></div>
        <div className="fairness-note"><strong>Πληρωμές & παραστατικά</strong><p>{dashboard.finance.note}</p><Link className="button button-secondary" href="/vendor/finance">Άνοιγμα οικονομικών</Link></div>
      </div>
    </section>
  </main>;
}
