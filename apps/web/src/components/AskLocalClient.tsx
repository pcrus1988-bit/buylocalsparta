"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { AskLocalClarificationClient } from "./AskLocalClarificationClient";
import { AskLocalRichCapture } from "./AskLocalRichCapture";
import { CustomerHowItWorks, CustomerLifecycle, type CustomerLifecycleStage } from "./CustomerAccountPrimitives";
import type { CustomerAskLocalRequestView } from "../lib/customer-ask-local-view";

type Context = Readonly<{ need?: string; canonicalVariantId?: string; preferredVendorId?: string; sourceUrl?: string }>;
const labels: Record<string, string> = { submitted: "Σε έλεγχο από την πλατφόρμα", assigned: "Ανατέθηκε ιδιωτικά", awaiting_vendor: "Αναμονή απάντησης καταστήματος", needs_info: "Χρειάζονται πληροφορίες", offered: "Έχει σταλεί ιδιωτική προσφορά", active: "Ενεργή", accepted: "Αποδεκτή προσφορά", converted: "Μετατράπηκε σε αγορά", declined: "Απορρίφθηκε", expired: "Έληξε", revoked: "Αντικαταστάθηκε", closed: "Ολοκληρώθηκε" };
const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function requestLifecycle(status: string): readonly CustomerLifecycleStage[] {
  const stages = ["Αίτημα", "Ανάθεση", "Απάντηση καταστήματος", "Προσφορά / διευκρίνιση", "Απόφαση", "Ολοκλήρωση"];
  const terminal = status === "converted" || status === "closed";
  const cancelled = status === "declined" || status === "expired";
  let current = 1;
  if (["assigned", "awaiting_vendor"].includes(status)) current = 2;
  if (["needs_info", "offered"].includes(status)) current = 3;
  if (status === "accepted") current = 4;
  if (terminal || cancelled) current = 5;
  return stages.map((label, index) => {
    if (terminal) return { label, state: "done" as const };
    if (cancelled && index === current) return { label, state: "cancelled" as const };
    if (index < current) return { label, state: "done" as const };
    if (index > current) return { label, state: "pending" as const };
    if (status === "needs_info" || status === "offered") return { label, state: "action" as const };
    return { label, state: "current" as const };
  });
}

function requestNeed(form: FormData) {
  const typed = String(form.get("need") ?? "").trim();
  if (typed) return typed;
  const voice = String(form.get("voiceTranscript") ?? "").trim();
  if (voice) return voice;
  const barcode = String(form.get("barcode") ?? "").trim();
  if (barcode) return `Θέλω να βρω το προϊόν ή ανταλλακτικό με κωδικό ${barcode}.`;
  if (String(form.get("referenceImageDataUrl") ?? "")) return "Θέλω βοήθεια για να αναγνωρίσω και να βρω το προϊόν ή ανταλλακτικό της φωτογραφίας.";
  return "";
}

export function AskLocalClient({ csrfToken, initial, context }: { csrfToken: string; initial: readonly CustomerAskLocalRequestView[]; context: Context }) {
  const [requests, setRequests] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [captureResetKey, setCaptureResetKey] = useState(0);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError("");
    setSuccess("");
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/account/ask-local", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          need: requestNeed(form),
          postcode: form.get("postcode"),
          quantity: Number(form.get("quantity")),
          sourceUrl: form.get("sourceUrl"),
          canonicalVariantId: context.canonicalVariantId,
          preferredVendorId: context.preferredVendorId,
          category: form.get("category"),
          voiceTranscript: form.get("voiceTranscript"),
          barcode: form.get("barcode"),
          referenceImageDataUrl: form.get("referenceImageDataUrl"),
          captureSource: form.get("captureSource")
        })
      });
      const payload = await response.json() as { request?: CustomerAskLocalRequestView; error?: string };
      if (!response.ok || !payload.request) throw new Error(payload.error ?? "Το αίτημα δεν ολοκληρώθηκε");
      setRequests((current) => [payload.request!, ...current]);
      setSuccess(`Το αίτημα ${payload.request.referenceNumber} καταχωρίστηκε ιδιωτικά.`);
      formElement.reset();
      setCaptureResetKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Το αίτημα δεν ολοκληρώθηκε");
    } finally {
      setBusy(false);
    }
  }

  async function decideOffer(actionReference: string, action: "accept" | "decline") {
    setDecisionBusy(`${action}:${actionReference}`);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/account/ask-local/offers", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ actionReference, action })
      });
      const payload = await response.json() as { requests?: readonly CustomerAskLocalRequestView[]; error?: string };
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
        <div className="ask-local-full"><div className="eyebrow">Ask Local 2.0 · ιδιωτική αναζήτηση</div><h2>Τι ψάχνεις;</h2><p>Γράψε, μίλησε, φωτογράφισε ή πρόσθεσε barcode. Το ΚΟΝΤΑ ΜΟΥ κρατά το αίτημα ιδιωτικό και το δρομολογεί μόνο εκεί που πρέπει.</p><CustomerHowItWorks title="Τι συμβαίνει μετά την αποστολή;"><p>Το αίτημα καταχωρίζεται, δρομολογείται ιδιωτικά και εμφανίζει την πορεία του παρακάτω. Όταν υπάρχει συνδεδεμένο προϊόν, η ανάθεση συνεχίζει να χρησιμοποιεί τη δίκαιη μηχανή επιλογής. Η φωτογραφία δεν γίνεται δημόσιο περιεχόμενο.</p></CustomerHowItWorks></div>
        <label className="ask-local-full"><span>Περιγραφή — ή χρησιμοποίησε φωνή / φωτογραφία / barcode παρακάτω</span><textarea name="need" maxLength={2000} defaultValue={context.need} placeholder="π.χ. Χρειάζομαι αυτό το μικρό πλαστικό εξάρτημα για πλυντήριο. Δεν ξέρω πώς λέγεται." /></label>
        <AskLocalRichCapture key={captureResetKey} />
        <label><span>Ταχυδρομικός κώδικας</span><input name="postcode" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} defaultValue="23100" required /></label>
        <label><span>Ποσότητα</span><input name="quantity" type="number" min={1} max={99} defaultValue={1} required /></label>
        <label><span>Κατηγορία (προαιρετικά)</span><input name="category" maxLength={100} placeholder="π.χ. ανταλλακτικό, παιχνίδι, εργαλείο" /></label>
        <label><span>Σύνδεσμος αναφοράς</span><input name="sourceUrl" type="url" maxLength={2000} defaultValue={context.sourceUrl} placeholder="https://…" /></label>
        {context.canonicalVariantId ? <div className="ask-local-context">Το αίτημα συνδέεται με προϊόν από τη σελίδα που άνοιξες.</div> : null}
        {context.preferredVendorId && !context.canonicalVariantId ? <div className="ask-local-context">Το αίτημα ξεκίνησε από επιλεγμένο κατάστημα.</div> : null}
        {error ? <div className="form-error ask-local-full" role="alert">{error}</div> : null}
        {success ? <div className="checkout-result success ask-local-full" role="status">{success}</div> : null}
        <button className="button ask-local-submit" disabled={busy} type="submit">{busy ? "Αποστολή…" : "Βρες το για μένα στη Σπάρτη"}</button>
      </form>
    </section>
    <section className="shell section" aria-labelledby="requests-title">
      <div className="section-heading"><div><div className="eyebrow">Τα αιτήματά μου</div><h2 id="requests-title">Ιδιωτική εξέλιξη</h2></div><p className="section-note">Η ανάθεση, οι διευκρινίσεις, η φωτογραφία αναφοράς και οι προσφορές εμφανίζονται μόνο στον λογαριασμό σου και στους εξουσιοδοτημένους χειριστές του αιτήματος.</p></div>
      {requests.length ? <div className="ask-request-list">{requests.map((request) => <article className="ask-request-card" key={request.referenceNumber}>
        <div className="ask-request-head"><div><strong>{request.referenceNumber}</strong><small>{date(request.createdAt)}</small></div><span className="status-pill">{labels[request.status] ?? request.status}</span></div>
        <p>{request.need}</p>
        {request.voiceTranscript ? <p className="account-muted"><strong>Φωνητική σημείωση:</strong> {request.voiceTranscript}</p> : null}
        {request.referenceImageDataUrl ? <div className="ask-local-context"><Image src={request.referenceImageDataUrl} alt={`Φωτογραφία αναφοράς ${request.referenceNumber}`} width={320} height={240} unoptimized /></div> : null}
        <div className="ask-request-meta"><span>{request.quantity} τεμ.</span><span>ΤΚ {request.postcode}</span>{request.barcode ? <span>Κωδικός {request.barcode}</span> : null}{request.assignedVendorName ? <span>Ιδιωτικά προς {request.assignedVendorName}</span> : null}{request.responseDueAt && request.status === "awaiting_vendor" ? <span>Απάντηση έως {date(request.responseDueAt)}</span> : null}</div>
        <CustomerLifecycle label={`Πορεία Ask Local ${request.referenceNumber}`} stages={requestLifecycle(request.status)} />
        {request.status === "awaiting_vendor" ? <p className="account-muted">Περιμένουμε απάντηση από το κατάστημα. Δεν χρειάζεται ενέργεια από εσένα τώρα.</p> : null}
        {request.status === "needs_info" ? <p className="account-muted"><strong>Χρειάζεται διευκρίνιση από εσένα.</strong> Δες την ερώτηση του καταστήματος και απάντησε μέσα από το ίδιο αίτημα.</p> : null}
        {(request.status === "needs_info" || (request.clarificationCount ?? 0) > 0) ? <AskLocalClarificationClient requestId={request.referenceNumber} status={request.status} clarificationCount={request.clarificationCount ?? 0} csrfToken={csrfToken} onRequestsChanged={setRequests} /> : null}
        {request.status === "offered" ? <p className="account-muted"><strong>Υπάρχει νέα ιδιωτική προσφορά.</strong> Έλεγξε τι περιλαμβάνει, την τελική τιμή και μέχρι πότε ισχύει πριν αποφασίσεις.</p> : null}
        {request.privateOffers.length > 0 ? <div className="private-offer-list">{request.privateOffers.map((offer) => {
          const active = offer.status === "active" && offer.expiresAt > Date.now() && request.status === "offered";
          const actionReference = offer.actionReference;
          const offerKey = `${request.referenceNumber}:${offer.expiresAt}:${offer.priceMinor}:${offer.status}`;
          return <div key={offerKey} className={active ? "customer-private-offer is-active" : "customer-private-offer"}>
            <strong>{new Intl.NumberFormat("el-GR", { style: "currency", currency: offer.currency }).format(offer.priceMinor / 100)} / τεμ.</strong>
            <span>{offer.fulfilmentPromise ?? "Ιδιωτική προσφορά"}</span>
            <small>{labels[offer.status] ?? offer.status} · έως {date(offer.expiresAt)}</small>
            {active ? <div className="customer-private-offer-actions"><button className="button button-secondary" type="button" disabled={Boolean(decisionBusy)} onClick={() => void decideOffer(actionReference, "decline")}>{decisionBusy === `decline:${actionReference}` ? "Απόρριψη…" : "Δεν με ενδιαφέρει"}</button><button className="button" type="button" disabled={Boolean(decisionBusy)} onClick={() => void decideOffer(actionReference, "accept")}>{decisionBusy === `accept:${actionReference}` ? "Αποδοχή…" : "Αποδέχομαι την προσφορά"}</button></div> : null}
            {offer.status === "accepted" ? <div className="customer-private-offer-result"><strong>Αποδεκτή</strong>{request.canonicalVariantId ? <><span>Η ειδική τιμή μπορεί να περάσει σε checkout χωρίς να αντικατασταθεί από την τιμή καταλόγου. Η τελική επιβεβαίωση ελέγχει ξανά το συγκεκριμένο κατάστημα, pickup και το πραγματικό απόθεμα.</span><Link className="button" href={`/checkout/private-offer/${encodeURIComponent(actionReference)}`}>Ολοκλήρωση αγοράς</Link></> : <span>Το κατάστημα ενημερώθηκε. Για online αγορά χρειάζεται πρώτα η προσφορά να συνδεθεί με συγκεκριμένο προϊόν και εγκεκριμένο απόθεμα.</span>}</div> : null}
            {offer.status === "converted" ? <div className="customer-private-offer-result"><strong>Έγινε παραγγελία</strong><span>Η ειδική τιμή έχει ήδη δεσμευτεί σε παραγγελία.</span><Link className="text-link" href="/account/orders">Δες τις παραγγελίες →</Link></div> : null}
          </div>;
        })}</div> : null}
        <div className="customer-context-actions"><Link className="text-link" href={`/account/support?context=ask_local&id=${encodeURIComponent(request.referenceNumber)}&label=${encodeURIComponent(`Ask Local ${request.referenceNumber}`)}&subject=${encodeURIComponent(`Βοήθεια με το Ask Local ${request.referenceNumber}`)}`}>Χρειάζομαι βοήθεια με αυτό το αίτημα →</Link></div>
        <CustomerHowItWorks title="Τι σημαίνει η τρέχουσα κατάσταση;"><p>Η πορεία δείχνει τι ολοκληρώθηκε και ποιος έχει το επόμενο βήμα. Πορτοκαλί σημαίνει ότι το αίτημα έχει φτάσει σε σημείο όπου χρειάζεται δική σου απόφαση ή πληροφορία. Όταν απαντάς σε διευκρίνιση, το αίτημα επιστρέφει αυτόματα στο κατάστημα με νέα προθεσμία.</p></CustomerHowItWorks>
      </article>)}</div> : <div className="empty-state"><h2>Δεν έχεις ακόμη Ask Local αιτήματα.</h2><p>Το πρώτο σου αίτημα θα εμφανιστεί εδώ με την ιδιωτική του κατάσταση.</p></div>}
    </section>
  </>;
}
