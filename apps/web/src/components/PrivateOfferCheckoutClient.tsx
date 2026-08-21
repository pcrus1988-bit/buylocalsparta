"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CustomerPrivateOfferCheckoutPreview } from "../lib/private-offer-checkout-service";

type Address = Readonly<{ id: string; label: string; fullName: string; line1: string; line2?: string; postcode: string; locality: string; region?: string; isDefaultBilling: boolean }>;

function money(minor: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}
function addressLabel(address: Address): string {
  return [address.line1, address.line2, `${address.postcode} ${address.locality}`, address.region].filter(Boolean).join(" · ");
}

export function PrivateOfferCheckoutClient({
  offer,
  addresses,
  csrfToken,
  checkoutEnabled
}: {
  offer: CustomerPrivateOfferCheckoutPreview;
  addresses: readonly Address[];
  csrfToken: string;
  checkoutEnabled: boolean;
}) {
  const initialBilling = addresses.find((address) => address.isDefaultBilling) ?? addresses[0];
  const [billingAddressId, setBillingAddressId] = useState(initialBilling?.id ?? "");
  const [checkoutKey, setCheckoutKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdOrderId, setCreatedOrderId] = useState<string>();
  const fingerprint = useMemo(() => `${offer.offerId}:${billingAddressId}:pickup`, [offer.offerId, billingAddressId]);

  useEffect(() => {
    if (!billingAddressId) return;
    const storageKey = "buy-local-sparta-private-offer-checkout-v1";
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "null") as { fingerprint?: unknown; checkoutKey?: unknown } | null;
      if (stored?.fingerprint === fingerprint && typeof stored.checkoutKey === "string" && /^[A-Za-z0-9-]{16,128}$/.test(stored.checkoutKey)) {
        setCheckoutKey(stored.checkoutKey);
        return;
      }
    } catch {
      // Invalid session data is replaced below.
    }
    const next = crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint, checkoutKey: next }));
    setCheckoutKey(next);
  }, [billingAddressId, fingerprint]);

  async function submit() {
    if (!checkoutEnabled || !offer.purchasable || !billingAddressId || !checkoutKey || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/account/ask-local/offers/${encodeURIComponent(offer.offerId)}/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ checkoutKey, billingAddressId })
      });
      const payload = await response.json() as { id?: string; orderId?: string; error?: string; payment?: { provider?: string; redirectUrl?: string } };
      if (!response.ok) throw new Error(payload.error ?? "Η αγορά της ιδιωτικής προσφοράς δεν ολοκληρώθηκε.");
      const orderId = payload.id ?? payload.orderId;
      if (payload.payment?.provider === "viva" && payload.payment.redirectUrl) {
        window.location.assign(payload.payment.redirectUrl);
        return;
      }
      if (orderId) setCreatedOrderId(orderId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η αγορά της ιδιωτικής προσφοράς δεν ολοκληρώθηκε.");
    } finally {
      setBusy(false);
    }
  }

  if (createdOrderId) return <section className="checkout-form">
    <div className="checkout-result success" role="status"><strong>Η παραγγελία δημιουργήθηκε.</strong><p>Η αποδεκτή ιδιωτική προσφορά έχει δεσμευτεί στη συγκεκριμένη παραγγελία.</p></div>
    <Link className="button" href={`/account/orders/${encodeURIComponent(createdOrderId)}`}>Προβολή παραγγελίας</Link>
  </section>;

  return <div className="checkout-layout">
    <section className="checkout-form" aria-labelledby="private-offer-confirm-title">
      <div className="eyebrow">Αποδεκτή ιδιωτική προσφορά</div>
      <h2 id="private-offer-confirm-title">Επιβεβαίωση αγοράς</h2>
      <div className="fairness-note"><strong>Συγκεκριμένο κατάστημα · συγκεκριμένη τιμή</strong><p>Η επιλογή καταστήματος δεν επαναϋπολογίζεται στο checkout. Η τιμή προέρχεται από την ιδιωτική προσφορά που ήδη αποδέχτηκες και το απόθεμα δεσμεύεται από την αντίστοιχη εγκεκριμένη προσφορά του καταστήματος.</p></div>
      <div className="checkout-field-group"><label htmlFor="private-offer-billing">Διεύθυνση τιμολόγησης</label><select id="private-offer-billing" value={billingAddressId} onChange={(event) => setBillingAddressId(event.target.value)}>{addresses.map((address) => <option value={address.id} key={address.id}>{address.label} · {addressLabel(address)}</option>)}</select></div>
      <div className="checkout-field-group"><span>Τρόπος εκπλήρωσης</span><strong>Παραλαβή από το κατάστημα</strong><small>Η πρώτη έκδοση private-offer checkout ενεργοποιείται μόνο όταν η πραγματική προσφορά αποθέματος του καταστήματος υποστηρίζει pickup. Δεν μεταφράζουμε αυτόματα το ελεύθερο κείμενο της ιδιωτικής προσφοράς σε χρεώσεις παράδοσης.</small></div>
      {offer.fulfilmentPromise && <div className="workspace-inline-note"><strong>Υπόσχεση καταστήματος:</strong> {offer.fulfilmentPromise}</div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {!checkoutEnabled && <p className="form-error" role="alert">Η online πληρωμή δεν είναι διαθέσιμη αυτή τη στιγμή.</p>}
      <button className="button button-primary" type="button" disabled={!checkoutEnabled || !billingAddressId || !checkoutKey || busy || !offer.purchasable} onClick={() => void submit()}>{busy ? "Δημιουργία παραγγελίας…" : `Συνέχεια σε ασφαλή πληρωμή · ${money(offer.totalMinor)}`}</button>
      <p className="checkout-legal-note">Η τελική χρέωση προϊόντος είναι η αποδεκτή ιδιωτική τιμή. Δεν εφαρμόζεται η δημόσια τιμή καταλόγου σε αυτή τη γραμμή παραγγελίας.</p>
    </section>
    <aside className="checkout-summary">
      <div className="eyebrow">Ιδιωτική προσφορά</div>
      <div className="checkout-item"><span>{offer.quantity}× {offer.title}</span><strong>{money(offer.totalMinor)}</strong></div>
      <div className="checkout-item"><span>Κατάστημα</span><strong>{offer.vendorName}</strong></div>
      <div className="checkout-item"><span>Τιμή ανά τεμάχιο</span><strong>{money(offer.unitPriceMinor)}</strong></div>
      <div className="checkout-total"><span>Σύνολο προϊόντων</span><strong>{money(offer.totalMinor)}</strong></div>
      <p>Ask Local {offer.requestId} · ισχύει έως {new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(offer.expiresAt))}</p>
    </aside>
  </div>;
}
