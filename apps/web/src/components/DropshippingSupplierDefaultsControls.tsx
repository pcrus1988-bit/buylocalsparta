"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DropshippingSupplierDefaults } from "../lib/vendor-dropshipping-service";
import { DropshippingSupplierFieldControls } from "./DropshippingSupplierFieldControls";

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
      setMessage("Οι global ρυθμίσεις αποθηκεύτηκαν. Πάτησε reset catalogue για να εφαρμοστούν στις τιμές και στα προϊόντα χωρίς manual visibility override.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η αποθήκευση απέτυχε.");
    } finally { setBusy(false); }
  }

  async function applyDefaults() {
    const confirmed = window.confirm("Εφαρμογή των global ρυθμίσεων στο τρέχον catalogue; Οι global τιμές και το MSRP θα εφαρμοστούν ξανά. Τα manual Public/Hidden overrides ανά προϊόν θα διατηρηθούν. Όταν το supplier default είναι Public, ασφαλή supplier-linked draft προϊόντα εγκρίνονται αυτόματα από τον Dropshipping vendor. Marketplace moderation, suppressed/recalled και inactive προϊόντα παραμένουν κλειδωμένα.");
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
      setMessage(`Εφαρμόστηκαν σε ${payload.pricedProducts ?? 0} προϊόντα · public τώρα ${payload.visibleProducts ?? 0} · manual visibility overrides διατηρήθηκαν ${payload.overriddenProducts ?? 0}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η εφαρμογή απέτυχε.");
    } finally { setBusy(false); }
  }

  async function bulkVisibility(nextVisible: boolean) {
    const confirmed = window.confirm(nextVisible
      ? "Force publish όλων των eligible προϊόντων αυτού του supplier; Η ενέργεια εφαρμόζει νέα global κατάσταση στο τρέχον catalogue και καθαρίζει τα υπάρχοντα per-product visibility overrides. Τα ασφαλή supplier-linked draft προϊόντα εγκρίνονται αυτόματα. pending_review/rejected/archived/suppressed, inactive, recalled ή προϊόντα χωρίς έγκυρη buying/final price παραμένουν hidden."
      : "Force hide όλων των προϊόντων αυτού του supplier; Η ενέργεια καθαρίζει τα υπάρχοντα per-product visibility overrides ώστε η απόκρυψη να γίνει η νέα global τρέχουσα κατάσταση.");
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
        ? `Ελέγχθηκαν ${payload.affectedProducts ?? 0} προϊόντα · public ${payload.visibleProducts ?? 0}. Τα προηγούμενα product visibility overrides καθαρίστηκαν.`
        : `Κρύφτηκαν τα προϊόντα του supplier (${payload.affectedProducts ?? 0} ελεγμένα) και καθαρίστηκαν τα προηγούμενα product visibility overrides.`);
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
    <p style={{ marginTop: 10 }}>Η ορατότητα εδώ είναι supplier default. Μπορείς μετά να αλλάξεις Public/Hidden σε μεμονωμένο προϊόν· αυτή η επιλογή γίνεται manual override και διατηρείται όταν ξαναεφαρμόζεις τα defaults. Τα hard marketplace/safety gates έχουν πάντα προτεραιότητα.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
      <label><small>Global markup %</small><input type="number" min="0" max="1000" step="0.1" value={markupPercent} onChange={(event) => setMarkupPercent(Number(event.target.value))} style={{ width: "100%" }} /></label>
      <label><small>Global discount %</small><input type="number" min="0" max="100" step="0.1" value={discountPercent} onChange={(event) => setDiscountPercent(Number(event.target.value))} style={{ width: "100%" }} /></label>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /> <span>Eligible supplier products public</span></label>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={showMsrp} onChange={(event) => setShowMsrp(event.target.checked)} /> <span>Show supplier MSRP</span></label>
    </div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
      <button className="button button-secondary" type="button" disabled={busy || !dirty} onClick={saveDefaults}>Αποθήκευση defaults</button>
      <button className="button" type="button" disabled={busy || !defaults.configured || dirty} onClick={applyDefaults}>Reset catalogue στα defaults</button>
      <button className="button button-secondary" type="button" disabled={busy} onClick={() => bulkVisibility(true)}>Bulk publish eligible</button>
      <button className="button button-secondary" type="button" disabled={busy} onClick={() => bulkVisibility(false)}>Bulk hide all</button>
    </div>
    <small style={{ display: "block", marginTop: 8 }}>Reset catalogue: ενημερώνει pricing/MSRP και εφαρμόζει supplier visibility μόνο στα προϊόντα χωρίς manual override. Reset ανά προϊόν: αφαιρεί το override αυτού του προϊόντος. Bulk publish/hide: force global ενέργεια που καθαρίζει τα per-product visibility overrides. Safe draft supplier products μπορούν να εγκριθούν αυτόματα· marketplace-blocked, inactive, suppressed ή recalled προϊόντα παραμένουν hidden.</small>
    <DropshippingSupplierFieldControls supplierCode={supplierCode} />
    {message ? <small role="status" style={{ display: "block", marginTop: 8 }}>{message}</small> : null}
  </div>;
}
