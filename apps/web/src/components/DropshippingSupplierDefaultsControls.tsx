"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DropshippingSupplierDefaults } from "../lib/vendor-dropshipping-service";

type Props = Readonly<{
  supplierCode: string;
  defaults: DropshippingSupplierDefaults;
}>;

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/vendor/auth-context", { cache: "no-store" });
  if (!response.ok) throw new Error("Η συνεδρία συνεργάτη έληξε.");
  const payload = await response.json() as { csrfToken?: string };
  if (!payload.csrfToken) throw new Error("Δεν βρέθηκε ασφαλές token συνεδρίας.");
  return payload.csrfToken;
}

export function DropshippingSupplierDefaultsControls({ supplierCode, defaults }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(defaults.visible);
  const [markupPercent, setMarkupPercent] = useState(defaults.markupPercent);
  const [discountPercent, setDiscountPercent] = useState(defaults.discountPercent);
  const [showMsrp, setShowMsrp] = useState(defaults.showMsrp);
  const dirty = visible !== defaults.visible
    || markupPercent !== defaults.markupPercent
    || discountPercent !== defaults.discountPercent
    || showMsrp !== defaults.showMsrp;

  async function saveDefaults() {
    setBusy(true); setMessage("");
    try {
      const token = await csrfToken();
      const response = await fetch("/api/vendor/dropshipping/settings", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-csrf-token": token },
        body: JSON.stringify({ supplierCode, visible, markupPercent, discountPercent, showMsrp })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η αποθήκευση των global ρυθμίσεων απέτυχε.");
      setMessage("Οι global ρυθμίσεις αποθηκεύτηκαν. Πάτησε εφαρμογή για το τρέχον catalogue.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η αποθήκευση απέτυχε.");
    } finally { setBusy(false); }
  }

  async function applyDefaults() {
    const confirmed = window.confirm("Εφαρμογή των global markup/discount/MSRP ρυθμίσεων στα προϊόντα αυτού του supplier; Οι χειροκίνητες Public/Hidden επιλογές ανά προϊόν θα διατηρηθούν. Draft, inactive, suppressed ή recalled προϊόντα παραμένουν hidden.");
    if (!confirmed) return;
    setBusy(true); setMessage("");
    try {
      const token = await csrfToken();
      const response = await fetch("/api/vendor/dropshipping/settings", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": token },
        body: JSON.stringify({ supplierCode })
      });
      const payload = await response.json() as { error?: string; pricedProducts?: number; visibleProducts?: number; overriddenProducts?: number };
      if (!response.ok) throw new Error(payload.error ?? "Η εφαρμογή των global ρυθμίσεων απέτυχε.");
      setMessage(`Εφαρμόστηκαν σε ${payload.pricedProducts ?? 0} προϊόντα · public ${payload.visibleProducts ?? 0} · manual visibility overrides διατηρήθηκαν ${payload.overriddenProducts ?? 0}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η εφαρμογή απέτυχε.");
    } finally { setBusy(false); }
  }

  async function bulkVisibility(nextVisible: boolean) {
    const confirmed = window.confirm(nextVisible
      ? "Μαζική δημοσίευση όλων των eligible προϊόντων αυτού του supplier; Θα δημοσιευτούν μόνο approved/active προϊόντα με buying price, ασφαλές canonical status και τελική τιμή τουλάχιστον ίση με το supplier cost."
      : "Μαζική απόκρυψη όλων των προϊόντων αυτού του supplier από το storefront;");
    if (!confirmed) return;
    setBusy(true); setMessage("");
    try {
      const token = await csrfToken();
      const response = await fetch("/api/vendor/dropshipping/actions", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": token },
        body: JSON.stringify({ action: "set-supplier-visibility", supplierCode, visible: nextVisible })
      });
      const payload = await response.json() as { error?: string; affectedProducts?: number; visibleProducts?: number };
      if (!response.ok) throw new Error(payload.error ?? "Η μαζική αλλαγή ορατότητας απέτυχε.");
      setMessage(nextVisible
        ? `Ελέγχθηκαν ${payload.affectedProducts ?? 0} προϊόντα · public ${payload.visibleProducts ?? 0}.`
        : `Κρύφτηκαν τα προϊόντα του supplier (${payload.affectedProducts ?? 0} ελεγμένα).`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η μαζική αλλαγή απέτυχε.");
    } finally { setBusy(false); }
  }

  return <div className="workspace-queue-card" style={{ marginBottom: 14 }}>
    <div className="workspace-queue-head">
      <div><strong>Global supplier settings</strong><small>{defaults.configured ? "Αποθηκευμένα defaults" : "Δεν έχουν οριστεί ακόμη"}</small></div>
      <span className="vendor-merchant-status">{visible ? "Public eligible" : "Hidden eligible"}</span>
    </div>
    <p style={{ marginTop: 10 }}>Η ορατότητα εδώ είναι το supplier default. Μπορείς μετά να κάνεις Public/Hidden ένα προϊόν ξεχωριστά από την κάρτα του· αυτή η χειροκίνητη επιλογή έχει προτεραιότητα στις επόμενες εφαρμογές defaults. Το “Reset στα supplier defaults” στην κάρτα αφαιρεί ξανά το override.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
      <label><small>Global markup %</small><input type="number" min="0" max="1000" step="0.1" value={markupPercent} onChange={(event) => setMarkupPercent(Number(event.target.value))} style={{ width: "100%" }} /></label>
      <label><small>Global discount %</small><input type="number" min="0" max="100" step="0.1" value={discountPercent} onChange={(event) => setDiscountPercent(Number(event.target.value))} style={{ width: "100%" }} /></label>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /> <span>Approved products public</span></label>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={showMsrp} onChange={(event) => setShowMsrp(event.target.checked)} /> <span>Show supplier MSRP</span></label>
    </div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
      <button className="button button-secondary" type="button" disabled={busy || !dirty} onClick={saveDefaults}>Αποθήκευση defaults</button>
      <button className="button" type="button" disabled={busy || !defaults.configured || dirty} onClick={applyDefaults}>Εφαρμογή defaults</button>
      <button className="button button-secondary" type="button" disabled={busy} onClick={() => bulkVisibility(true)}>Bulk publish eligible</button>
      <button className="button button-secondary" type="button" disabled={busy} onClick={() => bulkVisibility(false)}>Bulk hide all</button>
    </div>
    <small style={{ display: "block", marginTop: 8 }}>Η εφαρμογή ενημερώνει pricing/MSRP στα συνδεδεμένα προϊόντα με έγκυρη supplier buying price και χρησιμοποιεί το global visibility μόνο όπου δεν υπάρχει manual product override. Hard safety gates πάντα υπερισχύουν. Τα bulk visibility actions αλλάζουν το τρέχον catalogue χωρίς να αλλάζουν τα αποθηκευμένα defaults.</small>
    {message ? <small role="status" style={{ display: "block", marginTop: 8 }}>{message}</small> : null}
  </div>;
}
