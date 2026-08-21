import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorLifecycle } from "../../components/VendorLifecycle";
import { VendorWorkspaceHeader } from "../../components/VendorWorkspaceHeader";
import { WorkspaceHowItWorks, WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../components/WorkspacePagePrimitives";
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
      note: "Άνοιξε τις παραγγελίες και συνέχισε από το επισημασμένο επόμενο βήμα.",
      href: "/vendor/orders",
      urgent: true
    } : null,
    orderNotifications.metrics.breached > 0 ? {
      title: `${orderNotifications.metrics.breached} προθεσμίες έχουν λήξει`,
      note: "Δες πρώτα τις εκπρόθεσμες παραγγελίες και ενημέρωσε την πραγματική τους κατάσταση.",
      href: "/vendor/notifications",
      urgent: true
    } : null,
    catalog.catalogMetrics.lowStockProducts > 0 ? {
      title: `${catalog.catalogMetrics.lowStockProducts} προϊόντα έχουν χαμηλό απόθεμα`,
      note: "Έλεγξε το φυσικό απόθεμα και το απόθεμα ασφαλείας πριν εξαντληθούν.",
      href: "/vendor/catalog",
      urgent: false
    } : null,
    catalog.catalogMetrics.hiddenProducts > 0 ? {
      title: `${catalog.catalogMetrics.hiddenProducts} προϊόντα δεν εμφανίζονται δημόσια`,
      note: "Έλεγξε αν είναι σκόπιμα κρυφά ή αν περιμένουν διόρθωση / έγκριση.",
      href: "/vendor/catalog",
      urgent: false
    } : null
  ].filter((item): item is { title: string; note: string; href: string; urgent: boolean } => Boolean(item));
  const showOnboarding = principal.roles.includes("vendor_owner") && dashboard.metrics.activeProducts === 0;

  return <main className="vendor-app">
    <VendorWorkspaceHeader />

    <section className="shell vendor-hero dashboard-hero-refined">
      <div>
        <div className="eyebrow">Αρχική · σήμερα</div>
        <h1>{dashboard.vendor.name}</h1>
        <p className="lead">Ό,τι χρειάζεται το κατάστημά σου τώρα — με τις επείγουσες εργασίες πρώτες και τις υπόλοιπες λειτουργίες οργανωμένες ανά σκοπό.</p>
      </div>
      <aside className="dashboard-health-card">
        <span>Τοπικός σύμβουλος</span>
        <strong>{dashboard.vendor.adviser}</strong>
        <p>Ο χώρος συνεργάτη εμφανίζει μόνο στοιχεία και εργασίες του δικού σου καταστήματος.</p>
      </aside>
    </section>

    {showOnboarding && <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Πρώτη εγκατάσταση" title="Στήσε το κατάστημά σου βήμα-βήμα" note="Η ενότητα θα φύγει από την αρχική όταν ενεργοποιηθεί το πρώτο προϊόν σου." />
      <VendorLifecycle steps={[
        { label: "Δημόσιο προφίλ", tone: "attention", detail: "Λογότυπο και φωτογραφία καταστήματος" },
        { label: "Πρώτο προϊόν", tone: "future", detail: "Κατηγορία, τιμή και απόθεμα" },
        { label: "Φωτογραφίες / έγγραφα", tone: "future", detail: "Όπου χρειάζονται για το προϊόν" },
        { label: "Έτοιμο για λειτουργία", tone: "future", detail: "Παραγγελίες και Daily" }
      ]} ariaLabel="Πρώτη εγκατάσταση καταστήματος" />
      <WorkspaceHowItWorks>
        <p>Δεν χρειάζεται να ολοκληρώσεις όλες τις ρυθμίσεις μαζί. Ξεκίνα με το δημόσιο προφίλ και ένα πραγματικό προϊόν με σωστή τιμή και απόθεμα.</p>
        <p>Όταν ενεργοποιηθεί το πρώτο προϊόν, η αρχική αλλάζει από onboarding σε καθημερινό κέντρο εργασιών.</p>
      </WorkspaceHowItWorks>
      <div className="workspace-action-buttons" style={{ marginTop: 14 }}><Link className="button" href="/vendor/storefront">1. Δημόσιο προφίλ</Link><Link className="button button-secondary" href="/vendor/catalog">2. Προσθήκη προϊόντος</Link></div>
    </section>}

    <WorkspaceMetricStrip items={[
      { label: "Χρειάζονται ενέργεια", value: orderNotifications.metrics.requiringAction, tone: orderNotifications.metrics.requiringAction ? "attention" : "default" },
      { label: "Ενεργά προϊόντα", value: dashboard.metrics.activeProducts },
      { label: "Διαθέσιμα τεμάχια", value: dashboard.metrics.availableUnits },
      { label: "Αγορές · 30 ημέρες", value: performance.purchases },
      { label: "Πωλήσεις · 30 ημέρες", value: euro(performance.revenueMinor) }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Σήμερα" title="Τι χρειάζεται την προσοχή σου" note="Οι πραγματικές εκκρεμότητες εμφανίζονται πρώτες. Αν δεν υπάρχει κάρτα, δεν χρειάζεται να ψάχνεις για κρυφή εργασία." />
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
        { kicker: "Καθημερινά", label: "Παραγγελίες", description: "Αποδοχή, προετοιμασία, αποστολές, παραλαβές και επιστροφές.", href: "/vendor/orders", value: dashboard.metrics.ordersRequiringAction },
        { kicker: "Κατάλογος", label: "Προϊόντα", description: "Κατάλογος, απόθεμα, εμφάνιση και έγγραφα προϊόντων.", href: "/vendor/catalog", value: dashboard.metrics.activeProducts },
        { kicker: "Εξυπηρέτηση", label: "Πελάτες", description: "Μηνύματα, ραντεβού, Ask Local και ιδιωτικές προσφορές.", href: "/vendor/advice" },
        { kicker: "Προφίλ", label: "Κατάστημα", description: "Η δημόσια εικόνα και οι φωτογραφίες του καταστήματός σου.", href: "/vendor/storefront" },
        { kicker: "Πληρωμές", label: "Οικονομικά", description: "Παραστατικά, πληρωμές και εμπορική συμφωνία.", href: "/vendor/finance" },
        { kicker: "Απόδοση", label: "Στατιστικά", description: "Πωλήσεις, μετατροπή, απόδοση προϊόντων και αναφορές.", href: "/vendor/analytics" }
      ]}
    />

    <section className="shell vendor-section">
      <div className="finance-panel dashboard-finance-panel">
        <div><div className="eyebrow">Οικονομικά</div><h2>{dashboard.finance.supplierValueSnapshot}</h2><p>Τρέχουσα οικονομική εικόνα του καταστήματός σου.</p></div>
        <div className="fairness-note"><strong>Πληρωμές & παραστατικά</strong><p>{dashboard.finance.note}</p><Link className="button button-secondary" href="/vendor/finance">Άνοιγμα οικονομικών</Link></div>
      </div>
    </section>
  </main>;
}
