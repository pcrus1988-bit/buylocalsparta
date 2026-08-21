"use client";

import { useState } from "react";
import { CustomerHowItWorks } from "./CustomerAccountPrimitives";

type Address = Readonly<{
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
type Profile = Readonly<{ customerId: string; fullName: string; addresses: readonly Address[] }>;
type Draft = {
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

const blank = (fullName: string, first = false): Draft => ({ label: "Σπίτι", fullName, companyName: "", vatNumber: "", line1: "", line2: "", locality: "Σπάρτη", region: "Λακωνία", postcode: "23100", countryCode: "GR", phone: "", isDefaultBilling: first, isDefaultDelivery: first });
const toDraft = (address: Address): Draft => ({ id: address.id, label: address.label, fullName: address.fullName, companyName: address.companyName ?? "", vatNumber: address.vatNumber ?? "", line1: address.line1, line2: address.line2 ?? "", locality: address.locality, region: address.region ?? "", postcode: address.postcode, countryCode: address.countryCode, phone: address.phone ?? "", isDefaultBilling: address.isDefaultBilling, isDefaultDelivery: address.isDefaultDelivery });

export function AccountProfileAddressesClient({ initialProfile, email, csrfToken }: { initialProfile: Profile; email: string; csrfToken: string }) {
  const [profile, setProfile] = useState(initialProfile);
  const [draft, setDraft] = useState<Draft>(() => blank(initialProfile.fullName, initialProfile.addresses.length === 0));
  const [editorOpen, setEditorOpen] = useState(initialProfile.addresses.length === 0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function newAddress() {
    setDraft(blank(profile.fullName, profile.addresses.length === 0));
    setEditorOpen(true);
    setError("");
    setSuccess("");
  }

  function editAddress(address: Address) {
    setDraft(toDraft(address));
    setEditorOpen(true);
    setError("");
    setSuccess("");
  }

  async function save() {
    setBusy("save");
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/account/addresses", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify(draft) });
      const body = await response.json() as Profile & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Η διεύθυνση δεν αποθηκεύτηκε.");
      setProfile(body);
      setDraft(blank(body.fullName, body.addresses.length === 0));
      setEditorOpen(false);
      setSuccess("Η διεύθυνση αποθηκεύτηκε.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η διεύθυνση δεν αποθηκεύτηκε.");
    } finally {
      setBusy("");
    }
  }

  async function remove(address: Address) {
    if (!window.confirm(`Να διαγραφεί η διεύθυνση «${address.label}»;`)) return;
    setBusy(`delete-${address.id}`);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/account/addresses", { method: "DELETE", headers: { "content-type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify({ id: address.id }) });
      const body = await response.json() as Profile & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Η διεύθυνση δεν διαγράφηκε.");
      setProfile(body);
      setSuccess("Η διεύθυνση διαγράφηκε.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η διεύθυνση δεν διαγράφηκε.");
    } finally {
      setBusy("");
    }
  }

  return <section className="shell customer-account-page">
    <div className="customer-page-heading"><div><div className="eyebrow">Τα στοιχεία μου</div><h1>Προφίλ & διευθύνσεις</h1></div><p>Διαχειρίσου τα στοιχεία που χρησιμοποιούνται για παράδοση και τιμολόγηση πριν φτάσεις στο checkout.</p></div>
    {error && <p className="account-action-error" role="alert">{error}</p>}
    {success && <p className="privacy-status" role="status">{success}</p>}
    <div className="customer-account-grid">
      <article className="customer-account-panel">
        <div className="eyebrow">Λογαριασμός</div><h2>Στοιχεία λογαριασμού</h2>
        <div className="customer-account-panel-list">
          <div className="customer-account-panel-row"><div><strong>Email</strong><small>Χρησιμοποιείται για σύνδεση και σημαντικές ενημερώσεις.</small></div><span>{email}</span></div>
          <div className="customer-account-panel-row"><div><strong>Ονοματεπώνυμο</strong><small>Προέρχεται από τον λογαριασμό σου.</small></div><span>{profile.fullName || "—"}</span></div>
        </div>
        <CustomerHowItWorks title="Ποια στοιχεία χρησιμοποιούνται στην αγορά;"><p>Η διεύθυνση τιμολόγησης χρησιμοποιείται για τα στοιχεία της συναλλαγής. Η διεύθυνση παράδοσης χρησιμοποιείται μόνο όταν η παραγγελία χρειάζεται φυσική παράδοση. Μπορείς να ορίσεις διαφορετικές προεπιλογές.</p></CustomerHowItWorks>
      </article>
      <article className="customer-account-panel">
        <div className="account-card-head"><div><div className="eyebrow">Διευθύνσεις</div><h2>Παράδοση & τιμολόγηση</h2></div><button className="button button-secondary" type="button" onClick={newAddress}>+ Νέα διεύθυνση</button></div>
        {profile.addresses.length ? <div className="customer-address-grid">{profile.addresses.map((address) => <article className="customer-address-card" key={address.id}>
          <div className="customer-address-card-head"><h3>{address.label}</h3><button className="text-button" type="button" onClick={() => editAddress(address)}>Επεξεργασία</button></div>
          <div className="customer-address-badges">{address.isDefaultBilling && <span>Προεπιλογή τιμολόγησης</span>}{address.isDefaultDelivery && <span>Προεπιλογή παράδοσης</span>}</div>
          <p><strong>{address.fullName}</strong>{address.companyName ? ` · ${address.companyName}` : ""}</p>
          <p>{address.line1}{address.line2 ? `, ${address.line2}` : ""}<br />{address.postcode} {address.locality}{address.region ? ` · ${address.region}` : ""}</p>
          {address.phone && <p>Τηλ. {address.phone}</p>}{address.vatNumber && <p>ΑΦΜ {address.vatNumber}</p>}
          <div className="customer-address-actions"><button className="text-button" type="button" disabled={busy === `delete-${address.id}`} onClick={() => void remove(address)}>{busy === `delete-${address.id}` ? "Διαγραφή…" : "Διαγραφή"}</button></div>
        </article>)}</div> : <div className="account-empty"><p>Δεν έχεις ακόμη αποθηκευμένη διεύθυνση.</p></div>}
      </article>
    </div>

    {editorOpen && <article className="customer-account-panel" style={{marginTop:14}}>
      <div className="account-card-head"><div><div className="eyebrow">{draft.id ? "Επεξεργασία" : "Νέα διεύθυνση"}</div><h2>{draft.id ? draft.label : "Πρόσθεσε διεύθυνση"}</h2></div><button className="text-button" type="button" onClick={() => setEditorOpen(false)}>Κλείσιμο</button></div>
      <div className="customer-address-form">
        <label>Όνομα διεύθυνσης<input value={draft.label} maxLength={80} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></label>
        <label>Ονοματεπώνυμο<input value={draft.fullName} maxLength={160} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} /></label>
        <label>Εταιρεία (προαιρετικά)<input value={draft.companyName} maxLength={200} onChange={(event) => setDraft({ ...draft, companyName: event.target.value })} /></label>
        <label>ΑΦΜ (προαιρετικά)<input value={draft.vatNumber} maxLength={40} onChange={(event) => setDraft({ ...draft, vatNumber: event.target.value })} /></label>
        <label className="is-wide">Διεύθυνση<input value={draft.line1} maxLength={240} onChange={(event) => setDraft({ ...draft, line1: event.target.value })} /></label>
        <label className="is-wide">Συμπληρωματικά στοιχεία<input value={draft.line2} maxLength={240} onChange={(event) => setDraft({ ...draft, line2: event.target.value })} /></label>
        <label>Πόλη<input value={draft.locality} maxLength={120} onChange={(event) => setDraft({ ...draft, locality: event.target.value })} /></label>
        <label>Περιφέρεια<input value={draft.region} maxLength={120} onChange={(event) => setDraft({ ...draft, region: event.target.value })} /></label>
        <label>ΤΚ<input value={draft.postcode} maxLength={16} inputMode="numeric" onChange={(event) => setDraft({ ...draft, postcode: event.target.value })} /></label>
        <label>Χώρα<input value={draft.countryCode} maxLength={2} onChange={(event) => setDraft({ ...draft, countryCode: event.target.value.toUpperCase() })} /></label>
        <label>Τηλέφωνο<input value={draft.phone} maxLength={40} autoComplete="tel" onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
        <label className="checkbox-row"><input type="checkbox" checked={draft.isDefaultBilling} onChange={(event) => setDraft({ ...draft, isDefaultBilling: event.target.checked })} />Προεπιλογή για τιμολόγηση</label>
        <label className="checkbox-row"><input type="checkbox" checked={draft.isDefaultDelivery} onChange={(event) => setDraft({ ...draft, isDefaultDelivery: event.target.checked })} />Προεπιλογή για παράδοση</label>
      </div>
      <div className="hero-actions" style={{marginTop:14}}><button className="button" type="button" disabled={busy === "save" || !draft.fullName.trim() || !draft.line1.trim() || !draft.locality.trim() || !draft.postcode.trim()} onClick={() => void save()}>{busy === "save" ? "Αποθήκευση…" : "Αποθήκευση διεύθυνσης"}</button><button className="button button-secondary" type="button" onClick={() => setEditorOpen(false)}>Ακύρωση</button></div>
    </article>}
  </section>;
}
