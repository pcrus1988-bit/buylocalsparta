"use client";

import { useEffect, useMemo, useState } from "react";
import { useCart } from "./CartProvider";
import { BoxNowLockerSelector, type BoxNowLockerSelection } from "./BoxNowLockerSelector";

function money(minor: number) { return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100); }

export function CheckoutPageClient() {
  const { items, subtotalMinor, hydrated, clear } = useCart();
  const [postcode, setPostcode] = useState("23100");
  const [checkoutKey, setCheckoutKey] = useState("");
  const [fulfilmentMode, setFulfilmentMode] = useState<"pickup" | "local_delivery" | "shipping">("pickup");
  const [busy, setBusy] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [boxNowLocker, setBoxNowLocker] = useState<BoxNowLockerSelection | undefined>();
  const [result, setResult] = useState<{ ok: boolean; message: string; orderId?: string; totalMinor?: number } | null>(null);
  const checkoutFingerprint = useMemo(() => `${items.map((item) => `${item.canonicalVariantId}:${item.quantity}`).sort().join("|")}::${postcode}::${fulfilmentMode}::${boxNowLocker?.id ?? ""}::${recipientName}::${recipientEmail}::${recipientPhone}`, [items, postcode, fulfilmentMode, boxNowLocker?.id, recipientName, recipientEmail, recipientPhone]);

  useEffect(() => {
    if (!hydrated || items.length === 0) return;
    const storageKey = "buy-local-sparta-checkout-v1";
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "null") as { fingerprint?: unknown; checkoutKey?: unknown } | null;
      if (stored?.fingerprint === checkoutFingerprint && typeof stored.checkoutKey === "string" && /^[A-Za-z0-9-]{16,128}$/.test(stored.checkoutKey)) {
        setCheckoutKey(stored.checkoutKey);
        return;
      }
    } catch {
      // Replace malformed session state with a fresh idempotency key below.
    }
    const nextKey = crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint: checkoutFingerprint, checkoutKey: nextKey }));
    setCheckoutKey(nextKey);
  }, [hydrated, items.length, checkoutFingerprint]);

  if (!hydrated) return <div className="empty-state"><p>Φόρτωση checkout…</p></div>;
  if (items.length === 0 && !result?.ok) return <div className="empty-state"><h2>Δεν υπάρχει κάτι για checkout.</h2><a className="button" href="/shop">Ανακάλυψε προϊόντα</a></div>;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checkoutKey) return;
    setBusy(true); setResult(null);
    try {
      const headers = new Headers({ "content-type": "application/json" });
      const session = await fetch("/api/account/session", { cache: "no-store" });
      if (session.ok) {
        const account = await session.json() as { csrfToken?: string };
        if (account.csrfToken) headers.set("x-csrf-token", account.csrfToken);
      }
      const shipping = fulfilmentMode === "shipping" ? { provider: boxNowLocker ? "boxnow" : undefined, providerDestinationId: boxNowLocker?.id, providerDestinationLabel: boxNowLocker ? `${boxNowLocker.address} · ${boxNowLocker.postcode}` : undefined, recipientName, recipientEmail, recipientPhone } : undefined;
      const response = await fetch("/api/checkout", { method: "POST", headers, body: JSON.stringify({ checkoutKey, postcode, fulfilmentMode, shipping, items: items.map((item) => ({ canonicalVariantId: item.canonicalVariantId, quantity: item.quantity })) }) });
      const body = await response.json() as { id?: string; orderId?: string; error?: string; total?: { minor?: number; currency?: string }; payment?: { provider?: string; redirectUrl?: string; orderCode?: string; amountMinor?: number } };
      if (!response.ok) throw new Error(body.error ?? "checkout_failed");
      const orderId = body.id ?? body.orderId ?? "created";
      if (body.payment?.provider === "viva" && body.payment.redirectUrl) {
        // Do not clear the local cart until Viva is verified on the success return/webhook path.
        window.location.assign(body.payment.redirectUrl);
        return;
      }
      window.sessionStorage.removeItem("buy-local-sparta-checkout-v1");
      clear(); setResult({ ok: true, orderId, totalMinor: Number.isSafeInteger(body.total?.minor) ? body.total?.minor : undefined, message: "Η παραγγελία δημιουργήθηκε μέσω του development payment adapter." });
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : "Το checkout απέτυχε." });
    } finally { setBusy(false); }
  }

  return <div className="checkout-layout">
    <form className="checkout-form" onSubmit={submit}>
      <div className="checkout-section"><div className="eyebrow">01 · Στοιχεία</div><h2>Πού θα εξυπηρετηθείς;</h2><label htmlFor="postcode">Ταχυδρομικός κώδικας</label><input id="postcode" value={postcode} inputMode="numeric" onChange={(event) => setPostcode(event.target.value)} required minLength={5} maxLength={5} /></div>
      <div className="checkout-section"><div className="eyebrow">02 · Τρόπος παραλαβής</div><h2>Διάλεξε εκπλήρωση</h2><div className="fulfilment-options">{([['pickup','Παραλαβή από κατάστημα','Δωρεάν όταν διατίθεται'],['local_delivery','Τοπική παράδοση','Για επιλέξιμους ΤΚ'],['shipping','BOX NOW locker','Παραλαβή από επιλεγμένο locker']] as const).map(([value,title,note]) => <label className={`fulfilment-option ${fulfilmentMode === value ? 'selected' : ''}`} key={value}><input type="radio" name="fulfilment" value={value} checked={fulfilmentMode === value} onChange={() => setFulfilmentMode(value)} /><span><strong>{title}</strong><small>{note}</small></span></label>)}</div>{fulfilmentMode === "shipping" && <div className="shipping-provider-fields"><div className="form-grid"><label>Ονοματεπώνυμο παραλήπτη<input value={recipientName} onChange={(event)=>setRecipientName(event.target.value)} required /></label><label>Email<input type="email" value={recipientEmail} onChange={(event)=>setRecipientEmail(event.target.value)} required /></label><label>Κινητό τηλέφωνο<input type="tel" value={recipientPhone} onChange={(event)=>setRecipientPhone(event.target.value)} required /></label></div><BoxNowLockerSelector postcode={postcode} selected={boxNowLocker} onSelect={setBoxNowLocker} /></div>}</div>
      <div className="checkout-section"><div className="eyebrow">03 · Πληρωμή</div><h2>Ενιαία πληρωμή</h2><div className="payment-placeholder"><strong>Viva Smart Checkout</strong><span>Στο production payment flow μεταφέρεσαι στη φιλοξενούμενη σελίδα πληρωμής της Viva. Το Buy Local Sparta δεν συλλέγει ούτε αποθηκεύει στοιχεία κάρτας.</span></div></div>
      <button className="button checkout-submit" disabled={busy || !checkoutKey} type="submit">{busy ? "Προετοιμασία…" : "Συνέχεια στην ασφαλή πληρωμή"}</button>
      {result && <div className={`checkout-result ${result.ok ? "success" : "error"}`} role="status"><strong>{result.ok ? "Έτοιμο" : "Δεν ολοκληρώθηκε"}</strong><p>{result.message}</p>{result.totalMinor !== undefined && <p><strong>Σύνολο backend: {money(result.totalMinor)}</strong></p>}{result.orderId && <code>Order: {result.orderId}</code>}</div>}
    </form>
    <aside className="checkout-summary"><div className="eyebrow">Η παραγγελία σου</div>{items.map((item) => <div className="checkout-item" key={item.canonicalVariantId}><span>{item.quantity}× {item.title}</span><strong>{money(item.priceMinor * item.quantity)}</strong></div>)}<div className="checkout-total"><span>Εκτιμώμενο υποσύνολο προϊόντων</span><strong>{money(subtotalMinor)}</strong></div><p>Η τελική χρέωση υπολογίζεται αποκλειστικά από το backend και μπορεί να περιλαμβάνει έξοδα παράδοσης. </p><p>Οι προμηθευτές και οι τιμές προμήθειας παραμένουν ιδιωτικές. Ο πελάτης βλέπει μία καθαρή αγορά από το Buy Local Sparta.</p></aside>
  </div>;
}
