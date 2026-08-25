import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminVendorPriceHistory } from "../../../components/AdminVendorPriceHistory";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getAdminSession } from "../../../lib/admin-session";
import { adminOrderSlaWorkspace } from "../../../lib/order-sla";

export const metadata: Metadata = { title: "Admin · Notifications & Escalations", robots: { index: false, follow: false } };
const when = (value: string) => new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));
const stage = (value: string) => value === "acceptance" ? "Αποδοχή" : "Προετοιμασία";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  try { data = await adminOrderSlaWorkspace(); } catch { redirect("/admin"); }
  const active = data.cases.filter((item) => item.state !== "resolved");

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Operations · notifications</div><h1>Notifications & Escalations</h1><p className="lead">Operational alerts, vendor price changes και order SLA escalations σε ένα admin workspace με audit trail.</p><div className="hero-actions"><Link className="button" href="/admin/orders">Orders</Link><Link className="button button-secondary" href="/admin/finance/agreements/sla">SLA ανά συμφωνία</Link></div></div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Εντός SLA", value: data.metrics.active },
      { label: "Breached", value: data.metrics.breached, tone: data.metrics.breached ? "attention" : "default" },
      { label: "Escalated", value: data.metrics.escalated, tone: data.metrics.escalated ? "attention" : "default" },
      { label: "Agreements χωρίς policy", value: data.metrics.agreementsWithoutPolicy, tone: data.metrics.agreementsWithoutPolicy ? "attention" : "positive" }
    ]} />

    <AdminVendorPriceHistory />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Live SLA queue" title="Παραγγελίες που απαιτούν παρακολούθηση" note="Η υπενθύμιση σταματά αυτόματα όταν αλλάξει η πραγματική κατάσταση του fulfilment." />
      {active.length === 0 ? <div className="workspace-empty-state"><strong>Δεν υπάρχει ενεργή SLA εκκρεμότητα.</strong><span>Οι ολοκληρωμένες υποθέσεις παραμένουν στο audit history.</span></div> : <div className="workspace-queue-list">{active.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head"><div><strong>{item.orderId}</strong><small>{item.vendorName} · {item.fulfilmentId}</small></div><span className="status-pill">{item.state}</span></div>
        <div className="workspace-queue-primary"><span>{stage(item.stage)}</span><span>Status: {item.fulfilmentStatus}</span><span>Due {when(item.dueAt)}</span></div>
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Agreement</strong><span>{item.agreementCode ? `${item.agreementCode} · v${item.agreementVersion}` : "Fallback policy"}</span></div>
          <div className="workspace-compact-row"><strong>Opened</strong><span>{when(item.openedAt)}</span></div>
          <div className="workspace-compact-row"><strong>Escalation</strong><span>{when(item.escalationAt)}</span></div>
        </div>
        <div className="workspace-action-bar"><span>Vendor: <strong>{item.vendorName}</strong></span><div className="workspace-action-buttons"><Link className="button button-secondary" href={`/admin/orders?order=${encodeURIComponent(item.orderId)}`}>Άνοιγμα order</Link></div></div>
      </article>)}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Order SLA feed" title="Escalation events" note="Νέα order assignments, SLA breaches και επείγουσες κλιμακώσεις." />
      {data.notifications.length === 0 ? <div className="workspace-empty-state"><strong>Δεν υπάρχουν order SLA alerts.</strong></div> : <div className="workspace-queue-list">{data.notifications.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head"><div><strong>{item.title}</strong><small>{when(item.createdAt)}</small></div><span className="status-pill">{item.eventType}</span></div>
        <p>{item.body}</p>
      </article>)}</div>}
    </div></section>
  </main>;
}
