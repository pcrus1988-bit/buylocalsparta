"use client";

import { useState } from "react";
import type { AskLocalEntryMode, AskLocalRequestView, AskLocalVendorCandidate } from "../lib/ask-local-service";
import { STOREFRONT_CATEGORIES } from "../lib/storefront-taxonomy";

type Context = Readonly<{ need?: string; canonicalVariantId?: string; preferredVendorId?: string; sourceUrl?: string }>;
const labels: Record<string, string> = { submitted: "Σε έλεγχο από την πλατφόρμα", assigned: "Ανατέθηκε ιδιωτικά", awaiting_vendor: "Αναμονή απάντησης καταστήματος", needs_info: "Χρειάζονται πληροφορίες", offered: "Έχει σταλεί ιδιωτική προσφορά", accepted: "Αποδεκτή προσφορά", converted: "Μετατράπηκε σε αγορά", declined: "Επιστράφηκε για νέα ανάθεση", expired: "Έληξε", closed: "Ολοκληρώθηκε" };
const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function entryModeFor(context: Context, category: string): AskLocalEntryMode {
  if (context.canonicalVariantId) return "product";
  if (category) return "category";
  if (context.preferredVendorId) return "vendor";
  return "search";
}

export function AskLocalClient({ csrfToken, initial, context }: { csrfToken: string; initial: readonly AskLocalRequestView[]; context: Context }) {
  const [requests, setRequests] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [category, setCategory] = useState("");
  const [vendors, setVendors] = useState<readonly AskLocalVendorCandidate[]>([]);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState("");

  async function chooseCategory(value: string) {
    setCategory(value);
    setSelectedVendorId("");
    setVendors([]);
    setError("");
    if (!value) return;
    setVendorLoading(true);
    try {
      const response = await fetch(`/api/account/ask-local/vendors?category=${encodeURIComponent(value)}`, { cache: "no-store" });
      const payload = await response.json() as { vendors?: readonly AskLocalVendorCandidate[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Δεν ήταν δυνατή η εύρεση συμβούλων");
      setVendors(payload.vendors ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η εύρεση συμβούλων");
    } finally {
      setVendorLoading(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true); setError(""); setSuccess("");
    const form = new FormData(formElement);
    const mode = entryModeFor(context, category);
    try {
      const response = await fetch("/api/account/ask-local", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          need: form.get("need"),
          postcode: form.get("postcode"),
          quantity: Number(form.get("quantity")),
          sourceUrl: form.get("sourceUrl"),
          canonicalVariantId: context.canonicalVariantId,
          preferredVendorId: mode === "category" ? selectedVendorId || undefined : context.preferredVendorId,
          category: category || undefined,
          entryMode: mode
        })
      });
      const payload = await response.json() as { request?: AskLocalRequestView; error?: string };
      if (!response.ok || !payload.request) throw new Error(payload.error ?? "Το αίτημα δεν ολοκληρώθηκε");
      setRequests((current) => [payload.request!, ...current]);
      setSuccess(payload.request.routingOwner === "vendor"
        ? `Το αίτημα ${payload.request.id} καταχωρίστηκε και ανατέθηκε ιδιωτικά.`
        : `Το αίτημα ${payload.request.id} καταχωρίστηκε. Η πλατφόρμα το έχει ήδη στην ουρά διαχείρισης.`);
      formElement.reset();
      setCategory(""); setVendors([]); setSelectedVendorId("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Το αίτημα δεν ολοκληρώθηκε");
    } finally { setBusy(false); }
  }

  return <>
    <section className="shell ask-local-workspace">
      <form className="ask-local-live-form" onSubmit={submit}>
        <div className="ask-local-full">
          <div className="eyebrow">Νέο ιδιωτικό αίτημα</div>
          <h2>Τι ψάχνεις;</h2>
          <p>Γράψε απευθείας αυτό που χρειάζεσαι ή διάλεξε κατηγορία για να δεις κατάλληλους ενεργούς ανθρώπους της τοπικής αγοράς.</p>
        </div>

        <label className="ask-local-full"><span>Περιγραφή</span><textarea name="need" minLength={10} maxLength={2000} required defaultValue={context.need} placeholder="π.χ. Θέλω δώρο για παιδί 8 ετών, έως 35€." /></label>

        {!context.canonicalVariantId && !context.preferredVendorId && <label className="ask-local-full"><span>Κατηγορία (προαιρετικά)</span><select value={category} onChange={(event) => void chooseCategory(event.target.value)}><option value="">Δεν ξέρω / θέλω να το αναλάβει η πλατφόρμα</option>{STOREFRONT_CATEGORIES.map((item) => <option value={item.slug} key={item.slug}>{item.label}</option>)}</select></label>}

        {category && <div className="ask-local-full ask-local-context">
          <strong>Κατάλληλοι τοπικοί σύμβουλοι</strong>
          {vendorLoading ? <p>Έλεγχος ενεργών συνεργατών…</p> : vendors.length ? <>
            <p>Το σύστημα επέλεξε ενεργούς συνεργάτες που καλύπτουν την κατηγορία. Μπορείς να στείλεις το αίτημα απευθείας σε έναν από αυτούς ή να αφήσεις την πλατφόρμα να το αναλάβει.</p>
            <div className="ask-local-vendor-options">
              <label className={!selectedVendorId ? "is-selected" : undefined}><input type="radio" name="categoryVendor" value="" checked={!selectedVendorId} onChange={() => setSelectedVendorId("")} /><span><strong>Ανάθεση από την πλατφόρμα</strong><small>Το αίτημα πηγαίνει πρώτα στο Admin για εσωτερική διανομή.</small></span></label>
              {vendors.map((vendor) => <label className={selectedVendorId === vendor.id ? "is-selected" : undefined} key={vendor.id}><input type="radio" name="categoryVendor" value={vendor.id} checked={selectedVendorId === vendor.id} onChange={() => setSelectedVendorId(vendor.id)} /><span><strong>{vendor.adviser}</strong><small>{vendor.name}{vendor.locality ? ` · ${vendor.locality}` : ""}</small></span></label>)}
            </div>
          </> : <p><strong>Δεν υπάρχει αυτή τη στιγμή ενεργός κατάλληλος σύμβουλος.</strong> Το αίτημά σου δεν χάνεται: θα καταχωριστεί στην πλατφόρμα και θα διανεμηθεί εσωτερικά από το Admin.</p>}
        </div>}

        <label><span>Ταχυδρομικός κώδικας</span><input name="postcode" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} defaultValue="23100" required /></label>
        <label><span>Ποσότητα</span><input name="quantity" type="number" min={1} max={99} defaultValue={1} required /></label>
        <label className="ask-local-full"><span>Σύνδεσμος αναφοράς (προαιρετικά)</span><input name="sourceUrl" type="url" maxLength={2000} defaultValue={context.sourceUrl} placeholder="https://…" /></label>
        {context.canonicalVariantId && <div className="ask-local-context ask-local-full">Συνδεδεμένο προϊόν: <strong>{context.canonicalVariantId}</strong> · η υπάρχουσα δίκαιη ανάθεση εφαρμόζεται πρώτα και, αν δεν υπάρχει επιλέξιμος vendor, το αίτημα περνά στο Admin.</div>}
        {context.preferredVendorId && !context.canonicalVariantId && <div className="ask-local-context ask-local-full">Επιλεγμένο κατάστημα: <strong>{context.preferredVendorId}</strong> · αν δεν είναι πλέον ενεργό, η πλατφόρμα κρατά το αίτημα και το αναδιανέμει.</div>}
        {!context.canonicalVariantId && !context.preferredVendorId && !category && <div className="ask-local-context ask-local-full"><strong>Ελεύθερη αναζήτηση:</strong> το αίτημα καταχωρίζεται πρώτα στην ουρά Admin και μετά ανατίθεται ιδιωτικά σε επιλέξιμο vendor.</div>}
        {error && <div className="form-error ask-local-full" role="alert">{error}</div>}
        {success && <div className="checkout-result success ask-local-full" role="status">{success}</div>}
        <button className="button ask-local-submit" disabled={busy || vendorLoading} type="submit">{busy ? "Καταχώριση…" : "Αποστολή ιδιωτικού αιτήματος"}</button>
      </form>
    </section>

    <section className="shell section" aria-labelledby="requests-title">
      <div className="section-heading"><div><div className="eyebrow">Τα αιτήματά μου</div><h2 id="requests-title">Ιδιωτική εξέλιξη</h2></div><p className="section-note">Κάθε αίτημα έχει πάντα υπεύθυνη ουρά: πλατφόρμα ή έναν συγκεκριμένο ενεργό vendor.</p></div>
      {requests.length ? <div className="ask-request-list">{requests.map((request) => <article className="ask-request-card" key={request.id}>
        <div className="ask-request-head"><div><strong>{request.id}</strong><small>{date(request.createdAt)}</small></div><span className="status-pill">{labels[request.status] ?? request.status}</span></div>
        <p>{request.need}</p>
        <div className="ask-request-meta"><span>{request.quantity} τεμ.</span><span>ΤΚ {request.postcode}</span>{request.category && <span>Κατηγορία: {request.category}</span>}{request.routingOwner === "admin" ? <span>Υπεύθυνη: Πλατφόρμα</span> : request.assignedVendorName && <span>Ιδιωτικά προς {request.assignedAdviser ? `${request.assignedAdviser} · ` : ""}{request.assignedVendorName}</span>}{request.responseDueAt && <span>Απάντηση έως {date(request.responseDueAt)}</span>}</div>
        {request.privateOffers.length > 0 && <div className="private-offer-list">{request.privateOffers.map((offer) => <div key={offer.id}><strong>{new Intl.NumberFormat("el-GR", { style: "currency", currency: offer.currency }).format(offer.priceMinor / 100)}</strong><span>{offer.fulfilmentPromise ?? "Ιδιωτική προσφορά"}</span><small>{labels[offer.status] ?? offer.status} · έως {date(offer.expiresAt)}</small></div>)}</div>}
      </article>)}</div> : <div className="empty-state"><h2>Δεν έχεις ακόμη Ask Local αιτήματα.</h2><p>Το πρώτο σου αίτημα θα εμφανιστεί εδώ με την ιδιωτική του κατάσταση.</p></div>}
    </section>
  </>;
}
