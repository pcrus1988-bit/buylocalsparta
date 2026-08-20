import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { vendorOrderNotificationWorkspace } from "../../../lib/order-sla";
import { getVendorSession } from "../../../lib/vendor-session";

const when = (value: string) => new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));
const stage = (value: string) => value === "acceptance" ? "Αποδοχή παραγγελίας" : "Προετοιμασία";

export default async function Page() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  let data;
  try { data = await vendorOrderNotificationWorkspace(principal); } catch { redirect("/vendor"); }
  const active = data.cases.filter((item) => item.state !== "resolved");

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Παραγγελίες · προθεσμίες</div><h1>Προθεσμίες & SLA</h1><p className="lead">Ό,τι χρειάζεται ενέργεια για τις παραγγελίες του καταστήματός σου, μαζί με τις συμφωνημένες προθεσμίες.</p><div className="hero-actions"><Link className="button" href="/vendor/orders">Παραγγελίες</Link></div></div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Χρειάζονται ενέργεια", value: data.metrics.requiringAction, tone: data.metrics.requiringAction ? "attention" : "default" },
      { label: "Εκπρόθεσμα", value: data.metrics.breached, tone: data.metrics.breached ? "attention" : "default" },
      { label: "Κλιμακωμένα", value: data.metrics.escalated, tone: data.metrics.escalated ? "attention" : "default" },
      { label: "Μη αναγνωσμένες", value: data.metrics.unread }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Συμφωνία συνεργασίας" title="Οι χρόνοι SLA σου" note="Οι χρόνοι προέρχονται από την ενεργή συμφωνία και αποθηκεύονται ως snapshot όταν ανοίγει κάθε SLA case." />
      {data.activeAgreement ? <div className="workspace-callout">
        <strong>{data.activeAgreement.agreementCode} · v{data.activeAgreement.agreementVersion}</strong>
        <span>Αποδοχή: {data.activeAgreement.acceptanceMinutes} λεπτά · Προετοιμασία: {data.activeAgreement.preparationMinutes} λεπτά · in-app reminder στο {data.activeAgreement.warningPercent}% · email στο {data.activeAgreement.emailReminderPercent}% · escalation +{data.activeAgreement.escalationGraceMinutes} λεπτά.</span>
        {!data.activeAgreement.configured && <span>Χρησιμοποιείται προσωρινό fallback μέχρι ο admin να καταχωρίσει executable SLA policy για τη συμφωνία.</span>}
      </div> : <div className="workspace-callout"><strong>Δεν βρέθηκε ενεργή συμφωνία.</strong><span>Ισχύει προσωρινή platform fallback policy μέχρι να ενεργοποιηθεί συμφωνία.</span></div>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Live queue" title="Ενεργές προθεσμίες" note="Μόλις αλλάξεις σωστά το order status, η συγκεκριμένη υπενθύμιση κλείνει αυτόματα." />
      {active.length === 0 ? <div className="workspace-empty-state"><strong>Δεν υπάρχει ενεργή εκκρεμότητα.</strong></div> : <div className="workspace-queue-list">{active.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head"><div><strong>{item.orderId}</strong><small>{item.fulfilmentId}</small></div><span className="status-pill">{item.state}</span></div>
        <div className="workspace-queue-primary"><span>{stage(item.stage)}</span><span>Status: {item.fulfilmentStatus}</span><span>Due {when(item.dueAt)}</span></div>
        <div className="workspace-action-bar"><span>Escalation: <strong>{when(item.escalationAt)}</strong></span><Link className="button" href="/vendor/orders">Ενημέρωση παραγγελίας</Link></div>
      </article>)}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Notification feed" title="Ειδοποιήσεις παραγγελιών" note="Νέες παραγγελίες και SLA reminders του δικού σου καταστήματος." />
      {data.notifications.length === 0 ? <div className="workspace-empty-state"><strong>Δεν υπάρχουν ειδοποιήσεις.</strong></div> : <div className="workspace-queue-list">{data.notifications.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head"><div><strong>{item.title}</strong><small>{when(item.createdAt)}</small></div><span className="status-pill">{item.readAt ? "read" : "new"}</span></div>
        <p>{item.body}</p>
      </article>)}</div>}
    </div></section>
  </main>;
}
