import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminAskLocalDashboard } from "../../../lib/admin-ask-local";
import { adminCustomerSupportQueue } from "../../../lib/admin-customer-support-queue";
import { adminDashboard, hasAdminPermission } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { adminOrderSlaWorkspace } from "../../../lib/order-sla";

export const metadata: Metadata = { title: "Admin · Operations", robots: { index: false, follow: false } };

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const canFulfil = hasAdminPermission(principal, "fulfilment.read");
  const canCustomer = hasAdminPermission(principal, "customer.read");
  if (!canFulfil && !canCustomer) redirect("/admin");
  const [dashboard, sla, askLocal, support] = await Promise.all([adminDashboard(principal), canFulfil ? adminOrderSlaWorkspace().catch(() => undefined) : undefined, canCustomer ? adminAskLocalDashboard(principal).catch(() => undefined) : undefined, canCustomer ? adminCustomerSupportQueue(principal, {}).catch(() => undefined) : undefined]);
  const breached = sla?.metrics.breached ?? 0, escalated = sla?.metrics.escalated ?? 0, askOpen = askLocal?.openCount ?? 0, supportOpen = support?.metrics.open ?? 0, supportUrgent = support?.metrics.urgent ?? 0;
  return <main className="vendor-app admin-app"><AdminWorkspaceHeader csrfToken={dashboard.csrfToken} /><section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Operations</div><h1>Κέντρο λειτουργιών</h1><p className="lead">Παραγγελίες, SLA, Ask Local και customer support σε ένα operational σημείο εκκίνησης.</p></div></section><WorkspaceMetricStrip items={[...(canFulfil ? [{ label: "Orders", value: dashboard.metrics.orders }] : []), ...(canFulfil ? [{ label: "SLA breached", value: breached, tone: breached ? "attention" as const : "positive" as const, hint: `${escalated} escalated` }] : []), ...(canCustomer ? [{ label: "Ask Local", value: askOpen, tone: (askLocal?.overdueCount ?? 0) ? "attention" as const : "default" as const, hint: `${askLocal?.overdueCount ?? 0} overdue` }] : []), ...(canCustomer ? [{ label: "Support", value: supportOpen, tone: supportUrgent ? "attention" as const : "default" as const, hint: `${supportUrgent} urgent` }] : [])]} /><section className="shell vendor-section"><WorkspaceSectionHeading eyebrow="Workflows" title="Καθημερινές λειτουργίες" note="Κάθε workflow διατηρεί το δικό του governed state machine· εδώ βλέπεις μόνο το σωστό σημείο εισόδου και την τρέχουσα πίεση." /><div className="admin-domain-card-grid">{canFulfil && <Link className="admin-domain-card" href="/admin/orders"><span>Orders</span><strong>Παραγγελίες & returns</strong><p>Customer-level order, fulfilments, returns και refunds.</p><b>{dashboard.metrics.orders}</b><i>Άνοιγμα →</i></Link>}{canFulfil && <Link className={`admin-domain-card${breached || escalated ? " needs-attention" : ""}`} href="/admin/notifications"><span>SLA</span><strong>SLA & Escalations</strong><p>Vendor acceptance / preparation deadlines και κλιμακώσεις.</p><b>{breached + escalated}</b><i>Άνοιγμα →</i></Link>}{canCustomer && <Link className={`admin-domain-card${askLocal?.overdueCount ? " needs-attention" : ""}`} href="/admin/ask-local"><span>Demand</span><strong>Ask Local</strong><p>Ownership, vendor assignment και response deadlines.</p><b>{askOpen}</b><i>Άνοιγμα →</i></Link>}{canCustomer && <Link className={`admin-domain-card${supportUrgent ? " needs-attention" : ""}`} href="/admin/customers/support"><span>Customer care</span><strong>Υποστήριξη</strong><p>Priority, ownership, follow-up και Customer 360.</p><b>{supportOpen}</b><i>Άνοιγμα →</i></Link>}</div></section></main>;
}
