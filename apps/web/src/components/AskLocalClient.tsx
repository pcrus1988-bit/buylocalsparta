"use client";

import Link from "next/link";
import { useState } from "react";
import { AskLocalClarificationClient } from "./AskLocalClarificationClient";
import { CustomerHowItWorks, CustomerLifecycle, type CustomerLifecycleStage } from "./CustomerAccountPrimitives";
import type { AskLocalRequestView } from "../lib/ask-local-service";

type Context = Readonly<{ need?: string; canonicalVariantId?: string; preferredVendorId?: string; sourceUrl?: string }>;
const labels: Record<string, string> = { submitted: "Σε έλεγχο από την πλατφόρμα", assigned: "Ανατέθηκε ιδιωτικά", awaiting_vendor: "Αναμονή απάντησης καταστήματος", needs_info: "Χρειάζονται πληροφορίες", offered: "Έχει σταλεί ιδιωτική προσφορά", active: "Ενεργή", accepted: "Αποδεκτή προσφορά", converted: "Μετατράπηκε σε αγορά", declined: "Απορρίφθηκε", expired: "Έληξε", revoked: "Αντικαταστάθηκε", closed: "Ολοκληρώθηκε" };
const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function requestLifecycle(status: string): readonly CustomerLifecycleStage[] {
  const labels = ["Αίτημα", "Ανάθεση", "Απάντηση καταστήματος", "Προσφορά / διευκρίνιση", "Απόφαση", "Ολοκλήρωση"];
  const terminal = status === "converted" || status === "closed";
  const cancelled = status === "declined" || status === "expired";
  let current = 1;
  if (["assigned", "awaiting_vendor"].includes(status)) current = 2;
  if (["needs_info", "offered"].includes(status)) current = 3;
  if (status === "accepted") current = 4;
  if (terminal || cancelled) current = 5;
  return labels.map((label, index) => {
    if (terminal) return { label, state: "done" as const };
    if (cancelled && index === current) return { label, state: "cancelled" as const };
    if (index < current) return { label, state: "done" as const };
    if (index > current) return { label, state: "pending" as const };
    if (status === "needs_info" || status === "offered") return { label, state: "action" as const };
    return { label, state: "current" as const };
  });
}

export function AskLocalClient({ csrfToken, initial, context }: { csrfToken: string; initial: readonly AskLocalRequestView[]; context: Context }) {
  const [requests, setRequests] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError("");
    setSuccess("");
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/account/ask-local", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify({ need: form.get("need"), postcode: form.get("postcode"), quantity: Number(form.get("quantity")), sourceUrl: form.get("sourceUrl"), canonicalVariantId: context.canonicalVariantId, preferredVendorId: context.preferredVendorId, category: form.get("category") }) });
      const payload = await response.json() as { request?: AskLocalRequestView; error?: string };
      if (!response.ok || !payload.request) throw new Error(payload.error ?? "Το αίτημα δεν ολοκληρώθηκε");
      setRequests((current) => [payload.request!, ...current]);
      setSuccess(`Το αίτημα ${payload.request.referenceNumber} καταχωρίστηκε ιδιωτικά.`);
      formElement.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Το αίτημα δεν ολοκληρώθηκε");
    } finally {
      setBusy(false);
    }
  }

  async function decideOffer(offerId: string, action: "accept" | "decline") {
    setDecisionBusy(`${action}:${offerId}`);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/account/ask-local/offers", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ offerId, action })
      });
      const payload = await response.json() as { requests?: readonly AskLocalRequestView[]; error?: string };
      if (!response.ok || !payload.requests) throw new Error(payload.error ?? "Η απόφαση δεν αποθηκεύτηκε");
      setRequests(payload.requests);
      setSuccess(action === "accept" ? "Η προσφορά έγινε αποδεκτή και το κατάστημα ενημερώθηκε." : "Η προσφορά απορρίφθηκε και το κατάστημα ενημερώθηκε.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Η απόφαση δεν αποθηκεύτηκε");
    } finally {
      setDecisionBusy("");
    }
  }

  return <>
    <section className="shell ask-local-workspace">
      <form className="ask-local-live-form" onSubmit={submit}>
        <div className="ask-local-full"><div className="eyebrow">Νέο ιδιωτικό αίτημα</div><h2>Τι ψάχνεις;</h2><p>Περιέγραψε προϊόν, χρήση, budget ή συμβουλή. Το αίτημα δεν δημοσιεύεται σε πολλούς συνεργάτες.</p><CustomerHowItWorks title="Τι συμβαίνει μετά την αποστολή;"><p>Το αίτημα καταχωρίζεται, δρομολογείται ιδιωτικά και εμφανίζει την πορεία του παρακάτω. Όταν περιμένουμε κατάστημα δεν χρειάζεται να κάνεις κάτι· όταν χρειάζεται διευκρίνιση ή υπάρχει προσφορά, η κατάσταση επισημαίνεται.</p></CustomerHowItWorks></div>
        <label className="ask-local-full"><span>Περιγραφή</span><textarea name="need" minLength={10} maxLength={2000} required defaultValue={context.need} placeholder="π.χ. Θέλω δώρο για παιδί 8 ετών, έως 35€." /></label>
        <label><span>Ταχυδρομικός κώδικας</span><input name="postcode" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} defaultValue="23100" required /></label>
        <label><span>Ποσότητα</span><input name="quantity" type="number" min={1} max={99} defaultValue={1} required /></label>
        <label><span>Κατηγορία (προαιρετικά)</span><input name="category" maxLength={100} placeholder="π.χ. παιχνίδι" /></label>
        <label><span>Σύνδεσμος αναφοράς</span><input name="sourceUrl" type="url" maxLength={2000} defaultValue={context.sourceUrl} placeholder="https://…" /></label>
        {context.canonicalVariantId && <div className="ask-local-context">Το αίτημα συνδέεται με προϊόν από τη σελίδα που άνοιξες.</div>}
        {context.preferredVendorId && !context.canonicalVariantId && <div className="ask-local-context">Το αίτημα ξεκίνησε από επιλεγμένο κατάστημα.</div>}
        {error && <div className="form-error ask-local-full" role="alert">{error}</div>}
        {success && <div className="checkout-result success ask-local-full" role="status">{success}</div>}
        <button className="button ask-local-submit" disabled={busy} type="submit">{busy ? "Αποστολή…" : "Αποστολή ιδιωτικού αιτήματος"}</button>
      </form>
    </section>
    <section className="shell section" aria-labelledby="requests-title">
      <div className="section-heading"><div><div className="eyebrow">Τα αιτήματά μου</div><h2 id="requests-title">Ιδιωτική εξέλιξη</h2></div><p className="section-note">Η ανάθεση, οι διευκρινίσεις και οι προσφορές εμφανίζονται μόνο στον λογαριασμό σου.</p></div>
      {requests.length ? <div className="ask-request-list">{requests.map((request) => <article className="ask-request-card" key={request.referenceNumber}>
        <div className="ask-request-head"><div><strong>{request.referenceNumber}</strong><small>{date(request.createdAt)}</small></div><span className="status-pill">{labels[request.status] ?? request.status}</span></div>
        <p>{request.need}</p>
        <div className="ask-request-meta"><span>{request.quantity} τεμ.</span><span>ΤΚ {request.postcode}</span>{request.assignedVendorName && <span>Ιδιωτικά προς {request.assignedVendorName}</span>}{request.responseDueAt && request.status === "awaiting_vendor" && <span>Απάντηση έως {date(request.responseDueAt)}</span>}</div>
        <CustomerLifecycle label={`Πορεία Ask Local ${request.referenceNumber}`} stages={requestLifecycle(request.status)} />
        {request.status === "awaiting_vendor" && <p className="account-muted">Περιμένουμε απάντηση από το κατάστημα. Δεν χρειάζεται ενέργεια από εσένα τώρα.</p>}
        {request.status === "needs_info" && <p className="account-muted"><strong>Χρειάζεται διευκρίνιση από εσένα.</strong> Δες την ερώτηση του καταστήματος και απάντησε μέσα από το ίδιο αίτημα.</p>}
        {(request.status === "needs_info" || (request.clarificationCount ?? 0) > 0) && <AskLocalClarificationClient requestId={request.referenceNumber} status={request.status} clarificationCount={request.clarificationCount ?? 0} csrfToken={csrfToken} onRequestsChanged={setRequests} />}
        {request.status === "offered" && <p className="account-muted"><strong>Υπάρχει νέα ιδιωτική προσφορά.</strong> Έλεγξε τι περιλαμβάνει, την τελική τιμή και μέχρι πότε ισχύει πριν αποφασίσεις.</p>}
        {request.privateOffers.length > 0 && <div className="private-offer-list">{request.privateOffers.map((offer) => {
          const active = offer.status === "active" && offer.expiresAt > Date.now() && request.status === "offered";
          return <div key={offer.id} className={active ? "customer-private-offer is-active" : "customer-private-offer"}>
            <strong>{new Intl.NumberFormat("el-GR", { style: "currency", currency: offer.currency }).format(offer.priceMinor / 100)} / τεμ.</strong>
            <span>{offer.fulfilmentPromise ?? "Ιδιωτική προσφορά"}</span>
            <small>{labels[offer.status] ?? offer.status} · έως {date(offer.expiresAt)}</small>
            {active && <div className="customer-private-offer-actions"><button className="button button-secondary" type="button" disabled={Boolean(decisionBusy)} onClick={() => void decideOffer(offer.id, "decline")}>{decisionBusy === `decline:${offer.id}` ? "Απόρριψη…" : "Δεν με ενδιαφέρει"}</button><button className="button" type="button" disabled={Boolean(decisionBusy)} onClick={() => void decideOffer(offer.id, "accept")}>{decisionBusy === `accept:${offer.id}` ? "Αποδοχή…" : "Αποδέχομαι την προσφορά"}</button></div>}
            {offer.status === "accepted" && <div className="customer-private-offer-result"><strong>Αποδεκτή</strong>{request.canonicalVariantId ? <><span>Η ειδική τιμή μπορεί να περάσει σε checkout χωρίς να αντικατασταθεί από την τιμή καταλόγου. Η τελική επιβεβαίωση ελέγχει ξανά το συγκεκριμένο κατάστημα, pickup και το πραγματικό απόθεμα.</span><Link className="button" href={`/checkout/private-offer/${encodeURIComponent(offer.id)}`}>Ολοκλήρωση αγοράς</Link></> : <span>Το κατάστημα ενημερώθηκε. Για online αγορά χρειάζεται πρώτα η προσφορά να συνδεθεί με συγκεκριμένο προϊόν και εγκεκριμένο απόθεμα.</span>}</div>}
            {offer.status === "converted" && <div className="customer-private-offer-result"><strong>Έγινε παραγγελία</strong><span>Η ειδική τιμή έχει ήδη δεσμευτεί σε παραγγελία.</span><Link className="text-link" href="/account/orders">Δες τις παραγγελίες →</Link></div>}
          </div>;
        })}</div>}
        <div className="customer-context-actions"><Link className="text-link" href={`/account/support?context=ask_local&id=${encodeURIComponent(request.referenceNumber)}&label=${encodeURIComponent(`Ask Local ${request.referenceNumber}`)}&subject=${encodeURIComponent(`Βοήθεια με το Ask Local ${request.referenceNumber}`)}`}>Χρειάζομαι βοήθεια με αυτό το αίτημα →</Link></div>
        <CustomerHowItWorks title="Τι σημαίνει η τρέχουσα κατάσταση;"><p>Η πορεία δείχνει τι ολοκληρώθηκε και ποιος έχει το επόμενο βήμα. Πορτοκαλί σημαίνει ότι το αίτημα έχει φτάσει σε σημείο όπου χρειάζεται δική σου απόφαση ή πληροφορία. Όταν απαντάς σε διευκρίνιση, το αίτημα επιστρέφει αυτόματα στο κατάστημα με νέα προθεσμία.</p></CustomerHowItWorks>
      </article>)}</div> : <div className="empty-state"><h2>Δεν έχεις ακόμη Ask Local αιτήματα.</h2><p>Το πρώτο σου αίτημα θα εμφανιστεί εδώ με την ιδιωτική του κατάσταση.</p></div>}
    </section>
  </>;
}