import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminDashboardCanvas, type AdminDashboardWidget } from "../../components/AdminDashboardCanvas";
import type { AdminNavIconName } from "../../components/AdminNavIcon";
import { AdminWorkspaceHeader } from "../../components/AdminWorkspaceHeader";
import { adminAskLocalDashboard } from "../../lib/admin-ask-local";
import { adminMetricIntegritySnapshot } from "../../lib/admin-metric-integrity";
import { adminNavigationForPrincipal } from "../../lib/admin-navigation";
import { adminDashboard, hasAdminPermission } from "../../lib/admin-runtime";
import { getAdminSession } from "../../lib/admin-session";

export const metadata: Metadata = { title: "Admin Command Centre", robots: { index: false, follow: false } };

type AttentionItem = Readonly<{ label: string; detail: string; href: string; value: number; severity: "critical" | "attention" | "normal" }>;

const ADMIN_DASHBOARD_ICONS = new Set<AdminNavIconName>(["overview", "operations", "partners", "catalog", "customers", "trust", "finance", "content", "analytics", "platform"]);

function dashboardIcon(value?: string): AdminNavIconName {
  if (value && ADMIN_DASHBOARD_ICONS.has(value as AdminNavIconName)) return value as AdminNavIconName;
  return "overview";
}

export default async function AdminPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  const dashboard = await adminDashboard(principal);
  const navigationGroups = adminNavigationForPrincipal(principal);
  const categoryGroups = navigationGroups.filter((group) => group.href && group.href !== "/admin");
  const canFulfil = hasAdminPermission(principal, "fulfilment.read");
  const canManageDelivery = hasAdminPermission(principal, "fulfilment.write");
  const canCustomer = hasAdminPermission(principal, "customer.read");
  const canVendor = hasAdminPermission(principal, "vendor.manage");
  const canCatalog = hasAdminPermission(principal, "catalog.read");
  const canQuickAdd = hasAdminPermission(principal, "catalog.write");
  const canFinance = hasAdminPermission(principal, "finance.read");
  const canFairness = hasAdminPermission(principal, "fairness.read");
  const canAnalytics = hasAdminPermission(principal, "analytics.market.read");
  const canSecurity = hasAdminPermission(principal, "security.read");
  const canContent = hasAdminPermission(principal, "content.read");
  const canAudit = hasAdminPermission(principal, "admin.audit.read");
  const [askLocal, metricIntegrity] = await Promise.all([
    canCustomer ? adminAskLocalDashboard(principal).catch(() => undefined) : undefined,
    canAnalytics ? adminMetricIntegritySnapshot(principal).catch(() => undefined) : undefined
  ]);
  const refundControlCount = metricIntegrity
    ? metricIntegrity.commerce.cancelledCapturedOrders + metricIntegrity.commerce.failedOrManualRefunds
    : 0;

  const attention: AttentionItem[] = [
    ...(canVendor && dashboard.metrics.vendorVerificationQueue > 0 ? [{ label: "Έλεγχοι συνεργατών", detail: "Αιτήσεις ή verification που χρειάζονται απόφαση.", href: "/admin/partners/pipeline", value: dashboard.metrics.vendorVerificationQueue, severity: "attention" as const }] : []),
    ...(canCatalog && dashboard.metrics.catalogReviewQueue > 0 ? [{ label: "Product Matching", detail: "Canonical matches / offers που περιμένουν έλεγχο.", href: "/admin/matching", value: dashboard.metrics.catalogReviewQueue, severity: "attention" as const }] : []),
    ...(canCatalog && dashboard.metrics.pendingMedia + dashboard.metrics.pendingCompliance > 0 ? [{ label: "Trust review", detail: "Media ή compliance evidence που περιμένουν review.", href: "/admin/trust", value: dashboard.metrics.pendingMedia + dashboard.metrics.pendingCompliance, severity: "attention" as const }] : []),
    ...(askLocal && askLocal.openCount > 0 ? [{ label: "Ask Local", detail: askLocal.overdueCount > 0 ? `${askLocal.overdueCount} overdue · ${askLocal.adminOwnedCount} Admin-owned` : `${askLocal.adminOwnedCount} Admin-owned · ${askLocal.vendorOwnedCount} vendor-owned`, href: "/admin/ask-local", value: askLocal.openCount, severity: askLocal.overdueCount > 0 ? "critical" as const : "attention" as const }] : []),
    ...(canFinance && dashboard.metrics.payableProcurements > 0 ? [{ label: "Payables / settlements", detail: "Supplier procurements έτοιμα για οικονομική ενέργεια.", href: "/admin/finance", value: dashboard.metrics.payableProcurements, severity: "attention" as const }] : []),
    ...(canFinance && refundControlCount > 0 ? [{ label: "Captured cancellation / refund", detail: "Υπάρχει cancelled order με captured funds ή refund σε failed/manual-review state.", href: "/admin/finance#finance-diagnostics", value: refundControlCount, severity: "critical" as const }] : []),
    ...(canFairness && dashboard.metrics.fairnessAppeals > 0 ? [{ label: "Fairness appeals", detail: "Appeals που περιμένουν governance review.", href: "/admin/fairness", value: dashboard.metrics.fairnessAppeals, severity: "attention" as const }] : []),
    ...(!dashboard.health.ok && canAudit ? [{ label: "Platform health", detail: "Υπάρχει dependency/readiness issue που χρειάζεται τεχνικό έλεγχο.", href: "/admin/operations", value: 1, severity: "critical" as const }] : [])
  ].sort((a, b) => ({ critical: 0, attention: 1, normal: 2 }[a.severity] - { critical: 0, attention: 1, normal: 2 }[b.severity]));

  const totalAttention = attention.reduce((sum, item) => sum + item.value, 0);
  const categoryWidgets: AdminDashboardWidget[] = categoryGroups.map((group) => ({
    id: `category:${group.href}`,
    kind: "category",
    icon: dashboardIcon(group.icon),
    label: group.label,
    eyebrow: group.section ?? "Admin",
    href: group.href!,
    source: group.label,
    detail: group.description ?? "Άνοιγμα του χώρου εργασίας και των σχετικών εργαλείων.",
    defaultSize: "medium",
    defaultVisible: true
  }));
  const routeWidgets: AdminDashboardWidget[] = navigationGroups.flatMap((group) => group.links
    .filter((link) => link.href !== "/admin" && link.href !== group.href)
    .map((link) => ({
      id: `route:${link.href}`,
      kind: "route" as const,
      icon: dashboardIcon(group.icon),
      label: link.label,
      eyebrow: group.label,
      href: link.href,
      source: group.label,
      detail: group.description ?? `Admin · ${group.label}`,
      defaultSize: "small" as const,
      defaultVisible: false
    })));
  const widgets: AdminDashboardWidget[] = [...categoryWidgets];

  widgets.push({
    id: "attention",
    kind: "metric",
    icon: "operations",
    label: "Χρειάζονται προσοχή",
    eyebrow: "Action Centre",
    href: "/admin/work",
    source: "Operations",
    value: totalAttention,
    detail: totalAttention ? `${attention.length} ενεργές ουρές χρειάζονται απόφαση ή follow-up.` : "Οι βασικές operational queues είναι καθαρές.",
    tone: totalAttention ? (attention.some((item) => item.severity === "critical") ? "critical" : "attention") : "positive",
    defaultSize: "wide",
    defaultVisible: totalAttention > 0,
    items: attention.length ? attention.slice(0, 6).map((item) => ({ label: item.label, detail: item.detail, value: item.value, href: item.href })) : [{ label: "Καμία ενεργή εκκρεμότητα", detail: "Δεν υπάρχει queue που απαιτεί άμεση ενέργεια." }]
  });

  if (canFulfil) widgets.push({
    id: "orders",
    kind: "metric",
    icon: "operations",
    label: "Παραγγελίες · snapshot",
    eyebrow: "Σήμερα",
    href: "/admin/orders",
    source: "Orders",
    value: dashboard.metrics.orders,
    detail: "Όλες οι customer orders, fulfilments, returns και refunds.",
    defaultSize: "small",
    defaultVisible: false
  });

  if (canManageDelivery) widgets.push({
    id: "delivery",
    kind: "metric",
    icon: "operations",
    label: "Delivery · snapshot",
    eyebrow: "Local delivery",
    href: "/admin/delivery",
    source: "Delivery",
    detail: "Dispatch, διαδρομές, οδηγοί, QR custody και live operational oversight.",
    defaultSize: "small",
    defaultVisible: false
  });

  if (canCustomer && askLocal) widgets.push({
    id: "ask-local",
    kind: "metric",
    icon: "customers",
    label: "Ask Local · snapshot",
    eyebrow: "Customer demand",
    href: "/admin/ask-local",
    source: "Ask Local",
    value: askLocal.openCount,
    detail: "Ανοιχτά αιτήματα που περιμένουν vendor ή Admin response.",
    tone: askLocal.overdueCount > 0 ? "attention" : "default",
    defaultSize: "small",
    defaultVisible: false,
    stats: [
      { label: "Overdue", value: askLocal.overdueCount },
      { label: "Admin-owned", value: askLocal.adminOwnedCount },
      { label: "Vendor-owned", value: askLocal.vendorOwnedCount }
    ]
  });

  if (canVendor) widgets.push({
    id: "partners",
    kind: "metric",
    icon: "partners",
    label: "Partner checks",
    eyebrow: "Commercial",
    href: "/admin/partners/pipeline",
    source: "Partners",
    value: dashboard.metrics.vendorVerificationQueue,
    detail: "Applications, verification, onboarding και partner pipeline.",
    tone: dashboard.metrics.vendorVerificationQueue > 0 ? "attention" : "default",
    defaultSize: "small",
    defaultVisible: false
  });

  if (canCatalog) widgets.push({
    id: "catalogue",
    kind: "metric",
    icon: "catalog",
    label: "Catalog decisions",
    eyebrow: "Catalogue",
    href: "/admin/matching",
    source: "Product Matching",
    value: dashboard.metrics.catalogReviewQueue,
    detail: "Canonical matching, catalogue intake και αποφάσεις προϊόντων.",
    tone: dashboard.metrics.catalogReviewQueue > 0 ? "attention" : "default",
    defaultSize: "medium",
    defaultVisible: false,
    stats: [
      { label: "Matching queue", value: dashboard.metrics.catalogReviewQueue },
      { label: "Media pending", value: dashboard.metrics.pendingMedia },
      { label: "Compliance", value: dashboard.metrics.pendingCompliance }
    ]
  });

  if (canAnalytics) widgets.push({
    id: "analytics",
    kind: "metric",
    icon: "analytics",
    label: "Εμπορική εικόνα",
    eyebrow: "Marketplace · 30 ημέρες",
    href: "/admin/analytics",
    source: metricIntegrity ? "Transactional ledger + governed analytics" : "Analytics",
    value: metricIntegrity?.commerce.validPaidOrders ?? dashboard.analytics.orders,
    detail: metricIntegrity ? "Orders/GMV προέρχονται από το transactional ledger· search metrics από το demand analytics stream." : "Συνοπτική εικόνα ζήτησης και εμπορικής απόδοσης.",
    defaultSize: "medium",
    defaultVisible: false,
    stats: [
      { label: "Searches", value: dashboard.analytics.searches },
      { label: "Search success", value: `${Math.round(dashboard.analytics.searchSuccessRate * 100)}%` },
      { label: "Valid paid orders", value: metricIntegrity?.commerce.validPaidOrders ?? dashboard.analytics.orders },
      { label: "Merchandise GMV", value: metricIntegrity?.commerce.merchandiseGmv ?? dashboard.analytics.grossMerchandiseValue }
    ]
  });

  if (canCustomer) widgets.push({
    id: "customers",
    kind: "metric",
    icon: "customers",
    label: "Customer support snapshot",
    eyebrow: "Customer care",
    href: "/admin/customers",
    source: "Customers",
    detail: "Customer 360, support queue, λογαριασμοί και follow-up.",
    defaultSize: "medium",
    defaultVisible: false,
    items: [
      { label: "Customer directory", href: "/admin/customers" },
      { label: "Support queue", href: "/admin/customers/support" },
      { label: "Ask Local", href: "/admin/ask-local", value: askLocal?.openCount ?? 0 }
    ]
  });

  if (canFinance) widgets.push({
    id: "finance",
    kind: "metric",
    icon: "finance",
    label: "Payables & settlements",
    eyebrow: "Finance & Tax",
    href: "/admin/finance",
    source: "Finance",
    value: dashboard.metrics.payableProcurements,
    detail: "Settlements, vendor billing, συμφωνίες και φορολογική λειτουργία.",
    tone: dashboard.metrics.payableProcurements > 0 ? "attention" : "default",
    defaultSize: "medium",
    defaultVisible: false,
    items: [
      { label: "Settlements", href: "/admin/finance", value: dashboard.metrics.payableProcurements },
      { label: "Vendor billing", href: "/admin/finance/vendor-billing" },
      { label: "Tax & myDATA", href: "/admin/tax" }
    ]
  });

  if (canCatalog) widgets.push({
    id: "trust",
    kind: "metric",
    icon: "trust",
    label: "Trust review queue",
    eyebrow: "Governance",
    href: "/admin/trust",
    source: "Trust",
    value: dashboard.metrics.pendingMedia + dashboard.metrics.pendingCompliance,
    detail: "Review queue, product safety και compliance evidence.",
    tone: dashboard.metrics.pendingMedia + dashboard.metrics.pendingCompliance > 0 ? "attention" : "default",
    defaultSize: "medium",
    defaultVisible: false,
    stats: [
      { label: "Media", value: dashboard.metrics.pendingMedia },
      { label: "Compliance", value: dashboard.metrics.pendingCompliance }
    ]
  });

  if (canFairness) widgets.push({
    id: "fairness",
    kind: "metric",
    icon: "trust",
    label: "Fairness appeals",
    eyebrow: "Governance",
    href: "/admin/fairness",
    source: "Fairness",
    value: dashboard.metrics.fairnessAppeals,
    detail: "Assignment fairness, appeals και governance review.",
    tone: dashboard.metrics.fairnessAppeals > 0 ? "attention" : "default",
    defaultSize: "small",
    defaultVisible: false
  });

  if (canContent) widgets.push({
    id: "content",
    kind: "metric",
    icon: "content",
    label: "Content & SEO shortcuts",
    eyebrow: "Growth",
    href: "/admin/content",
    source: "Content",
    detail: "CMS, homepage merchandising, email templates και SEO control centre.",
    defaultSize: "medium",
    defaultVisible: false,
    items: [
      { label: "Content", href: "/admin/content" },
      { label: "Homepage", href: "/admin/hero" },
      { label: "SEO", href: "/admin/seo" },
      { label: "SEO issues", href: "/admin/seo/issues" }
    ]
  });

  if (canQuickAdd) widgets.push({
    id: "quick-add",
    kind: "metric",
    icon: "catalog",
    label: "Quick Add",
    eyebrow: "Quick action",
    href: "/admin/quickadd",
    source: "Catalogue",
    detail: "Barcode ή canonical search, vendor, τιμή και stock σε μία γρήγορη ροή.",
    defaultSize: "small",
    defaultVisible: false
  });

  if (canAudit) widgets.push({
    id: "platform",
    kind: "metric",
    icon: "platform",
    label: "Platform Health",
    eyebrow: "System",
    href: "/admin/operations",
    source: "Mission Control",
    value: dashboard.health.state,
    detail: dashboard.health.ok ? "Οι κρίσιμες εξαρτήσεις είναι έτοιμες." : "Υπάρχει τεχνικό θέμα που χρειάζεται έλεγχο.",
    tone: dashboard.health.ok ? "positive" : "critical",
    defaultSize: "small",
    defaultVisible: !dashboard.health.ok
  });

  if (canSecurity) widgets.push({
    id: "security",
    kind: "metric",
    icon: "platform",
    label: "Σήματα ασφάλειας",
    eyebrow: "Security · 24 ώρες",
    href: "/admin/platform",
    source: "Platform",
    value: dashboard.security.total,
    detail: "Privacy-minimised security events χωρίς credentials ή raw session data.",
    tone: dashboard.security.total > 0 ? "attention" : "default",
    defaultSize: "small",
    defaultVisible: false
  });

  const representedRoutes = new Set(widgets.map((widget) => widget.href));
  for (const routeWidget of routeWidgets) {
    if (!representedRoutes.has(routeWidget.href)) {
      widgets.push(routeWidget);
      representedRoutes.add(routeWidget.href);
    }
  }

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={dashboard.csrfToken} />
    <section className="shell admin-dashboard-intro">
      <div><div className="eyebrow">Admin · Control Centre</div><h1>Σήμερα</h1><p>Οι βασικές κατηγορίες είναι η καθαρή αρχική προβολή. Από την Προσαρμογή μπορείς να προσθέσεις οποιαδήποτε Admin υποσελίδα ή live widget επιτρέπουν τα δικαιώματά σου.</p></div>
      {canAudit ? <div className={`admin-dashboard-health${dashboard.health.ok ? "" : " needs-attention"}`}><div><span>Platform</span><strong>{dashboard.health.state}</strong></div><i aria-hidden="true" /></div> : null}
    </section>
    <AdminDashboardCanvas widgets={widgets} />
  </main>;
}
