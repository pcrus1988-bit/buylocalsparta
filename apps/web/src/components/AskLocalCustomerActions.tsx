"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { CustomerAskLocalRequestView } from "../lib/customer-ask-local-view";

const cancellable = new Set(["submitted", "matched", "assigned", "awaiting_vendor", "needs_info", "offered"]);
type ThreadMessage = Readonly<{ id: string; senderType: string; body: string; imageDataUrl?: string; createdAt: number }>;

function money(minor: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

function when(value: number): string {
  return new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function AskLocalCustomerActions({ csrfToken, initial }: { csrfToken: string; initial: readonly CustomerAskLocalRequestView[] }) {
  const [requests, setRequests] = useState(initial);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [threads, setThreads] = useState<Record<string, readonly ThreadMessage[] | undefined>>({});
  const [threadBusy, setThreadBusy] = useState("");
  const visible = useMemo(() => requests.filter((request) => cancellable.has(request.status) || request.status === "accepted"), [requests]);

  if (!visible.length) return null;

  async function decide(request: CustomerAskLocalRequestView, actionReference: string, action: "accept" | "decline") {
    setBusy(`${action}:${actionReference}`);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/account/ask-local/offers", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ actionReference, action })
      });
      const payload = await response.json() as { requests?: readonly CustomerAskLocalRequestView[]; error?: string };
      if (!response.ok || !payload.requests) throw new Error(payload.error ?? "Η απόφαση δεν αποθηκεύτηκε.");
      setRequests(payload.requests);
      if (action === "accept" && request.canonicalVariantId) {
        window.location.assign(`/checkout/private-offer/${encodeURIComponent(actionReference)}`);
        return;
      }
      setMessage(action === "accept"
        ? "Η προσφορά έγινε αποδεκτή. Μπορείς να συνεχίσεις στο checkout."
        : "Η προσφορά απορρίφθηκε και το κατάστημα ενημερώθηκε.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η απόφαση δεν αποθηκεύτηκε.");
    } finally {
      setBusy("");
    }
  }

  async function loadThread(requestReference: string) {
    if (threads[requestReference] || threadBusy === requestReference) return;
    setThreadBusy(requestReference);
    setError("");
    try {
      const response = await fetch(`/api/account/ask-local/clarifications?requestId=${encodeURIComponent(requestReference)}`, { cache: "no-store" });
      const payload = await response.json() as { messages?: readonly ThreadMessage[]; error?: string };
      if (!response.ok || !payload.messages) throw new Error(payload.error ?? "Η συζήτηση δεν φορτώθηκε.");
      setThreads((current) => ({ ...current, [requestReference]: payload.messages }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η συζήτηση δεν φορτώθηκε.");
    } finally {
      setThreadBusy("");
    }
  }

  async function replyToThread(requestReference: string, form: HTMLFormElement) {
    const data = new FormData(form);
    const reply = String(data.get("reply") ?? "").trim();
    setThreadBusy(requestReference);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/account/ask-local/clarifications", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ requestId: requestReference, reply })
      });
      const payload = await response.json() as { messages?: readonly ThreadMessage[]; requests?: readonly CustomerAskLocalRequestView[]; error?: string };
      if (!response.ok || !payload.messages || !payload.requests) throw new Error(payload.error ?? "Η απάντηση δεν στάλθηκε.");
      setThreads((current) => ({ ...current, [requestReference]: payload.messages }));
      setRequests(payload.requests);
      form.reset();
      setMessage("Η απάντηση στάλθηκε στο κατάστημα.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η απάντηση δεν στάλθηκε.");
    } finally {
      setThreadBusy("");
    }
  }

  async function cancel(requestReference: string) {
    if (!window.confirm("Να ακυρωθεί αυτό το Ask Local αίτημα; Τυχόν ενεργή προσφορά θα ανακληθεί.")) return;
    setBusy(`cancel:${requestReference}`);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/account/ask-local/cancel", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ requestReference })
      });
      const payload = await response.json() as { requests?: readonly CustomerAskLocalRequestView[]; error?: string };
      if (!response.ok || !payload.requests) throw new Error(payload.error ?? "Το αίτημα δεν ακυρώθηκε.");
      setRequests(payload.requests);
      setMessage(`Το αίτημα ${requestReference} ακυρώθηκε.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Το αίτημα δεν ακυρώθηκε.");
    } finally {
      setBusy("");
    }
  }

  return <section className="shell ask-local-action-center" aria-labelledby="ask-local-actions-title">
    <div className="ask-local-action-panel">
      <div>
        <div className="eyebrow">Χρειάζεται η απόφασή σου</div>
        <h2 id="ask-local-actions-title">Έχεις ενεργά Ask Local.</h2>
        <p>Ό,τι χρειάζεται τη δική σου απόφαση εμφανίζεται εδώ πρώτο.</p>
      </div>
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {message ? <div className="checkout-result success" role="status">{message}</div> : null}
      <div className="ask-local-action-list">
        {visible.map((request) => {
          const activeOffer = request.privateOffers.find((offer) => offer.status === "active" && offer.expiresAt > Date.now());
          const acceptedOffer = request.privateOffers.find((offer) => offer.status === "accepted");
          return <article key={request.referenceNumber} className="ask-local-action-card">
            <div className="ask-local-action-head">
              <div><strong>{request.referenceNumber}</strong><p>{request.need}</p></div>
              <span className="status-pill">{request.status === "accepted" ? "Αποδεκτή" : activeOffer ? "Νέα προσφορά" : "Ενεργό αίτημα"}</span>
            </div>
            {activeOffer ? <div className="ask-local-action-offer">
              <div className="ask-local-offer-price"><strong>{money(activeOffer.priceMinor)}</strong><small>Ισχύει έως {when(activeOffer.expiresAt)}</small></div>
              {activeOffer.fulfilmentPromise ? <p>{activeOffer.fulfilmentPromise}</p> : null}
              <div className="ask-local-offer-actions">
                <button className="button" type="button" disabled={Boolean(busy)} onClick={() => void decide(request, activeOffer.actionReference, "accept")}>{busy === `accept:${activeOffer.actionReference}` ? "Αποδοχή…" : "Αποδοχή & checkout"}</button>
                <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => void decide(request, activeOffer.actionReference, "decline")}>{busy === `decline:${activeOffer.actionReference}` ? "Απόρριψη…" : "Απόρριψη"}</button>
              </div>
            </div> : null}
            {request.status === "accepted" && acceptedOffer ? <div className="ask-local-action-offer">
              <strong>Η προσφορά σου είναι αποδεκτή.</strong>
              <p>{money(acceptedOffer.priceMinor)} · ολοκλήρωσε την αγορά με τη συμφωνημένη τιμή και το συγκεκριμένο κατάστημα.</p>
              {request.canonicalVariantId ? <a className="button" href={`/checkout/private-offer/${encodeURIComponent(acceptedOffer.actionReference)}`}>Συνέχεια στο checkout</a> : <p className="form-error">Η παλαιότερη αυτή προσφορά δεν είχε συνδεθεί με συγκεκριμένο προϊόν. Το κατάστημα πρέπει να την ανανεώσει πριν γίνει online αγορά.</p>}
            </div> : null}
            <details className="workspace-tool-panel" style={{ marginTop: 12 }} onToggle={(event) => { if (event.currentTarget.open) void loadThread(request.referenceNumber); }}>
              <summary><span><strong>Συζήτηση με το κατάστημα</strong><small>{request.status === "needs_info" ? "Χρειάζεται η απάντησή σου." : "Δες μηνύματα και φωτογραφίες."}</small></span></summary>
              <div className="workspace-tool-body">
                {threadBusy === request.referenceNumber && !threads[request.referenceNumber] ? <p className="workspace-queue-summary">Φόρτωση…</p> : null}
                {threads[request.referenceNumber]?.length ? <div className="workspace-compact-list">{threads[request.referenceNumber]!.map((item) => <div className="workspace-compact-row" key={item.id}>
                  <strong>{item.senderType === "vendor" ? "Κατάστημα" : item.senderType === "customer" ? "Εσύ" : "KONTA MOY"}</strong>
                  <span>{item.body}</span>
                  {item.imageDataUrl ? <Image src={item.imageDataUrl} alt="Φωτογραφία στη συζήτηση Ask Local" width={420} height={315} unoptimized style={{ width: "min(100%, 320px)", height: "auto", borderRadius: 12, marginTop: 6 }} /> : null}
                  <small>{when(item.createdAt)}</small>
                </div>)}</div> : threadBusy !== request.referenceNumber ? <p className="workspace-queue-summary">Δεν υπάρχουν ακόμη μηνύματα.</p> : null}
                {request.status === "needs_info" ? <form style={{ display: "grid", gap: 8, marginTop: 12 }} onSubmit={(event) => { event.preventDefault(); void replyToThread(request.referenceNumber, event.currentTarget); }}>
                  <label style={{ display: "grid", gap: 5 }}><span style={{ fontSize: 12, fontWeight: 800 }}>Η απάντησή σου</span><textarea name="reply" required minLength={3} maxLength={2000} rows={3} placeholder="Γράψε τη διευκρίνιση…" style={{ border: "1px solid rgba(23,25,20,.16)", borderRadius: 12, padding: 12, font: "inherit" }} /></label>
                  <button className="button" type="submit" disabled={threadBusy === request.referenceNumber}>{threadBusy === request.referenceNumber ? "Αποστολή…" : "Αποστολή απάντησης"}</button>
                </form> : null}
              </div>
            </details>
            {cancellable.has(request.status) ? <div className="ask-local-cancel"><button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => void cancel(request.referenceNumber)}>{busy === `cancel:${request.referenceNumber}` ? "Ακύρωση…" : "Ακύρωση αιτήματος"}</button></div> : null}
          </article>;
        })}
      </div>
    </div>
  </section>;
}
