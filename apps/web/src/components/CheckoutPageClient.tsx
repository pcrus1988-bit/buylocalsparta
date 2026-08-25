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
type AddressTarget = "billing" | "delivery";

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

type AddressProfile = Readonly<{ fullName: string; addresses: readonly SavedAddress[] }>;
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

function billingAddressLabel(address: SavedAddress): string {
  return `${address.fullName} · ${addressLabel(address)}`;
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
  const [addressTarget, setAddressTarget] = useState<AddressTarget>("billing");
  const [draft, setDraft] = useState<AddressDraft>(() => blankAddress());
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressError, setAddressError] = useState("");

  const effectiveDeliveryAddressId = sameAsBilling ? billingAddressId : deliveryAddressId;
  const needsDeliveryAddress = fulfilmentMode === "local_delivery";
  const needsBoxNowRecipient = fulfilmentMode === "shipping";
  const addressReady = Boolean(
    draft.label.trim()
    && draft.fullName.trim()
    && draft.line1.trim()
    && draft.locality.trim()
    && /^[0-9]{5}$/.test(draft.postcode.trim())
    && /^[A-Za-z]{2}$/.test(draft.countryCode.trim())
  );
  const checkoutFingerprint = useMemo(() => JSON.stringify({
    items: items.map((item) => `${item.canonicalVariantId}:${item.quantity}`).sort(),
    fulfilmentMode,
    billingAddressId,
    deliveryAddressId: needsDeliveryAddress ? effectiveDeliveryAddressId : null,
    boxNowLockerId: needsBoxNowRecipient ? boxNowLocker?.id ?? null : null,
    boxNowLockerPostcode: needsBoxNowRecipient ? boxNowLocker?.postcode ?? null : null,
    recipientName: needsBoxNowRecipient ? recipientName : null,
    recipientEmail: needsBoxNowRecipient ? recipientEmail : null,
    recipientPhone: needsBoxNowRecipient ? recipientPhone : null
  }), [items, fulfilmentMode, billingAddressId, needsDeliveryAddress, effectiveDeliveryAddressId, needsBoxNowRecipient, boxNowLocker?.id, boxNowLocker?.postcode, recipientName, recipientEmail, recipientPhone]);

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
        const contactSource = delivery ?? billing;
        if (billing) setPostcode(billing.postcode);
        if (contactSource) {
          setRecipientName(contactSource.fullName || nextProfile.fullName);
          setRecipientPhone(contactSource.phone ?? "");
        } else {
          setRecipientName(nextProfile.fullName);
        }
        setDraft(blankAddress(nextProfile.fullName));
        setEditorOpen(nextProfile.addresses.length === 0);
        setAddressTarget("billing");
        setAccountState("authenticated");
      } catch {
        if (!cancelled) setAccountState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [checkoutEnabled]);

  useEffect(() => {
    const addressId = needsDeliveryAddress ? effectiveDeliveryAddressId : billingAddressId;
    const address = profile?.addresses.find((item) => item.id === addressId);
    if (address) setPostcode(address.postcode);
  }, [profile, billingAddressId, effectiveDeliveryAddressId, needsDeliveryAddress]);

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
  if (items.length === 0 && !result?.ok) return <div className="empty-state"><h2>Το καλάθι σου είναι άδειο.</h2><a className="button" href="/shop">Βρες προϊόντα</a></div>;

  const summary = <aside className="checkout-summary checkout-friendly-summary">
    <div className="eyebrow">Η παραγγελία σου</div>
    {items.map((item) => {
      const details = [item.size ? `Μέγεθος ${item.size}` : "", item.color ? `Χρώμα ${item.color}` : "", item.sku ? `SKU ${item.sku}` : "", item.gtin ? `GTIN ${item.gtin}` : ""].filter(Boolean).join(" · ");
      return <div className="checkout-item checkout-item-rich" key={item.canonicalVariantId}>
        <div className={`checkout-item-thumb ${item.imageUrl ? "has-image" : ""}`}>{item.imageUrl ? <img src={item.imageUrl} alt={item.imageAlt ?? item.title} loading="lazy" /> : <span>{item.title.slice(0, 2).toUpperCase()}</span>}</div>
        <div className="checkout-item-copy"><strong>{item.quantity}× {item.title}</strong>{details ? <small>{details}</small> : null}</div>
        <strong className="checkout-item-price">{money(item.priceMinor * item.quantity)}</strong>
      </div>;
    })}
    <div className="checkout-total"><span>Προϊόντα</span><strong>{money(subtotalMinor)}</strong></div>
    <p>Τυχόν κόστος παράδοσης και το τελικό σύνολο επιβεβαιώνονται πριν από την πληρωμή.</p>
    <p><strong>Μία παραγγελία · μία πληρωμή.</strong></p>
  </aside>;

  if (!checkoutEnabled) return <div className="checkout-layout checkout-layout-gated">
    <section className="checkout-form checkout-availability-gate" aria-labelledby="checkout-unavailable-title">
      <div className="eyebrow">Προσωρινά μη διαθέσιμο</div>
      <h2 id="checkout-unavailable-title">Η online πληρωμή δεν είναι διαθέσιμη αυτή τη στιγμή.</h2>
      <p>Δεν θα σου ζητήσουμε στοιχεία κάρτας και δεν θα δημιουργήσουμε παραγγελία. Τα προϊόντα μένουν στο καλάθι σου.</p>
      <div className="hero-actions"><a className="button" href="/cart">Πίσω στο καλάθι</a><a className="button button-secondary" href="/shop">Συνέχεια αγορών</a></div>
    </section>
    {summary}
  </div>;

  async function saveAddress() {
    setAddressError("");
    if (!addressReady) {
      setAddressError("Συμπλήρωσε ονοματεπώνυμο, οδό, πόλη και έγκυρο 5ψήφιο ΤΚ.");
      return;
    }
    setAddressBusy(true);
    try {
      const response = await fetch("/api/account/addresses", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ ...draft, countryCode: draft.countryCode.trim().toUpperCase() })
      });
      const body = await response.json() as AddressProfile & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Η διεύθυνση δεν αποθηκεύτηκε.");
      setProfile(body);
      const saved = draft.id
        ? body.addresses.find((address) => address.id === draft.id)
        : body.addresses.find((address) => address.line1 === draft.line1.trim() && address.postcode === draft.postcode.trim() && address.locality === draft.locality.trim() && address.fullName === draft.fullName.trim().replace(/\s+/g, " "));
      if (saved) {
        if (addressTarget === "billing") setBillingAddressId(saved.id);
        if (addressTarget === "delivery") {
          setDeliveryAddressId(saved.id);
          setSameAsBilling(false);
        }
        if (draft.isDefaultBilling) setBillingAddressId(saved.id);
        if (draft.isDefaultDelivery) setDeliveryAddressId(saved.id);
      }
      const billing = body.addresses.find((address) => address.isDefaultBilling);
      const delivery = body.addresses.find((address) => address.isDefaultDelivery);
      if (!saved && billing) setBillingAddressId(billing.id);
      if (!saved && delivery) setDeliveryAddressId(delivery.id);
      setEditorOpen(false);
      setDraft(blankAddress(body.fullName));
    } catch (cause) {
      setAddressError(cause instanceof Error ? cause.message : "Η διεύθυνση δεν αποθηκεύτηκε.");
    } finally {
      setAddressBusy(false);
    }
  }

  function startNewAddress(target: AddressTarget) {
    setAddressError("");
    setAddressTarget(target);
    setDraft({ ...blankAddress(profile?.fullName ?? ""), isDefaultBilling: (profile?.addresses.length ?? 0) === 0, isDefaultDelivery: (profile?.addresses.length ?? 0) === 0 });
    setEditorOpen(true);
  }

  function startEditAddress(address: SavedAddress, target: AddressTarget) {
    setAddressError("");
    setAddressTarget(target);
    setDraft(addressDraft(address));
    setEditorOpen(true);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checkoutKey || accountState !== "authenticated" || !billingAddressId || (needsDeliveryAddress && !effectiveDeliveryAddressId)) return;
    if (needsBoxNowRecipient && (!boxNowLocker || !recipientName.trim() || !recipientEmail.trim() || !recipientPhone.trim())) return;
    setBusy(true); setResult(null);
    try {
      const headers = new Headers({ "content-type": "application/json", "x-csrf-token": csrfToken });
      const shipping = fulfilmentMode === "shipping" ? { provider: boxNowLocker ? "boxnow" : undefined, providerDestinationId: boxNowLocker?.id, providerDestinationLabel: boxNowLocker ? `${boxNowLocker.address} · ${boxNowLocker.postcode}` : undefined, providerDestinationPostcode: boxNowLocker?.postcode, recipientName, recipientEmail, recipientPhone } : undefined;
      const response = await fetch("/api/checkout", { method: "POST", headers, body: JSON.stringify({ checkoutKey, postcode, fulfilmentMode, billingAddressId, deliveryAddressId: needsDeliveryAddress ? effectiveDeliveryAddressId : undefined, shipping, items: items.map((item) => ({ canonicalVariantId: item.canonicalVariantId, quantity: item.quantity })) }) });
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
    ["local_delivery", "Τοπική παράδοση", "Στη διεύθυνσή σου, όπου διατίθεται"]
  ];
  if (boxNowEnabled) fulfilmentOptions.push(["shipping", "BOX NOW locker", "Παραλαβή από locker"]);

  const billingAddress = profile?.addresses.find((address) => address.id === billingAddressId);
  const deliveryAddress = needsDeliveryAddress ? profile?.addresses.find((address) => address.id === effectiveDeliveryAddressId) : undefined;
  const submitBlocked = busy || !checkoutKey || accountState !== "authenticated" || !billingAddressId || (needsDeliveryAddress && !effectiveDeliveryAddressId) || (needsBoxNowRecipient && (!boxNowLocker || !recipientName.trim() || !recipientEmail.trim() || !recipientPhone.trim())) || editorOpen;

  return <div className="checkout-layout">
    <form className="checkout-form" onSubmit={submit}>
      <div className="checkout-section">
        <div className="eyebrow">01 · Τα στοιχεία σου</div>
        <h2>Η διεύθυνσή σου, χωρίς ταλαιπωρία.</h2>
        <p>Διάλεξε μια αποθηκευμένη διεύθυνση ή πρόσθεσε καινούρια. Για παραλαβή από κατάστημα δεν ζητάμε διεύθυνση παράδοσης.</p>
        {accountState === "loading" && <div className="account-gate"><strong>Φόρτωση λογαριασμού…</strong></div>}
        {accountState === "anonymous" && <div className="account-gate"><strong>Συνδέσου για να συνεχίσεις.</strong><p>Έτσι κρατάμε μαζί την παραγγελία, τη διεύθυνση και το παραστατικό σου.</p><div className="hero-actions"><a className="button" href="/login?next=/checkout">Σύνδεση</a><a className="button button-secondary" href="/register?next=/checkout">Νέος λογαριασμός</a></div></div>}
        {accountState === "error" && <div className="account-gate"><strong>Δεν φορτώθηκαν τα στοιχεία σου.</strong><p>Ανανέωσε τη σελίδα ή συνδέσου ξανά.</p></div>}
        {accountState === "authenticated" && <>
          <div className="checkout-account-chip"><strong>{profile?.fullName || "Ο λογαριασμός σου"}</strong><span>{accountEmail}</span></div>
          <div className="shipping-provider-fields">
            <div className="account-card-head"><div><strong>Διεύθυνση χρέωσης</strong><small>Για την απόδειξη ή το παραστατικό της αγοράς.</small></div><button className="text-button" type="button" onClick={() => startNewAddress("billing")}>+ Πρόσθεσε διεύθυνση</button></div>
            {profile?.addresses.length ? <div className="fulfilment-options">{profile.addresses.map((address) => <label className={`fulfilment-option ${billingAddressId === address.id ? "selected" : ""}`} key={`billing-${address.id}`}><input type="radio" name="billing-address" value={address.id} checked={billingAddressId === address.id} onChange={() => setBillingAddressId(address.id)} /><span><strong>{address.label}{address.isDefaultBilling ? " · Προεπιλεγμένη" : ""}</strong><small>{address.fullName} · {addressLabel(address)}</small><button className="text-button" type="button" onClick={(event) => { event.preventDefault(); startEditAddress(address, "billing"); }}>Αλλαγή</button></span></label>)}</div> : !editorOpen && <p>Δεν έχεις αποθηκευμένη διεύθυνση ακόμη.</p>}
          </div>

          {needsDeliveryAddress && <>
            <label className="checkbox-row"><input type="checkbox" checked={sameAsBilling} disabled={!billingAddressId} onChange={(event) => { setSameAsBilling(event.target.checked); if (event.target.checked) setDeliveryAddressId(billingAddressId); }} /><span>Παράδοση στην ίδια διεύθυνση.</span></label>
            {!sameAsBilling && <div className="shipping-provider-fields">
              <div className="account-card-head"><div><strong>Πού να το φέρουμε;</strong><small>Διάλεξε ή πρόσθεσε τη διεύθυνση παράδοσης.</small></div><button className="text-button" type="button" onClick={() => startNewAddress("delivery")}>+ Πρόσθεσε διεύθυνση</button></div>
              <div className="fulfilment-options">{profile?.addresses.map((address) => <label className={`fulfilment-option ${deliveryAddressId === address.id ? "selected" : ""}`} key={`delivery-${address.id}`}><input type="radio" name="delivery-address" value={address.id} checked={deliveryAddressId === address.id} onChange={() => setDeliveryAddressId(address.id)} /><span><strong>{address.label}{address.isDefaultDelivery ? " · Προεπιλεγμένη" : ""}</strong><small>{address.fullName} · {addressLabel(address)}</small><button className="text-button" type="button" onClick={(event) => { event.preventDefault(); startEditAddress(address, "delivery"); }}>Αλλαγή</button></span></label>)}</div>
            </div>}
          </>}

          {editorOpen && <div className="shipping-provider-fields checkout-address-editor">
            <div className="account-card-head"><div><strong>{draft.id ? "Αλλαγή διεύθυνσης" : "Πρόσθεσε διεύθυνση"}</strong><small>Τα βασικά πρώτα. Τα υπόλοιπα είναι προαιρετικά.</small></div><button type="button" className="text-button" onClick={() => { setEditorOpen(false); setAddressError(""); }}>Κλείσιμο</button></div>
            <div className="form-grid checkout-essential-address-fields">
              <label>Ονοματεπώνυμο<input autoComplete="name" value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} required /></label>
              <label>Κινητό <small>προαιρετικό</small><input autoComplete="tel" inputMode="tel" type="tel" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="69…" /></label>
              <label>Οδός και αριθμός<input autoComplete="address-line1" value={draft.line1} onChange={(event) => setDraft({ ...draft, line1: event.target.value })} placeholder="π.χ. Παλαιολόγου 42" required /></label>
              <label>Όροφος / κουδούνι <small>προαιρετικό</small><input autoComplete="address-line2" value={draft.line2} onChange={(event) => setDraft({ ...draft, line2: event.target.value })} /></label>
              <label>Ταχυδρομικός κώδικας<input autoComplete="postal-code" inputMode="numeric" pattern="[0-9]{5}" value={draft.postcode} onChange={(event) => setDraft({ ...draft, postcode: event.target.value.replace(/\D/g, "").slice(0, 5) })} required minLength={5} maxLength={5} /></label>
              <label>Πόλη<input autoComplete="address-level2" value={draft.locality} onChange={(event) => setDraft({ ...draft, locality: event.target.value })} required /></label>
            </div>
            <details className="checkout-optional-details">
              <summary>Περισσότερα στοιχεία <span>προαιρετικά</span></summary>
              <div className="form-grid">
                <label>Ετικέτα διεύθυνσης<input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} required /></label>
                <label>Περιφέρεια<input autoComplete="address-level1" value={draft.region} onChange={(event) => setDraft({ ...draft, region: event.target.value })} /></label>
                <label>Χώρα<input autoComplete="country" value={draft.countryCode} maxLength={2} onChange={(event) => setDraft({ ...draft, countryCode: event.target.value.toUpperCase() })} required /></label>
                <label>Επωνυμία επιχείρησης<input autoComplete="organization" value={draft.companyName} onChange={(event) => setDraft({ ...draft, companyName: event.target.value })} /></label>
                <label>ΑΦΜ<input inputMode="numeric" value={draft.vatNumber} onChange={(event) => setDraft({ ...draft, vatNumber: event.target.value })} /></label>
              </div>
              <label className="checkbox-row"><input type="checkbox" checked={draft.isDefaultBilling} onChange={(event) => setDraft({ ...draft, isDefaultBilling: event.target.checked })} /><span>Να είναι η προεπιλεγμένη διεύθυνση χρέωσης</span></label>
              <label className="checkbox-row"><input type="checkbox" checked={draft.isDefaultDelivery} onChange={(event) => setDraft({ ...draft, isDefaultDelivery: event.target.checked })} /><span>Να είναι η προεπιλεγμένη διεύθυνση παράδοσης</span></label>
            </details>
            {addressError && <p className="form-error" role="alert">{addressError}</p>}
            <button className="button checkout-address-save" type="button" disabled={addressBusy || !addressReady} onClick={() => void saveAddress()}>{addressBusy ? "Αποθήκευση…" : "Αποθήκευση & χρήση"}</button>
          </div>}

          {billingAddress && fulfilmentMode === "pickup" && <div className="checkout-selection-note"><strong>Έτοιμο για παραλαβή</strong><span>{billingAddressLabel(billingAddress)}</span></div>}
          {billingAddress && deliveryAddress && fulfilmentMode === "local_delivery" && <div className="checkout-selection-note"><strong>Θα το φέρουμε εδώ</strong><span>{billingAddressLabel(deliveryAddress)}</span></div>}
          {billingAddress && fulfilmentMode === "shipping" && <div className="checkout-selection-note"><strong>BOX NOW</strong><span>Η διεύθυνση χρέωσης μένει στον λογαριασμό σου. Στη μεταφορική στέλνουμε μόνο τα απαραίτητα στοιχεία παραλήπτη και το locker.</span></div>}
        </>}
      </div>

      <div className="checkout-section">
        <div className="eyebrow">02 · Παραλαβή</div>
        <h2>Πώς θέλεις να το παραλάβεις;</h2>
        <div className="fulfilment-options">{fulfilmentOptions.map(([value,title,note]) => <label className={`fulfilment-option ${fulfilmentMode === value ? "selected" : ""}`} key={value}><input type="radio" name="fulfilment" value={value} checked={fulfilmentMode === value} onChange={() => setFulfilmentMode(value)} /><span><strong>{title}</strong><small>{note}</small></span></label>)}</div>
        {boxNowEnabled && fulfilmentMode === "shipping" && <div className="shipping-provider-fields"><p>Για locker χρειαζόμαστε μόνο τα στοιχεία παραλήπτη και το locker που θα διαλέξεις.</p><div className="form-grid"><label>Ονοματεπώνυμο<input autoComplete="name" value={recipientName} onChange={(event)=>setRecipientName(event.target.value)} required /></label><label>Email<input autoComplete="email" type="email" value={recipientEmail} onChange={(event)=>setRecipientEmail(event.target.value)} required /></label><label>Κινητό<input autoComplete="tel" inputMode="tel" type="tel" value={recipientPhone} onChange={(event)=>setRecipientPhone(event.target.value)} required /></label></div><BoxNowLockerSelector postcode={postcode} selected={boxNowLocker} onSelect={setBoxNowLocker} /></div>}
      </div>

      <div className="checkout-section">
        <div className="eyebrow">03 · Πληρωμή</div>
        <h2>{paymentMode === "viva" ? "Ασφαλής online πληρωμή" : "Δοκιμαστική πληρωμή"}</h2>
        <div className="payment-placeholder"><strong>{paymentMode === "viva" ? "Viva Smart Checkout" : "Development payment adapter"}</strong><span>{paymentMode === "viva" ? "Θα μεταφερθείς στη Viva για την πληρωμή. Το ΚΟΝΤΑ ΜΟΥ δεν συλλέγει ούτε αποθηκεύει στοιχεία κάρτας." : "Αυτή η ροή χρησιμοποιείται μόνο εκτός production για λειτουργικές δοκιμές και δεν αποτελεί πραγματική χρέωση."}</span></div>
      </div>
      <button className="button checkout-submit" disabled={submitBlocked} type="submit">{busy ? "Προετοιμασία…" : paymentMode === "viva" ? "Συνέχεια στην ασφαλή πληρωμή" : "Δημιουργία δοκιμαστικής παραγγελίας"}</button>
      {result && <div className={`checkout-result ${result.ok ? "success" : "error"}`} role="status"><strong>{result.ok ? "Έτοιμο" : "Δεν ολοκληρώθηκε"}</strong><p>{result.message}</p>{result.totalMinor !== undefined && <p><strong>Σύνολο: {money(result.totalMinor)}</strong></p>}{result.orderId && <code>Order: {result.orderId}</code>}</div>}
    </form>
    {summary}
  </div>;
}
