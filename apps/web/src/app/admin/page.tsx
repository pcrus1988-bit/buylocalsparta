import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../components/AdminWorkspaceHeader";
import { WorkspaceQuickLinks } from "../../components/WorkspaceQuickLinks";
import { adminDashboard, hasAdminPermission } from "../../lib/admin-runtime";
import { getAdminSession } from "../../lib/admin-session";

export const metadata: Metadata = { title: "Admin Command Centre", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const dashboard = await adminDashboard(principal);
  const metrics = [
    ["Vendor checks", dashboard.metrics.vendorVerificationQueue],
    ["Catalog review", dashboard.metrics.catalogReviewQueue],
    ["Trust queue", dashboard.metrics.pendingMedia + dashboard.metrics.pendingCompliance],
    ["Payables", dashboard.metrics.payableProcurements],
    ["Fairness", dashboard.metrics.fairnessAppeals],
    ["Orders", dashboard.metrics.orders]
  ] as const;
  const quickLinks = [
    { kicker: "Acquisition", label: "Έρευνα vendors", description: "Υποψήφιοι πριν το onboarding.", href: "/admin/research-vendors" },
    { kicker: "Onboarding", label: "Συνεργάτες", description: "Έλεγχος και ενεργοποίηση.", href: "/admin/vendors", value: dashboard.metrics.vendorVerificationQueue },
    { kicker: "Catalog", label: "Matching", description: "Canonical έλεγχος προϊόντων.", href: "/admin/matching", value: dashboard.metrics.catalogReviewQueue },
    { kicker: "Commerce", label: "Παραγγελίες", description: "Exceptions, returns και refunds.", href: "/admin/orders", value: dashboard.metrics.orders },
    ...(hasAdminPermission(principal, "customer.read") ? [{ kicker: "Customer ops", label: "Πελάτες", description: "Accounts, access, recovery και commerce.", href: "/admin/customers" }] : []),
    { kicker: "Trust", label: "Συμμόρφωση", description: "Media και τεκμήρια ασφάλειας.", href: "/admin/trust", value: dashboard.metrics.pendingMedia + dashboard.metrics.pendingCompliance },
    { kicker: "Finance", label: "Οικονομικά", description: "Payables και settlements.", href: "/admin/finance", value: dashboard.metrics.payableProcurements }
  ];

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={dashboard.csrfToken} />

    <section className="shell vendor-hero dashboard-hero-refined">
      <div>
        <div className="eyebrow">Admin · Platform operations</div>
        <h1>Κέντρο λειτουργίας</h1>
        <p className="lead">Οι ουρές που χρειάζονται απόφαση, σε μία καθαρή εικόνα.</p>
      </div>
      <aside className={dashboard.health.ok ? "dashboard-health-card" : "dashboard-health-card needs-attention"}>
        <span>Readiness</span>
        <strong>{dashboard.health.state}</strong>
        <p>{dashboard.health.ok ? "Οι κρίσιμες εξαρτήσεις είναι έτοιμες." : "Απαιτείται έλεγχος υποδομής."}</p>
      </aside>
    </section>

    <section className="shell">
      <div className="vendor-kpis admin-kpis dashboard-kpis-refined">
        {metrics.map(([label, value]) => <div className={Number(value) > 0 ? "has-work" : undefined} key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
    </section>

    <WorkspaceQuickLinks density="compact" eyebrow="Κύριες ουρές" title="Εκεί που χρειάζεται απόφαση τώρα." links={quickLinks} />

    <section className="shell vendor-section dashboard-insights-section">
      <div className="dashboard-insight-grid">
        <article className="dashboard-insight-card">
          <div className="eyebrow">Marketplace · 30 ημέρες</div>
          <h2>Εμπορική εικόνα</h2>
          <div className="dashboard-stat-grid">
            <div><span>Searches</span><strong>{dashboard.analytics.searches}</strong></div>
            <div><span>Success</span><strong>{Math.round(dashboard.analytics.searchSuccessRate * 100)}%</strong></div>
            <div><span>Orders</span><strong>{dashboard.analytics.orders}</strong></div>
            <div><span>GMV</span><strong>{dashboard.analytics.grossMerchandiseValue}</strong></div>
          </div>
        </article>
        <article className="dashboard-insight-card">
          <div className="eyebrow">Security · 24 ώρες</div>
          <h2>Σήματα ασφάλειας</h2>
          <div className="dashboard-security-number">{dashboard.security.total}</div>
          <p>Privacy-minimised events · χωρίς raw credentials ή στοιχεία επικοινωνίας.</p>
        </article>
      </div>
    </section>
  </main>;
}
