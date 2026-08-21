import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorActionNotice, VendorLifecycle, vendorStatusLabel } from "../../../components/VendorLifecycle";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceHowItWorks, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { vendorOrderNotificationWorkspace } from "../../../lib/order-sla";
import { getVendorSession } from "../../../lib/vendor-session";

const when = (value: string) => new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));
const stage = (value: string) => value === "acceptance" ? "Αποδοχή παραγγελίας" : "Προετοιμασία παραγγελίας";

function remaining(dueAt: string, state: string, now: number) {
  const diff = new Date(dueAt).getTime() - now;
  const absoluteMinutes = Math.max(1, Math.round(Math.abs(diff) / 60_000));
  const duration = absoluteMinutes >= 120 ? `${Math.round(absoluteMinutes / 60)} ώρες` : `${absoluteMinutes} λεπτά`;
  if (state === "escalated") return `Εκπρόθεσμη και κλιμακωμένη · ${duration}`;
  if (diff < 0 || state === "breached") return `Εκπρόθεσμη κατά ${duration}`;
  return `Απομένουν ${duration}`;
}

function deadlineSteps(item: { stage: string; state: string }) {
  const acceptance = item.stage === "acceptance";
  const overdue = ["breached", "escalated"].includes(item.state);
  return [
    { label: "Παραγγελία", tone: "done" as const },
    { label: "Αποδοχή", tone: acceptance ? (overdue ? "blocked" as const : "attention" as const) : "done" as const },
    { label: "Προετοιμασία", tone: acceptance ? "future" as const : overdue ? "blocked" as const : "attention" as const },
    { label: "Επόμενο στάδιο", tone: "future" as const }
  ];
}

export default async function Page() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  let data;
  try { data = await vendorOrderNotificationWorkspace(principal); } catch { redirect("/vendor"); }
  const active = data.cases.filter((item) => item.state !== "resolved");
  const now = Date.now();

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Παραγγελίες · προθεσμίες</div><h1>Τι πρέπει να γίνει και μέχρι πότε</h1><p className="lead">Οι ενεργές προθεσμίες ταξινομούνται ως εργασία του καταστήματός σου. Δεν χρειάζεται να γνωρίζεις τι σημαίνει SLA για να τις χρησιμοποιήσεις.</p><div className="hero-actions"><Link className="button" href="/vendor/orders">Όλες οι παραγγελίες</Link></div></div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Χρειάζονται ενέργεια", value: data.metrics.requiringAction, tone: data.metrics.requiringAction ? "attention" : "default" },
      { label: "Εκπρόθεσμα", value: data.metrics.breached, tone: data.metrics.breached ? "attention" : "default" },
      { label: "Κλιμακωμένα", value: data.metrics.escalated, tone: data.metrics.escalated ? "attention" : "default" },
      { label: "Νέες ειδοποιήσεις", value: data.metrics.unread }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Ενεργές προθεσμίες" title="Ξεκίνα από την πρώτη κάρτα που χρειάζεται ενέργεια" note="Όταν ενημερώσεις σωστά την παραγγελία, η αντίστοιχη προθεσμία κλείνει αυτόματα." />
      <WorkspaceHowItWorks className="vendor-page-help">
        <p><strong>Κίτρινο:</strong> χρειάζεται ενέργεια από το κατάστημά σου πριν λήξει η προθεσμία.</p>
        <p><strong>Κόκκινο:</strong> η συμφωνημένη προθεσμία έχει περάσει και η παραγγελία πρέπει να ενημερωθεί άμεσα.</p>
        <p><strong>Δεν αλλάζεις την προθεσμία εδώ.</strong> Ανοίγεις την παραγγελία και καταγράφεις μόνο αυτό που έχει πραγματικά συμβεί.</p>
      </WorkspaceHowItWorks>
      {active.length === 0 ? <VendorActionNotice tone="positive" title="Δεν υπάρχει ενεργή εκκρεμότητα">Δεν χρειάζεται ενέργεια για κάποια προθεσμία αυτή τη στιγμή.</VendorActionNotice> : <div className="workspace-queue-list">{active.map((item) => {
        const overdue = ["breached", "escalated"].includes(item.state) || new Date(item.dueAt).getTime() < now;
        const countdown = remaining(item.dueAt, item.state, now);
        return <article className="workspace-queue-card" key={item.id}>
          <div className="workspace-queue-head"><div><strong className="vendor-case-title">Παραγγελία {item.orderId}</strong><small>{stage(item.stage)} · προθεσμία {when(item.dueAt)}</small></div><span className="vendor-merchant-status">{overdue ? "Εκπρόθεσμη" : "Χρειάζεται ενέργεια"}</span></div>
          <VendorLifecycle steps={deadlineSteps(item)} ariaLabel={`Προθεσμία παραγγελίας ${item.orderId}`} />
          <VendorActionNotice tone={overdue ? "danger" : "attention"} title={countdown}>{stage(item.stage)}: ενημέρωσε την πραγματική κατάσταση της παραγγελίας.</VendorActionNotice>
          <div className="workspace-action-bar"><span>{overdue ? `Κλιμάκωση: ${when(item.escalationAt)}` : `Λήξη: ${when(item.dueAt)}`}</span><Link className="button" href={`/vendor/orders#order-${encodeURIComponent(item.orderId)}`}>Άνοιγμα παραγγελίας</Link></div>
          <WorkspaceRecordDetails label="Τεχνικές λεπτομέρειες για υποστήριξη">
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Κατάσταση συστήματος</strong><span>{item.state}</span><small>{vendorStatusLabel(item.fulfilmentStatus)}</small></div>
              <div className="workspace-compact-row"><strong>SLA case</strong><span className="vendor-technical-id">{item.id}</span><small className="vendor-technical-id">Fulfilment {item.fulfilmentId}</small></div>
            </div>
          </WorkspaceRecordDetails>
        </article>;
      })}</div>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Πώς ορίζονται οι χρόνοι" title="Η συμφωνία σου" note="Οι λεπτομέρειες της SLA πολιτικής παραμένουν διαθέσιμες για διαφάνεια, χωρίς να καταλαμβάνουν την κύρια οθόνη εργασίας." />
      <WorkspaceHowItWorks title="Προθεσμίες της εμπορικής συμφωνίας">
        {data.activeAgreement ? <>
          <p><strong>{data.activeAgreement.agreementCode} · έκδοση {data.activeAgreement.agreementVersion}</strong></p>
          <p>Αποδοχή παραγγελίας: {data.activeAgreement.acceptanceMinutes} λεπτά. Προετοιμασία: {data.activeAgreement.preparationMinutes} λεπτά.</p>
          <p>Πρώτη υπενθύμιση στο {data.activeAgreement.warningPercent}% του χρόνου, email στο {data.activeAgreement.emailReminderPercent}% και κλιμάκωση {data.activeAgreement.escalationGraceMinutes} λεπτά μετά τη λήξη.</p>
          {!data.activeAgreement.configured && <p>Χρησιμοποιείται προσωρινή πολιτική μέχρι να καταχωριστεί η εκτελέσιμη SLA πολιτική της συμφωνίας.</p>}
        </> : <p>Δεν βρέθηκε ενεργή συμφωνία, οπότε εφαρμόζεται προσωρινή πολιτική πλατφόρμας μέχρι να ενεργοποιηθεί η συμφωνία.</p>}
      </WorkspaceHowItWorks>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Ιστορικό" title="Ειδοποιήσεις παραγγελιών" note="Οι ειδοποιήσεις είναι ιστορικό και υπενθύμιση. Η πραγματική εργασία γίνεται στην παραγγελία." />
      {data.notifications.length === 0 ? <div className="workspace-empty-state"><strong>Δεν υπάρχουν ειδοποιήσεις.</strong></div> : <div className="workspace-queue-list">{data.notifications.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head"><div><strong>{item.title}</strong><small>{when(item.createdAt)}</small></div><span className="vendor-merchant-status">{item.readAt ? "Διαβάστηκε" : "Νέα"}</span></div>
        <p>{item.body}</p>
      </article>)}</div>}
    </div></section>
  </main>;
}
