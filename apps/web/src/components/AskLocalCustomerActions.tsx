"use client";

import { useMemo, useState } from "react";
import type { CustomerAskLocalRequestView } from "../lib/customer-ask-local-view";

const cancellable = new Set(["submitted", "matched", "assigned", "awaiting_vendor", "needs_info", "offered"]);

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

  return <section className="shell" style={{ paddingTop: 18, paddingBottom: 4 }} aria-labelledby="ask-local-actions-title">
    <div style={{ border: "1px solid rgba(23,25,20,.1)", borderRadius: 22, background: "#fff", padding: "18px", display: "grid", gap: 14 }}>
      <div>
        <div className="eyebrow">Χρειάζεται η απόφασή σου</div>
        <h2 id="ask-local-actions-title" style={{ margin: "4px 0 6px" }}>Ask Local · ενεργά αιτήματα</h2>
        <p style={{ margin: 0, opacity: .68 }}>Αποδέξου ή απόρριψε μία προσφορά, συνέχισε στο checkout ή ακύρωσε ένα αίτημα που δεν χρειάζεσαι πλέον.</p>
      </div>
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {message ? <div className="checkout-result success" role="status">{message}</div> : null}
      <div style={{ display: "grid", gap: 10 }}>
        {visible.map((request) => {
          const activeOffer = request.privateOffers.find((offer) => offer.status === "active" && offer.expiresAt > Date.now());
          const acceptedOffer = request.privateOffers.find((offer) => offer.status === "accepted");
          return <article key={request.referenceNumber} style={{ border: "1px solid rgba(23,25,20,.09)", borderRadius: 16, padding: 14, background: "#f8f7f2" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div><strong>{request.referenceNumber}</strong><div style={{ marginTop: 5, opacity: .72 }}>{request.need}</div></div>
              <span className="status-pill">{request.status === "accepted" ? "Αποδεκτή" : activeOffer ? "Νέα προσφορά" : "Ενεργό αίτημα"}</span>
            </div>
            {activeOffer ? <div style={{ marginTop: 12, borderRadius: 14, background: "#fff", padding: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><strong style={{ fontSize: 20 }}>{money(activeOffer.priceMinor)}</strong><small>Ισχύει έως {when(activeOffer.expiresAt)}</small></div>
              {activeOffer.fulfilmentPromise ? <p style={{ margin: "8px 0 0" }}>{activeOffer.fulfilmentPromise}</p> : null}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <button className="button" type="button" disabled={Boolean(busy)} onClick={() => void decide(request, activeOffer.actionReference, "accept")}>{busy === `accept:${activeOffer.actionReference}` ? "Αποδοχή…" : "Αποδοχή & checkout"}</button>
                <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => void decide(request, activeOffer.actionReference, "decline")}>{busy === `decline:${activeOffer.actionReference}` ? "Απόρριψη…" : "Απόρριψη"}</button>
              </div>
            </div> : null}
            {request.status === "accepted" && acceptedOffer ? <div style={{ marginTop: 12, borderRadius: 14, background: "#fff", padding: 13 }}>
              <strong>Η προσφορά σου είναι αποδεκτή.</strong>
              <p style={{ margin: "7px 0 10px", opacity: .72 }}>{money(acceptedOffer.priceMinor)} · ολοκλήρωσε την αγορά με τη συμφωνημένη τιμή και το συγκεκριμένο κατάστημα.</p>
              {request.canonicalVariantId ? <a className="button" href={`/checkout/private-offer/${encodeURIComponent(acceptedOffer.actionReference)}`}>Συνέχεια στο checkout</a> : <p className="form-error">Η παλαιότερη αυτή προσφορά δεν είχε συνδεθεί με συγκεκριμένο προϊόν. Το κατάστημα πρέπει να την ανανεώσει πριν γίνει online αγορά.</p>}
            </div> : null}
            {cancellable.has(request.status) ? <div style={{ marginTop: 10 }}><button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => void cancel(request.referenceNumber)}>{busy === `cancel:${request.referenceNumber}` ? "Ακύρωση…" : "Ακύρωση αιτήματος"}</button></div> : null}
          </article>;
        })}
      </div>
    </div>
  </section>;
}
