import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../components/WorkspacePagePrimitives";
import { adminAskLocalDashboard } from "../../lib/admin-ask-local";
import { adminDashboard, hasAdminPermission } from "../../lib/admin-runtime";
import { getAdminSession } from "../../lib/admin-session";

export const metadata: Metadata = { title: "Admin Command Centre", robots: { index: false, follow: false } };

type AttentionItem = Readonly<{ label: string; detail: string; href: string; value: number; severity: "critical" | "attention" | "normal" }>;

export default async function AdminPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const dashboard = await adminDashboard(principal);
  const canSeeAnalytics = hasAdminPermission(principal, "analytics.market.read");
  const canSeeSecurity = hasAdminPermission(principal, "security.read");
  const canSeeAskLocal = hasAdminPermission(principal, "customer.read");
  const canQuickAdd = hasAdminPermission(principal, "catalog.write");
  const askLocal = canSeeAskLocal ? await adminAskLocalDashboard(principal) : undefined;

  const attention: AttentionItem[] = [
    ...(hasAdminPermission(principal, "vendor.manage") && dashboard.metrics.vendorVerificationQueue > 0 ? [{ label: "Έλεγχοι συνεργατών", detail: "Αιτήσεις ή verification που χρειάζονται απόφαση.", href: "/admin/partners/pipeline", value: dashboard.metrics.vendorVerificationQueue, severity: "attention" as const }] : []),
    ...(hasAdminPermission(principal, "catalog.read") && dashboard.metrics.catalogReviewQueue > 0 ? [{ label: "Product Matching", detail: "Canonical matches / offers που περιμένουν έλεγχο.", href: "/admin/matching", value: dashboard.metrics.catalogReviewQueue, severity: "attention" as const }] : []),
    ...(hasAdminPermission(principal, "catalog.read") && dashboard.metrics.pendingMedia + dashboard.metrics.pendingCompliance > 0 ? [{ label: "Trust review", detail: "Media ή compliance evidence που περιμένουν review.", href: "/admin/trust", value: dashboard.metrics.pendingMedia + dashboard.metrics.pendingCompliance, severity: "attention" as const }] : []),
    ...(askLocal && askLocal.openCount > 0 ? [{ label: "Ask Local", detail: askLocal.overdueCount > 0 ? `${askLocal.overdueCount} overdue · ${askLocal.adminOwnedCount} Admin-owned` : `${askLocal.adminOwnedCount} Admin-owned · ${askLocal.vendorOwnedCount} vendor-owned`, href: "/admin/ask-local", value: askLocal.openCount, severity: askLocal.overdueCount > 0 ? "critical" as const : "attention" as const }] : []),
    ...(hasAdminPermission(principal, "finance.read") && dashboard.metrics.payableProcurements > 0 ? [{ label: "Payables / settlements", detail: "Supplier procurements έτοιμα για οικονομική ενέργεια.", href: "/admin/finance", value: dashboard.metrics.payableProcurements, severity: "attention" as const }] : []),
    ...(hasAdminPermission(principal, "fairness.read") && dashboard.metrics.fairnessAppeals > 0 ? [{ label: "Fairness appeals", detail: "Appeals που περιμένουν governance review.", href: "/admin/fairness", value: dashboard.metrics.fairnessAppeals, severity: "attention" as const }] : []),
    ...(!dashboard.health.ok && hasAdminPermission(principal, "admin.audit.read") ? [{ label: "Platform health", detail: "Υπάρχει dependency/readiness issue που χρειάζεται τεχνικό έλεγχο.", href: "/admin/operations", value: 1, severity: "critical" as const }] : [])
  ].sort((a, b) => ({ critical: 0, attention: 1, normal: 2 }[a.severity] - { critical: 0, attention: 1, normal: 2 }[b.severity]));

  const totalAttention = attention.reduce((sum, item) => sum + item.value, 0);
  const metrics = [
    { label: "Χρειάζονται ενέργεια", value: totalAttention, tone: totalAttention ? "attention" as const : "positive" as const, hint: totalAttention ? `${attention.length} ουρές με εκκρεμότητα` : "καμία ενεργή εκκρεμότητα" },
    ...(hasAdminPermission(principal, "fulfilment.read") ? [{ label: "Παραγγελίες", value: dashboard.metrics.orders }] : []),
    ...(hasAdminPermission(principal, "vendor.manage") ? [{ label: "Partner checks", value: dashboard.metrics.vendorVerificationQueue }] : []),
    ...(hasAdminPermission(principal, "catalog.read") ? [{ label: "Catalog decisions", value: dashboard.metrics.catalogReviewQueue }] : [])
  ];

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={dashboard.csrfToken} />
    <section className="shell vendor-hero dashboard-hero-refined admin-page-intro"><div><div className="eyebrow">Admin · Command Centre</div><h1>Επισκόπηση</h1><p className="lead">Πρώτα οι αποφάσεις που χρειάζονται χειρισμό. Η πλοήγηση οργανώνεται πλέον ανά λειτουργικό domain, όχι ανά τεχνικό module.</p></div><aside className={dashboard.health.ok ? "dashboard-health-card" : "dashboard-health-card needs-attention"}><span>Platform</span><strong>{dashboard.health.state}</strong><p>{dashboard.health.ok ? "Οι κρίσιμες εξαρτήσεις είναι έτοιμες." : "Υπάρχει τεχνικό θέμα που χρειάζεται έλεγχο."}</p></aside></section>
    <WorkspaceMetricStrip items={metrics} />
    {canQuickAdd ? <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Γρήγορη ενέργεια" title="Πρόσθεσε ή ενημέρωσε προϊόν τώρα" note="Barcode ή αναζήτηση canonical, επιλογή καταστήματος, τιμή και stock σε μία ροή." />
      <div className="workspace-action-bar"><span>Το Quick Add ελέγχει πρώτα για υπάρχον canonical ώστε να αποφεύγονται τα διπλότυπα.</span><Link className="button button-primary" href="/admin/quickadd">Άνοιγμα Admin Quick Add</Link></div>
    </section> : null}
    <section className="shell vendor-section admin-attention-section"><WorkspaceSectionHeading eyebrow="Action Centre" title="Τι χρειάζεται προσοχή τώρα" note="Οι ουρές εμφανίζονται μόνο όταν υπάρχει πραγματική εκκρεμότητα. Τα τεχνικά IDs παραμένουν δεύτερο επίπεδο πληροφορίας." />{attention.length === 0 ? <div className="workspace-empty-state"><strong>Δεν υπάρχει ενεργή εκκρεμότητα.</strong><span>Οι βασικές operational queues είναι καθαρές.</span></div> : <div className="admin-attention-list">{attention.map((item) => <Link className={`admin-attention-row is-${item.severity}`} href={item.href} key={`${item.href}-${item.label}`}><span className="admin-attention-indicator" aria-hidden="true" /><span className="admin-attention-copy"><strong>{item.label}</strong><small>{item.detail}</small></span><b>{item.value}</b><i aria-hidden="true">→</i></Link>)}</div>}</section>
    {(canSeeAnalytics || canSeeSecurity) && <section className="shell vendor-section dashboard-insights-section"><WorkspaceSectionHeading eyebrow="Snapshot" title="Επιχείρηση & πλατφόρμα" note="Σύντομη εικόνα· τα αναλυτικά εργαλεία βρίσκονται στα domains Αναλύσεις και Πλατφόρμα." /><div className="dashboard-insight-grid">{canSeeAnalytics && <article className="dashboard-insight-card"><div className="eyebrow">Marketplace · 30 ημέρες</div><h2>Εμπορική εικόνα</h2><div className="dashboard-stat-grid"><div><span>Searches</span><strong>{dashboard.analytics.searches}</strong></div><div><span>Success</span><strong>{Math.round(dashboard.analytics.searchSuccessRate * 100)}%</strong></div><div><span>Orders</span><strong>{dashboard.analytics.orders}</strong></div><div><span>GMV</span><strong>{dashboard.analytics.grossMerchandiseValue}</strong></div></div><Link className="text-link" href="/admin/analytics">Άνοιγμα Analytics →</Link></article>}{canSeeSecurity && <article className="dashboard-insight-card"><div className="eyebrow">Security · 24 ώρες</div><h2>Σήματα ασφάλειας</h2><div className="dashboard-security-number">{dashboard.security.total}</div><p>Privacy-minimised events · χωρίς credentials ή raw session data.</p>{hasAdminPermission(principal, "admin.audit.read") && <Link className="text-link" href="/admin/platform">Άνοιγμα Platform →</Link>}</article>}</div></section>}
  </main>;
}
