"use client";

import { useEffect, useMemo, useState } from "react";
import { useCart } from "./CartProvider";
import { BoxNowLockerSelector, type BoxNowLockerSelection } from "./BoxNowLockerSelector";

function money(minor: number) { return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100); }

type Props = Readonly<{
  checkoutEnabled: boolean;
  paymentMode: "viva" | "development" | "unavailable";
  boxNowEnabled: boolean;
}>;

type FulfilmentOption = readonly ["pickup" | "local_delivery" | "shipping", string, string];

type SavedAddress = Readonly<{
  id: string;
  label: string;
  fullName: string;
  companyName?: string;
  vatNumber?: string;
  line1: string;
  line2?: string;
  locality: string;
  region?: string;
  postcode: string;
  countryCode: string;
  phone?: string;
  isDefaultBilling: boolean;
  isDefaultDelivery: boolean;
}>;

type AddressProfile = Readonly<{ customerId: string; fullName: string; addresses: readonly SavedAddress[] }>;
type AddressDraft = {
  id?: string;
  label: string;
  fullName: string;
  companyName: string;
  vatNumber: string;
  line1: string;
  line2: string;
  locality: string;
  region: string;
  postcode: string;
  countryCode: string;
  phone: string;
  isDefaultBilling: boolean;
  isDefaultDelivery: boolean;
};

function blankAddress(fullName = ""): AddressDraft {
  return { label: "Σπίτι", fullName, companyName: "", vatNumber: "", line1: "", line2: "", locality: "Σπάρτη", region: "Λακωνία", postcode: "23100", countryCode: "GR", phone: "", isDefaultBilling: false, isDefaultDelivery: false };
}

function addressDraft(address: SavedAddress): AddressDraft {
  return { id: address.id, label: address.label, fullName: address.fullName, companyName: address.companyName ?? "", vatNumber: address.vatNumber ?? "", line1: address.line1, line2: address.line2 ?? "", locality: address.locality, region: address.region ?? "", postcode: address.postcode, countryCode: address.countryCode, phone: address.phone ?? "", isDefaultBilling: address.isDefaultBilling, isDefaultDelivery: address.isDefaultDelivery };
}

function addressLabel(address: SavedAddress): string {
  return [address.line1, address.line2, `${address.postcode} ${address.locality}`, address.region, address.countryCode].filter(Boolean).join(" · ");
}

export function CheckoutPageClient({ checkoutEnabled, paymentMode, boxNowEnabled }: Props) {
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
  const [accountState, setAccountState] = useState<"loading" | "authenticated" | "anonymous" | "error">("loading");
  const [csrfToken, setCsrfToken] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [profile, setProfile] = useState<AddressProfile | null>(null);
  const [billingAddressId, setBillingAddressId] = useState("");
  const [deliveryAddressId, setDeliveryAddressId] = useState("");
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<AddressDraft>(() => blankAddress());
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressError, setAddressError] = useState("");

  const effectiveDeliveryAddressId = sameAsBilling ? billingAddressId : deliveryAddressId;
  const checkoutFingerprint = useMemo(() => `${items.map((item) => `${item.canonicalVariantId}:${item.quantity}`).sort().join("|")}::${postcode}::${fulfilmentMode}::${boxNowLocker?.id ?? ""}::${billingAddressId}::${effectiveDeliveryAddressId}::${recipientName}::${recipientEmail}::${recipientPhone}`, [items, postcode, fulfilmentMode, boxNowLocker?.id, billingAddressId, effectiveDeliveryAddressId, recipientName, recipientEmail, recipientPhone]);

  useEffect(() => {
    if (!checkoutEnabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const sessionResponse = await fetch("/api/account/session", { cache: "no-store" });
        if (!sessionResponse.ok) {
          if (!cancelled) setAccountState("anonymous");
          return;
        }
        const session = await sessionResponse.json() as { csrfToken?: string; account?: { email?: string } };
        const addressesResponse = await fetch("/api/account/addresses", { cache: "no-store" });
        if (!addressesResponse.ok) throw new Error("Δεν ήταν δυνατή η φόρτωση των διευθύνσεων.");
        const nextProfile = await addressesResponse.json() as AddressProfile;
        if (cancelled) return;
        setCsrfToken(session.csrfToken ?? "");
        setAccountEmail(session.account?.email ?? "");
        setRecipientEmail(session.account?.email ?? "");
        setProfile(nextProfile);
        const billing = nextProfile.addresses.find((address) => address.isDefaultBilling) ?? nextProfile.addresses[0];
        const delivery = nextProfile.addresses.find((address) => address.isDefaultDelivery) ?? billing;
        setBillingAddressId(billing?.id ?? "");
        setDeliveryAddressId(delivery?.id ?? "");
        setSameAsBilling(Boolean(billing && delivery && billing.id === delivery.id));
        if (delivery) {
          setPostcode(delivery.postcode);
          setRecipientName(delivery.fullName || nextProfile.fullName);
          setRecipientPhone(delivery.phone ?? "");
        }
        setDraft(blankAddress(nextProfile.fullName));
        setEditorOpen(nextProfile.addresses.length === 0);
        setAccountState("authenticated");
      } catch {
        if (!cancelled) setAccountState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [checkoutEnabled]);

  useEffect(() => {
    const address = profile?.addresses.find((item) => item.id === effectiveDeliveryAddressId);
    if (!address) return;
    setPostcode(address.postcode);
    setRecipientName(address.fullName || profile?.fullName || "");
    setRecipientPhone(address.phone ?? "");
  }, [profile, effectiveDeliveryAddressId]);

  useEffect(() => {
    if (!checkoutEnabled || !hydrated || items.length === 0) return;
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
  }, [checkoutEnabled, hydrated, items.length, checkoutFingerprint]);

  if (!hydrated) return <div className="empty-state"><p>Φόρτωση checkout…</p></div>;
  if (items.length === 0 && !result?.ok) return <div className="empty-state"><h2>Δεν υπάρχει κάτι για checkout.</h2><a className="button" href="/shop">Ανακάλυψε προϊόντα</a></div>;

  const summary = <aside className="checkout-summary"><div className="eyebrow">Η παραγγελία σου</div>{items.map((item) => <div className="checkout-item" key={item.canonicalVariantId}><span>{item.quantity}× {item.title}</span><strong>{money(item.priceMinor * item.quantity)}</strong></div>)}<div className="checkout-total"><span>Εκτιμώμενο υποσύνολο προϊόντων</span><strong>{money(subtotalMinor)}</strong></div><p>Η τελική χρέωση υπολογίζεται αποκλειστικά από το backend και μπορεί να περιλαμβάνει έξοδα παράδοσης.</p><p>Οι προμηθευτές και οι τιμές προμήθειας παραμένουν ιδιωτικές. Ο πελάτης βλέπει μία καθαρή αγορά από το Buy Local Sparta.</p></aside>;

  if (!checkoutEnabled) return <div className="checkout-layout checkout-layout-gated">
    <section className="checkout-form checkout-availability-gate" aria-labelledby="checkout-unavailable-title">
      <div className="eyebrow">Προσωρινά μη διαθέσιμο</div>
      <h2 id="checkout-unavailable-title">Η online πληρωμή δεν έχει ακόμη ενεργοποιηθεί.</h2>
      <p>Δεν θα σου ζητήσουμε στοιχεία πληρωμής και δεν θα δημιουργήσουμε παραγγελία όσο ο production πάροχος πληρωμών δεν είναι έτοιμος. Τα προϊόντα παραμένουν στο καλάθι σου.</p>
      <div className="fairness-note"><strong>Τι μπορείς να κάνεις τώρα</strong><p>Συνέχισε τις αγορές σου ή επέστρεψε στο καλάθι. Όταν ενεργοποιηθεί το checkout, η ίδια ροή θα επιβεβαιώνει διαθεσιμότητα, fulfilment και τελική χρέωση πριν από την πληρωμή.</p></div>
      <div className="hero-actions"><a className="button" href="/cart">Πίσω στο καλάθι</a><a className="button button-secondary" href="/shop">Συνέχεια αγορών</a></div>
    </section>
    {summary}
  </div>;

  async function saveAddress() {
    setAddressBusy(true);
    setAddressError("");
    try {
      const response = await fetch("/api/account/addresses", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(draft)
      });
      const body = await response.json() as AddressProfile & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Η διεύθυνση δεν αποθηκεύτηκε.");
      setProfile(body);
      const saved = draft.id
        ? body.addresses.find((address) => address.id === draft.id)
        : body.addresses.find((address) => address.line1 === draft.line1.trim() && address.postcode === draft.postcode.trim() && address.locality === draft.locality.trim() && address.fullName === draft.fullName.trim().replace(/\s+/g, " "));
      if (saved) {
        if (draft.isDefaultBilling || !billingAddressId) setBillingAddressId(saved.id);
        if (draft.isDefaultDelivery || !deliveryAddressId) setDeliveryAddressId(saved.id);
      }
      const billing = body.addresses.find((address) => address.isDefaultBilling);
      const delivery = body.addresses.find((address) => address.isDefaultDelivery);
      if (billing) setBillingAddressId(billing.id);
      if (delivery) setDeliveryAddressId(delivery.id);
      if (billing && delivery) setSameAsBilling(billing.id === delivery.id);
      setEditorOpen(false);
      setDraft(blankAddress(body.fullName));
    } catch (cause) {
      setAddressError(cause instanceof Error ? cause.message : "Η διεύθυνση δεν αποθηκεύτηκε.");
    } finally {
      setAddressBusy(false);
    }
  }

  function startNewAddress() {
    setAddressError("");
    setDraft({ ...blankAddress(profile?.fullName ?? ""), isDefaultBilling: (profile?.addresses.length ?? 0) === 0, isDefaultDelivery: (profile?.addresses.length ?? 0) === 0 });
    setEditorOpen(true);
  }

  function startEditAddress(address: SavedAddress) {
    setAddressError("");
    setDraft(addressDraft(address));
    setEditorOpen(true);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checkoutKey || accountState !== "authenticated" || !billingAddressId || !effectiveDeliveryAddressId) return;
    setBusy(true); setResult(null);
    try {
      const headers = new Headers({ "content-type": "application/json", "x-csrf-token": csrfToken });
      const shipping = fulfilmentMode === "shipping" ? { provider: boxNowLocker ? "boxnow" : undefined, providerDestinationId: boxNowLocker?.id, providerDestinationLabel: boxNowLocker ? `${boxNowLocker.address} · ${boxNowLocker.postcode}` : undefined, recipientName, recipientEmail, recipientPhone } : undefined;
      const response = await fetch("/api/checkout", { method: "POST", headers, body: JSON.stringify({ checkoutKey, postcode, fulfilmentMode, billingAddressId, deliveryAddressId: effectiveDeliveryAddressId, shipping, items: items.map((item) => ({ canonicalVariantId: item.canonicalVariantId, quantity: item.quantity })) }) });
      const body = await response.json() as { id?: string; orderId?: string; error?: string; total?: { minor?: number; currency?: string }; payment?: { provider?: string; redirectUrl?: string; orderCode?: string; amountMinor?: number } };
      if (!response.ok) throw new Error(body.error ?? "Το checkout δεν ολοκληρώθηκε.");
      const orderId = body.id ?? body.orderId ?? "created";
      if (body.payment?.provider === "viva" && body.payment.redirectUrl) {
        window.location.assign(body.payment.redirectUrl);
        return;
      }
      window.sessionStorage.removeItem("buy-local-sparta-checkout-v1");
      clear(); setResult({ ok: true, orderId, totalMinor: Number.isSafeInteger(body.total?.minor) ? body.total?.minor : undefined, message: paymentMode === "development" ? "Η δοκιμαστική παραγγελία δημιουργήθηκε επιτυχώς." : "Η παραγγελία δημιουργήθηκε." });
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : "Το checkout απέτυχε." });
    } finally { setBusy(false); }
  }

  const fulfilmentOptions: FulfilmentOption[] = [
    ["pickup", "Παραλαβή από κατάστημα", "Δωρεάν όταν διατίθεται"],
    ["local_delivery", "Τοπική παράδοση", "Για επιλέξιμους ΤΚ"]
  ];
  if (boxNowEnabled) fulfilmentOptions.push(["shipping", "BOX NOW locker", "Παραλαβή από επιλεγμένο locker"]);

  const billingAddress = profile?.addresses.find((address) => address.id === billingAddressId);
  const deliveryAddress = profile?.addresses.find((address) => address.id === effectiveDeliveryAddressId);

  return <div className="checkout-layout">
    <form className="checkout-form" onSubmit={submit}>
      <div className="checkout-section">
        <div className="eyebrow">01 · Στοιχεία & διευθύνσεις</div>
        <h2>Ποιος παραγγέλνει και πού;</h2>
        <p>Το ονοματεπώνυμο και οι διευθύνσεις αποθηκεύονται στον λογαριασμό σου για επόμενες αγορές. Σε κάθε παραγγελία κρατάμε ξεχωριστό, μη μεταβαλλόμενο snapshot.</p>
        {accountState === "loading" && <div className="account-gate"><strong>Φόρτωση λογαριασμού…</strong></div>}
        {accountState === "anonymous" && <div className="account-gate"><strong>Χρειάζεται σύνδεση.</strong><p>Για να αποθηκεύονται σωστά το ονοματεπώνυμο, η διεύθυνση τιμολόγησης και η διεύθυνση παράδοσης, το checkout ολοκληρώνεται από λογαριασμό πελάτη.</p><div className="hero-actions"><a className="button" href="/login?next=/checkout">Σύνδεση</a><a className="button button-secondary" href="/register?next=/checkout">Δημιουργία λογαριασμού</a></div></div>}
        {accountState === "error" && <div className="account-gate"><strong>Δεν φορτώθηκαν τα στοιχεία λογαριασμού.</strong><p>Ανανέωσε τη σελίδα ή συνδέσου ξανά.</p></div>}
        {accountState === "authenticated" && <>
          <div className="fairness-note"><strong>{profile?.fullName || "Συμπλήρωσε το ονοματεπώνυμό σου"}</strong><p>{accountEmail}</p></div>
          <div className="shipping-provider-fields">
            <div className="account-card-head"><div><strong>Διεύθυνση τιμολόγησης</strong><small>Χρησιμοποιείται στο παραστατικό της συγκεκριμένης παραγγελίας.</small></div><button className="text-button" type="button" onClick={startNewAddress}>+ Νέα διεύθυνση</button></div>
            {profile?.addresses.length ? <div className="fulfilment-options">{profile.addresses.map((address) => <label className={`fulfilment-option ${billingAddressId === address.id ? "selected" : ""}`} key={`billing-${address.id}`}><input type="radio" name="billing-address" value={address.id} checked={billingAddressId === address.id} onChange={() => setBillingAddressId(address.id)} /><span><strong>{address.label}{address.isDefaultBilling ? " · Προεπιλεγμένη" : ""}</strong><small>{address.fullName} · {addressLabel(address)}</small><button className="text-button" type="button" onClick={(event) => { event.preventDefault(); startEditAddress(address); }}>Αλλαγή</button></span></label>)}</div> : !editorOpen && <p>Δεν έχεις αποθηκευμένη διεύθυνση. Πρόσθεσε την πρώτη σου διεύθυνση.</p>}
          </div>

          <label className="checkbox-row"><input type="checkbox" checked={sameAsBilling} disabled={!billingAddressId} onChange={(event) => { setSameAsBilling(event.target.checked); if (event.target.checked) setDeliveryAddressId(billingAddressId); }} /><span>Η διεύθυνση παράδοσης είναι ίδια με τη διεύθυνση τιμολόγησης.</span></label>

          {!sameAsBilling && <div className="shipping-provider-fields">
            <div className="account-card-head"><div><strong>Διεύθυνση παράδοσης</strong><small>Μπορεί να είναι διαφορετική από τη διεύθυνση τιμολόγησης.</small></div><button className="text-button" type="button" onClick={startNewAddress}>+ Νέα διεύθυνση</button></div>
            <div className="fulfilment-options">{profile?.addresses.map((address) => <label className={`fulfilment-option ${deliveryAddressId === address.id ? "selected" : ""}`} key={`delivery-${address.id}`}><input type="radio" name="delivery-address" value={address.id} checked={deliveryAddressId === address.id} onChange={() => setDeliveryAddressId(address.id)} /><span><strong>{address.label}{address.isDefaultDelivery ? " · Προεπιλεγμένη" : ""}</strong><small>{address.fullName} · {addressLabel(address)}</small><button className="text-button" type="button" onClick={(event) => { event.preventDefault(); startEditAddress(address); }}>Αλλαγή</button></span></label>)}</div>
          </div>}

          {editorOpen && <div className="shipping-provider-fields">
            <div className="account-card-head"><div><strong>{draft.id ? "Επεξεργασία διεύθυνσης" : "Νέα διεύθυνση"}</strong><small>Τα υποχρεωτικά πεδία αποθηκεύονται στον λογαριασμό σου.</small></div><button type="button" className="text-button" onClick={() => setEditorOpen(false)}>Κλείσιμο</button></div>
            <div className="form-grid">
              <label>Ετικέτα<input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} required /></label>
              <label>Ονοματεπώνυμο<input autoComplete="name" value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} required /></label>
              <label>Οδός και αριθμός<input autoComplete="address-line1" value={draft.line1} onChange={(event) => setDraft({ ...draft, line1: event.target.value })} required /></label>
              <label>Όροφος / διαμέρισμα<input autoComplete="address-line2" value={draft.line2} onChange={(event) => setDraft({ ...draft, line2: event.target.value })} /></label>
              <label>Πόλη<input autoComplete="address-level2" value={draft.locality} onChange={(event) => setDraft({ ...draft, locality: event.target.value })} required /></label>
              <label>Περιφέρεια<input autoComplete="address-level1" value={draft.region} onChange={(event) => setDraft({ ...draft, region: event.target.value })} /></label>
              <label>Ταχυδρομικός κώδικας<input autoComplete="postal-code" inputMode="numeric" pattern="[0-9]{5}" value={draft.postcode} onChange={(event) => setDraft({ ...draft, postcode: event.target.value })} required minLength={5} maxLength={5} /></label>
              <label>Χώρα<input autoComplete="country" value={draft.countryCode} maxLength={2} onChange={(event) => setDraft({ ...draft, countryCode: event.target.value.toUpperCase() })} required /></label>
              <label>Τηλέφωνο<input autoComplete="tel" type="tel" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
              <label>Επωνυμία επιχείρησης (προαιρετικό)<input value={draft.companyName} onChange={(event) => setDraft({ ...draft, companyName: event.target.value })} /></label>
              <label>ΑΦΜ (προαιρετικό)<input value={draft.vatNumber} onChange={(event) => setDraft({ ...draft, vatNumber: event.target.value })} /></label>
            </div>
            <label className="checkbox-row"><input type="checkbox" checked={draft.isDefaultBilling} onChange={(event) => setDraft({ ...draft, isDefaultBilling: event.target.checked })} /><span>Προεπιλεγμένη διεύθυνση τιμολόγησης</span></label>
            <label className="checkbox-row"><input type="checkbox" checked={draft.isDefaultDelivery} onChange={(event) => setDraft({ ...draft, isDefaultDelivery: event.target.checked })} /><span>Προεπιλεγμένη διεύθυνση παράδοσης</span></label>
            {addressError && <p className="form-error" role="alert">{addressError}</p>}
            <button className="button button-secondary" type="button" disabled={addressBusy} onClick={() => void saveAddress()}>{addressBusy ? "Αποθήκευση…" : "Αποθήκευση διεύθυνσης"}</button>
          </div>}

          {billingAddress && deliveryAddress && <div className="fairness-note"><strong>Θα χρησιμοποιηθούν στην παραγγελία</strong><p>Τιμολόγηση: {billingAddressLabel(billingAddress)}<br />Παράδοση: {billingAddressLabel(deliveryAddress)}</p></div>}
        </>}
      </div>

      <div className="checkout-section"><div className="eyebrow">02 · Τρόπος παραλαβής</div><h2>Διάλεξε διαθέσιμο τρόπο εκπλήρωσης</h2><div className="fulfilment-options">{fulfilmentOptions.map(([value,title,note]) => <label className={`fulfilment-option ${fulfilmentMode === value ? "selected" : ""}`} key={value}><input type="radio" name="fulfilment" value={value} checked={fulfilmentMode === value} onChange={() => setFulfilmentMode(value)} /><span><strong>{title}</strong><small>{note}</small></span></label>)}</div>{boxNowEnabled && fulfilmentMode === "shipping" && <div className="shipping-provider-fields"><div className="form-grid"><label>Ονοματεπώνυμο παραλήπτη<input value={recipientName} onChange={(event)=>setRecipientName(event.target.value)} required /></label><label>Email<input type="email" value={recipientEmail} onChange={(event)=>setRecipientEmail(event.target.value)} required /></label><label>Κινητό τηλέφωνο<input type="tel" value={recipientPhone} onChange={(event)=>setRecipientPhone(event.target.value)} required /></label></div><BoxNowLockerSelector postcode={postcode} selected={boxNowLocker} onSelect={setBoxNowLocker} /></div>}</div>
      <div className="checkout-section"><div className="eyebrow">03 · Πληρωμή</div><h2>{paymentMode === "viva" ? "Ασφαλής online πληρωμή" : "Δοκιμαστική πληρωμή"}</h2><div className="payment-placeholder"><strong>{paymentMode === "viva" ? "Viva Smart Checkout" : "Development payment adapter"}</strong><span>{paymentMode === "viva" ? "Θα μεταφερθείς στη φιλοξενούμενη σελίδα πληρωμής της Viva. Το Buy Local Sparta δεν συλλέγει ούτε αποθηκεύει στοιχεία κάρτας." : "Αυτή η ροή χρησιμοποιείται μόνο εκτός production για λειτουργικές δοκιμές και δεν αποτελεί πραγματική χρέωση."}</span></div></div>
      <button className="button checkout-submit" disabled={busy || !checkoutKey || accountState !== "authenticated" || !billingAddressId || !effectiveDeliveryAddressId || editorOpen} type="submit">{busy ? "Προετοιμασία…" : paymentMode === "viva" ? "Συνέχεια στην ασφαλή πληρωμή" : "Δημιουργία δοκιμαστικής παραγγελίας"}</button>
      {result && <div className={`checkout-result ${result.ok ? "success" : "error"}`} role="status"><strong>{result.ok ? "Έτοιμο" : "Δεν ολοκληρώθηκε"}</strong><p>{result.message}</p>{result.totalMinor !== undefined && <p><strong>Σύνολο: {money(result.totalMinor)}</strong></p>}{result.orderId && <code>Order: {result.orderId}</code>}</div>}
    </form>
    {summary}
  </div>;
}

function billingAddressLabel(address: SavedAddress): string {
  return `${address.fullName} · ${addressLabel(address)}`;
}
