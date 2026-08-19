"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading, WorkspaceStatusBadge } from "./WorkspacePagePrimitives";

type Workspace = { csrfToken: string; conversations: readonly any[]; appointments: readonly any[]; counteroffers: readonly any[]; privateOffers: readonly any[]; notifications: readonly any[] };
type AdviceView = "messages" | "appointments" | "offers";
const when = (value?: number) => value ? new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "";

export function VendorAdviceClient({ initial }: { initial: Workspace }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState<AdviceView>("messages");
  const booked = initial.appointments.filter((item) => item.status === "booked").length;
  const openRequests = initial.counteroffers.filter((item) => !["closed", "expired", "accepted", "rejected"].includes(item.status)).length;

  async function call(key: string, url: string, body: any) {
    setBusy(key);
    setError("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": initial.csrfToken }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Η ενέργεια απέτυχε");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η ενέργεια απέτυχε");
    } finally { setBusy(""); }
  }

  return <>
    {error && <div className="shell form-error vendor-error" role="alert">{error}</div>}

    <WorkspaceMetricStrip items={[
      { label: "Συνομιλίες", value: initial.conversations.length },
      { label: "Booked", value: booked, tone: booked ? "attention" : "default", hint: "ραντεβού προς εξυπηρέτηση" },
      { label: "Ask Local", value: openRequests, tone: openRequests ? "attention" : "default" },
      { label: "Private offers", value: initial.privateOffers.length, tone: initial.privateOffers.length ? "positive" : "default" }
    ]} />

    <div className="shell workspace-view-tabs" role="tablist" aria-label="Ενότητες customer care">
      <button type="button" role="tab" aria-selected={view === "messages"} className={view === "messages" ? "is-active" : undefined} onClick={() => setView("messages")}><span>Μηνύματα</span><b>{initial.conversations.length}</b></button>
      <button type="button" role="tab" aria-selected={view === "appointments"} className={view === "appointments" ? "is-active" : undefined} onClick={() => setView("appointments")}><span>Ραντεβού</span><b>{booked}</b></button>
      <button type="button" role="tab" aria-selected={view === "offers"} className={view === "offers" ? "is-active" : undefined} onClick={() => setView("offers")}><span>Αιτήματα & προσφορές</span><b>{openRequests + initial.privateOffers.length}</b></button>
    </div>

    {view === "messages" && <section className="shell vendor-section" role="tabpanel">
      <WorkspaceSectionHeading eyebrow="Conversations" title="Μηνύματα" note="Άνοιξε μόνο τη συνομιλία που δουλεύεις τώρα." />
      {initial.conversations.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν ενεργές συνομιλίες." body="Νέα customer advice threads θα εμφανιστούν εδώ όταν ανατεθούν στο κατάστημά σου." /> : <div className="workspace-queue-list">{initial.conversations.map((conversation, index) => <details className="workspace-tool-panel" key={conversation.id} open={index === 0}>
        <summary><span><strong>{conversation.canonicalVariantId ?? "Γενική συμβουλή"}</strong><small>{conversation.state} · {conversation.messages.length} μηνύματα</small></span></summary>
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
        </div>
      </details>)}</div>}

      <details className="workspace-tool-panel workspace-secondary-tool">
        <summary><span><strong>Ειδοποιήσεις</strong><small>{initial.notifications.length} πρόσφατες in-app ειδοποιήσεις.</small></span></summary>
        <div className="workspace-tool-body">{initial.notifications.length ? <div className="workspace-compact-list">{initial.notifications.map((notification) => <div className="workspace-compact-row" key={notification.id}><strong>{notification.title}</strong><span>{notification.body}</span>{notification.createdAt && <small>{when(notification.createdAt)}</small>}</div>)}</div> : <p className="workspace-queue-summary">Δεν υπάρχουν ειδοποιήσεις.</p>}</div>
      </details>
    </section>}

    {view === "appointments" && <section className="shell vendor-section" role="tabpanel">
      <WorkspaceSectionHeading eyebrow="Appointments" title="Ραντεβού" note="Booked appointments εμφανίζονται πρώτα και ολοκληρώνονται από εδώ." />
      {initial.appointments.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν προγραμματισμένα ραντεβού." /> : <div className="workspace-queue-list">{[...initial.appointments].sort((a, b) => Number(b.status === "booked") - Number(a.status === "booked")).map((appointment) => <article className="workspace-queue-card" key={appointment.id}>
        <div className="workspace-queue-head"><div><strong>{appointment.channel} · {new Date(appointment.startsAt).toLocaleString("el-GR")}</strong><small>{appointment.canonicalVariantId ?? "Γενική συμβουλή"}</small></div><WorkspaceStatusBadge status={appointment.status} /></div>
        {appointment.status === "booked" && <div className="workspace-action-bar"><span>Customer details παραμένουν scoped στο interaction.</span><div className="workspace-action-buttons"><button type="button" className="button button-secondary" disabled={Boolean(busy)} onClick={() => void call(`cancel:${appointment.id}`, "/api/vendor/advice/appointments", { appointmentId: appointment.id, action: "cancel" })}>Ακύρωση</button><button type="button" className="button" disabled={Boolean(busy)} onClick={() => void call(`complete:${appointment.id}`, "/api/vendor/advice/appointments", { appointmentId: appointment.id, action: "complete" })}>Ολοκλήρωση</button></div></div>}
      </article>)}</div>}
    </section>}

    {view === "offers" && <section className="shell vendor-section" role="tabpanel">
      <WorkspaceSectionHeading eyebrow="Ask Local & private offers" title="Αιτήματα & προσφορές" note="Ό,τι αφορά ιδιωτική ζήτηση και προσφορά βρίσκεται σε ένα task view." />
      <div className="workspace-dual-grid">
        <article className="workspace-queue-card">
          <div className="workspace-queue-head"><div><strong>Ask Local</strong><small>Ανατεθειμένα αιτήματα</small></div><span className="count-pill">{openRequests}</span></div>
          {initial.counteroffers.length ? <div className="workspace-compact-list workspace-compact-list-spaced">{initial.counteroffers.map((request) => <div className="workspace-compact-row" key={request.id}><strong>{request.canonicalVariantId ?? "Γενικό αίτημα"}</strong><span>{request.need ?? "—"}</span><WorkspaceStatusBadge status={request.status} /></div>)}</div> : <p className="workspace-queue-summary">Δεν υπάρχουν ανατεθειμένα αιτήματα.</p>}
        </article>
        <article className="workspace-queue-card">
          <div className="workspace-queue-head"><div><strong>Private offers</strong><small>Ιδιωτικές προσφορές</small></div><span className="count-pill">{initial.privateOffers.length}</span></div>
          {initial.privateOffers.length ? <div className="workspace-compact-list workspace-compact-list-spaced">{initial.privateOffers.map((offer) => <div className="workspace-compact-row" key={offer.id}><strong>{offer.canonicalVariantId ?? offer.id}</strong><span>{offer.price ?? ""}</span><WorkspaceStatusBadge status={offer.status ?? "private"} /></div>)}</div> : <p className="workspace-queue-summary">Δεν υπάρχουν private offers.</p>}
        </article>
      </div>
    </section>}
  </>;
}
