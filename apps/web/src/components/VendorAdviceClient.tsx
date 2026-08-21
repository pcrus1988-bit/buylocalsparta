"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { VendorActionNotice, VendorLifecycle, vendorStatusLabel } from "./VendorLifecycle";
import { WorkspaceEmptyState, WorkspaceHowItWorks, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

type Workspace = { csrfToken: string; conversations: readonly any[]; appointments: readonly any[]; counteroffers: readonly any[]; privateOffers: readonly any[]; notifications: readonly any[] };
const when = (value?: number) => value ? new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value)) : "";
const closedRequestStates = new Set(["closed", "expired", "accepted", "rejected"]);

function requestSteps(status: string) {
  const value = String(status ?? "").toLowerCase();
  if (value === "accepted") return [{ label: "Αίτημα", tone: "done" as const }, { label: "Προσφορά", tone: "done" as const }, { label: "Αποδοχή", tone: "done" as const }];
  if (["closed", "expired", "rejected"].includes(value)) return [{ label: "Αίτημα", tone: "done" as const }, { label: "Προσφορά / απάντηση", tone: "done" as const }, { label: vendorStatusLabel(value), tone: "blocked" as const }];
  if (["offered", "offer_sent", "waiting_customer"].includes(value)) return [{ label: "Αίτημα", tone: "done" as const }, { label: "Προσφορά στάλθηκε", tone: "done" as const }, { label: "Περιμένουμε πελάτη", tone: "waiting" as const }];
  return [{ label: "Αίτημα", tone: "done" as const }, { label: "Απάντηση από κατάστημα", tone: "attention" as const }, { label: "Απόφαση πελάτη", tone: "future" as const }];
}

function appointmentLabel(status: string) {
  const labels: Record<string, string> = { booked: "Προγραμματισμένο", completed: "Ολοκληρώθηκε", cancelled: "Ακυρώθηκε", canceled: "Ακυρώθηκε" };
  return labels[status] ?? vendorStatusLabel(status);
}

export function VendorAdviceClient({ initial }: { initial: Workspace }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const booked = initial.appointments.filter((item) => item.status === "booked").length;
  const openRequests = initial.counteroffers.filter((item) => !closedRequestStates.has(item.status)).length;

  async function call(key: string, url: string, body: any) {
    setBusy(key);
    setError("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": initial.csrfToken }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Δεν μπορέσαμε να ολοκληρώσουμε την ενέργεια.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν μπορέσαμε να ολοκληρώσουμε την ενέργεια.");
    } finally { setBusy(""); }
  }

  return <>
    {error && <div className="shell form-error vendor-error" role="alert"><strong>Η ενέργεια δεν ολοκληρώθηκε.</strong> {error}</div>}

    <WorkspaceMetricStrip items={[
      { label: "Συνομιλίες", value: initial.conversations.length },
      { label: "Ραντεβού προς εξυπηρέτηση", value: booked, tone: booked ? "attention" : "default" },
      { label: "Ask Local προς απάντηση", value: openRequests, tone: openRequests ? "attention" : "default" },
      { label: "Ιδιωτικές προσφορές", value: initial.privateOffers.length, tone: initial.privateOffers.length ? "positive" : "default" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Πελάτες" title="Μηνύματα" note="Απάντησε στις ενεργές συνομιλίες του καταστήματός σου χωρίς να χρειάζεται να γνωρίζεις εσωτερικά IDs ή τεχνικές καταστάσεις." />
      <WorkspaceHowItWorks className="vendor-page-help">
        <p><strong>Μηνύματα:</strong> γράφεις την απάντησή σου και η συνομιλία παραμένει συνδεδεμένη με το συγκεκριμένο αίτημα.</p>
        <p><strong>Ραντεβού:</strong> τα ολοκληρώνεις ή τα ακυρώνεις μόνο όταν αυτό έχει πραγματικά συμβεί.</p>
        <p><strong>Ask Local:</strong> η γρήγορη καθημερινή διαχείριση και η δημιουργία απάντησης/προσφοράς συνεχίζονται στο KONTA MOY Daily.</p>
      </WorkspaceHowItWorks>
      {initial.conversations.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν ενεργές συνομιλίες." body="Νέα αιτήματα συμβουλής θα εμφανίζονται εδώ όταν ανατεθούν στο κατάστημά σου." /> : <div className="workspace-queue-list">{initial.conversations.map((conversation, index) => <details className="workspace-tool-panel" key={conversation.id} open={index === 0}>
        <summary><span><strong>{conversation.title ?? "Συνομιλία πελάτη"}</strong><small>{conversation.messages.length} μηνύματα · {vendorStatusLabel(conversation.state ?? "active")}</small></span></summary>
        <div className="workspace-tool-body">
          <div className="workspace-message-thread">{conversation.messages.map((message: any) => <div className={`workspace-message${message.senderType === "vendor" ? " is-vendor" : ""}`} key={message.id}><strong>{message.senderType === "vendor" ? "Κατάστημα" : "Πελάτης"}</strong><span> {message.body}</span>{message.createdAt && <small> · {when(message.createdAt)}</small>}</div>)}</div>
          <form className="vendor-message-form" onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void call(`msg:${conversation.id}`, "/api/vendor/advice/messages", { conversationId: conversation.id, body: form.get("body") });
          }}>
            <input name="body" required placeholder="Γράψε απάντηση…" aria-label="Απάντηση στη συνομιλία" />
            <button className="button" disabled={Boolean(busy)}>{busy === `msg:${conversation.id}` ? "Αποστολή…" : "Αποστολή"}</button>
          </form>
          <WorkspaceRecordDetails label="Τεχνικές λεπτομέρειες για υποστήριξη"><div className="workspace-compact-row"><strong>Conversation</strong><span className="vendor-technical-id">{conversation.id}</span>{conversation.canonicalVariantId ? <small className="vendor-technical-id">Product {conversation.canonicalVariantId}</small> : null}</div></WorkspaceRecordDetails>
        </div>
      </details>)}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Ραντεβού" title="Προγραμματισμένες επαφές" note="Τα προγραμματισμένα ραντεβού που χρειάζονται εξυπηρέτηση εμφανίζονται με σαφή κατάσταση." />
      <WorkspaceHowItWorks><p>Όταν ολοκληρωθεί το ραντεβού, πάτησε «Ολοκληρώθηκε». Αν ακυρωθεί, κατέγραψέ το ώστε να μη συνεχίζει να εμφανίζεται ως εκκρεμότητα.</p></WorkspaceHowItWorks>
      {initial.appointments.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν προγραμματισμένα ραντεβού." /> : <div className="workspace-queue-list">{initial.appointments.map((appointment) => <article className="workspace-queue-card" key={appointment.id}>
        <div className="workspace-queue-head"><div><strong>{appointment.channel} · {when(appointment.startsAt)}</strong><small>{appointment.title ?? "Συμβουλή πελάτη"}</small></div><span className="vendor-merchant-status">{appointmentLabel(appointment.status)}</span></div>
        {appointment.status === "booked" ? <VendorActionNotice tone="attention" title="Χρειάζεται εξυπηρέτηση από το κατάστημά σου" /> : <VendorActionNotice tone="positive" title={appointmentLabel(appointment.status)} />}
        {appointment.status === "booked" && <div className="workspace-action-bar"><span>Ενημέρωσε την κατάσταση μετά το πραγματικό αποτέλεσμα του ραντεβού.</span><div className="workspace-action-buttons"><button type="button" className="button button-secondary" disabled={Boolean(busy)} onClick={() => void call(`cancel:${appointment.id}`, "/api/vendor/advice/appointments", { appointmentId: appointment.id, action: "cancel" })}>Ακύρωση ραντεβού</button><button type="button" className="button" disabled={Boolean(busy)} onClick={() => void call(`complete:${appointment.id}`, "/api/vendor/advice/appointments", { appointmentId: appointment.id, action: "complete" })}>Το ραντεβού ολοκληρώθηκε</button></div></div>}
      </article>)}</div>}
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Ask Local" title="Αιτήματα & ιδιωτικές προσφορές" note="Βλέπεις την πορεία εδώ. Για γρήγορη απάντηση σε ενεργό αίτημα χρησιμοποίησε το KONTA MOY Daily." />
      {openRequests > 0 && <VendorActionNotice tone="attention" title={`${openRequests} ${openRequests === 1 ? "αίτημα περιμένει" : "αιτήματα περιμένουν"} απάντηση`}><Link className="button" href="/daily">Άνοιγμα KONTA MOY Daily</Link></VendorActionNotice>}
      <div className="workspace-dual-grid">
        <article className="workspace-queue-card">
          <strong>Αιτήματα Ask Local</strong>
          {initial.counteroffers.length ? <div className="workspace-queue-list" style={{ marginTop: 12 }}>{initial.counteroffers.map((request) => <article className="workspace-queue-card" key={request.id}>
            <div className="workspace-queue-head"><div><strong>{request.need ?? "Αίτημα πελάτη"}</strong><small>{vendorStatusLabel(request.status)}</small></div></div>
            <VendorLifecycle steps={requestSteps(request.status)} ariaLabel="Πορεία Ask Local" />
            {!closedRequestStates.has(request.status) && <Link className="button" href="/daily">Απάντηση στο Daily</Link>}
            <WorkspaceRecordDetails label="Τεχνικές λεπτομέρειες"><div className="workspace-compact-row"><strong>Request</strong><span className="vendor-technical-id">{request.id}</span>{request.canonicalVariantId ? <small className="vendor-technical-id">Product {request.canonicalVariantId}</small> : null}</div></WorkspaceRecordDetails>
          </article>)}</div> : <p className="workspace-queue-summary">Δεν υπάρχουν ανατεθειμένα αιτήματα.</p>}
        </article>
        <article className="workspace-queue-card">
          <strong>Ιδιωτικές προσφορές</strong>
          {initial.privateOffers.length ? <div className="workspace-compact-list" style={{ marginTop: 12 }}>{initial.privateOffers.map((offer) => <div className="workspace-compact-row" key={offer.id}><strong>{offer.price ?? "Προσφορά"}</strong><span>{vendorStatusLabel(offer.status ?? "private")}</span><small>{offer.expiresAt ? `Ισχύει έως ${when(offer.expiresAt)}` : ""}</small></div>)}</div> : <p className="workspace-queue-summary">Δεν υπάρχουν ιδιωτικές προσφορές.</p>}
        </article>
      </div>

      <details className="workspace-tool-panel" style={{ marginTop: 12 }}>
        <summary><span><strong>Πρόσφατες ειδοποιήσεις</strong><small>{initial.notifications.length} ειδοποιήσεις.</small></span></summary>
        <div className="workspace-tool-body">{initial.notifications.length ? <div className="workspace-compact-list">{initial.notifications.map((notification) => <div className="workspace-compact-row" key={notification.id}><strong>{notification.title}</strong><span>{notification.body}</span>{notification.createdAt && <small>{when(notification.createdAt)}</small>}</div>)}</div> : <p className="workspace-queue-summary">Δεν υπάρχουν ειδοποιήσεις.</p>}</div>
      </details>
    </section>
  </>;
}
