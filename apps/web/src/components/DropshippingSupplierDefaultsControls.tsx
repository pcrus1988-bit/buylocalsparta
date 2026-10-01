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
      if (!response.ok) throw new Error(payload.error ?? "Η αποθήκευση των γενικών ρυθμίσεων απέτυχε.");
      setMessage("Η αυτόματη τιμολόγηση αποθηκεύτηκε για αυτόν τον προμηθευτή. Πάτησε «Εφαρμογή τιμολόγησης» για άμεση επανατιμολόγηση όλου του καταλόγου.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η αποθήκευση απέτυχε.");
    } finally { setBusy(false); }
  }

  async function applyDefaults() {
    const confirmationCode = window.prompt(
      `Μαζική ενέργεια προμηθευτή: εφαρμογή αυτόματης τιμολόγησης. Η επανατιμολόγηση γίνεται σε μικρές παρτίδες ώστε να αποφεύγονται χρονικά όρια. Οι χειροκίνητες εξαιρέσεις ορατότητας διατηρούνται και οι κανόνες ασφάλειας και διαθεσιμότητας παραμένουν σε ισχύ.\n\nΓια επιβεβαίωση γράψε ακριβώς: ${supplierCode}`
    );
    if (confirmationCode == null) return;
    if (confirmationCode.trim() !== supplierCode) {
      setMessage(`Η εφαρμογή ακυρώθηκε: ο κωδικός επιβεβαίωσης πρέπει να είναι ακριβώς ${supplierCode}.`);
      return;
    }

    setBusy(true); setMessage("");
    try {
      const token = await csrfToken();
      let cursor: string | null = null;
      let pricedProducts = 0;
      let visibleProducts = 0;
      let overriddenProducts = 0;
      let processedProducts = 0;

      for (let batch = 1; batch <= 250; batch += 1) {
        const response = await fetch("/api/vendor/dropshipping/settings", {
          method: "POST",
          headers: { "content-type": "application/json", "x-csrf-token": token },
          body: JSON.stringify({ supplierCode, confirmationCode, cursor })
        });
        const payload = await response.json() as {
          error?: string;
          pricedProducts?: number;
          visibleProducts?: number;
          overriddenProducts?: number;
          processedProducts?: number;
          nextCursor?: string | null;
          done?: boolean;
        };
        if (!response.ok) throw new Error(payload.error ?? "Η εφαρμογή του price engine απέτυχε.");

        pricedProducts += payload.pricedProducts ?? 0;
        visibleProducts += payload.visibleProducts ?? 0;
        overriddenProducts += payload.overriddenProducts ?? 0;
        processedProducts += payload.processedProducts ?? 0;

        setMessage(
          `Αυτόματη τιμολόγηση: επεξεργάστηκαν ${processedProducts} προϊόντα · επανατιμολογήθηκαν ${pricedProducts}. Συνεχίζεται σε ασφαλείς παρτίδες…`
        );

        if (payload.done === true) {
          setMessage(
            `Ολοκληρώθηκε: ${pricedProducts} προϊόντα επανατιμολογήθηκαν · public ${visibleProducts} · manual visibility overrides διατηρήθηκαν ${overriddenProducts}.`
          );
          router.refresh();
          return;
        }

        if (!payload.nextCursor || payload.nextCursor === cursor) {
          throw new Error("Η επανατιμολόγηση δεν επέστρεψε έγκυρο δείκτη συνέχισης.");
        }
        cursor = payload.nextCursor;
      }

      throw new Error("Η επανατιμολόγηση ξεπέρασε το ασφαλές όριο παρτίδων. Εκτέλεσέ την ξανά για να συνεχίσει.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η εφαρμογή απέτυχε.");
    } finally { setBusy(false); }
  }

  async function bulkVisibility(nextVisible: boolean) {
    const operation = nextVisible ? "Μαζική δημοσίευση" : "Μαζική απόκρυψη";
    const confirmationCode = window.prompt(
      nextVisible
        ? `Supplier-wide action: ${operation}. Αυτό μπορεί να αλλάξει μαζικά ολόκληρο τον supplier και καθαρίζει τα υπάρχοντα per-product visibility overrides. Marketplace/safety gates και live supplier availability εξακολουθούν να έχουν προτεραιότητα.\n\nΓια επιβεβαίωση γράψε ακριβώς: ${supplierCode}`
        : `Supplier-wide action: ${operation}. Αυτό κρύβει τα προϊόντα του supplier και καθαρίζει τα υπάρχοντα per-product visibility overrides.\n\nΓια επιβεβαίωση γράψε ακριβώς: ${supplierCode}`
    );
    if (confirmationCode == null) return;
    if (confirmationCode.trim() !== supplierCode) {
      setMessage(`Η supplier-wide ενέργεια ακυρώθηκε: ο κωδικός επιβεβαίωσης πρέπει να είναι ακριβώς ${supplierCode}.`);
      return;
    }
    setBusy(true); setMessage("");
    try {
      const token = await csrfToken();
      const response = await fetch("/api/vendor/dropshipping/actions", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": token },
        body: JSON.stringify({ action: "set-supplier-visibility", supplierCode, visible: nextVisible, confirmationCode })
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
      <div><strong>Αυτόματη τιμολόγηση · {supplierCode}</strong><small>{defaults.configured ? "Αποθηκευμένοι κανόνες τιμολόγησης" : "Δεν έχουν οριστεί ακόμη"}</small></div>
      <span className="vendor-merchant-status">{visible ? "Επιλέξιμα για δημοσίευση" : "Κρυφά"}</span>
    </div>
    <p style={{ marginTop: 10 }}>Αυτή είναι η αυτόματη τιμολόγηση του προμηθευτή: τιμή αγοράς → περιθώριο → έκπτωση. Οι αποθηκευμένοι κανόνες είναι η authoritative αυτόματη τιμολόγηση για τα προϊόντα χωρίς per-product manual override. Κάθε supplier μπορεί να έχει διαφορετικό engine. Η ορατότητα είναι supplier default και τα manual Public/Hidden overrides διατηρούνται. Το live stock συνεχίζει να έρχεται από το supplier API και τα marketplace/safety gates έχουν πάντα προτεραιότητα.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
      <label><small>Γενικό περιθώριο %</small><input type="number" min="0" max="1000" step="0.1" value={markupPercent} disabled={busy} onChange={(event) => setMarkupPercent(Number(event.target.value))} style={{ width: "100%" }} /></label>
      <label><small>Γενική έκπτωση %</small><input type="number" min="0" max="100" step="0.1" value={discountPercent} disabled={busy} onChange={(event) => setDiscountPercent(Number(event.target.value))} style={{ width: "100%" }} /></label>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={visible} disabled={busy} onChange={(event) => setVisible(event.target.checked)} /> <span>Δημοσίευση επιλέξιμων προϊόντων</span></label>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={showMsrp} disabled={busy} onChange={(event) => setShowMsrp(event.target.checked)} /> <span>Εμφάνιση προτεινόμενης λιανικής</span></label>
    </div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
      <button className="button button-secondary" type="button" disabled={busy || !dirty} onClick={saveDefaults}>Αποθήκευση ρυθμίσεων</button>
      <button className="button" type="button" disabled={busy || !defaults.configured || dirty} onClick={applyDefaults}>Εφαρμογή τιμολόγησης</button>
      <button className="button button-secondary" type="button" disabled={busy} onClick={() => bulkVisibility(true)}>Μαζική δημοσίευση</button>
      <button className="button button-secondary" type="button" disabled={busy} onClick={() => bulkVisibility(false)}>Μαζική απόκρυψη</button>
    </div>
    <small style={{ display: "block", marginTop: 8 }}>Η εφαρμογή της τιμολόγησης γίνεται σε μικρές, διαδοχικές παρτίδες ώστε μεγάλοι κατάλογοι να παραμένουν σταθεροί. Ενημερώνει supplier-wide pricing/MSRP και εφαρμόζει supplier visibility μόνο όπου επιτρέπεται. Reset ανά προϊόν αφαιρεί το pricing override αυτού του προϊόντος. Όλες οι supplier-wide ενέργειες απαιτούν τον ακριβή supplier code. Bulk publish ενεργοποιεί μόνο eligible προϊόντα· marketplace-blocked, suppressed ή recalled προϊόντα παραμένουν hidden. Το live stock δεν αλλάζει εδώ.</small>
    <DropshippingSupplierFieldControls supplierCode={supplierCode} />
    {message ? <small role="status" style={{ display: "block", marginTop: 8 }}>{message}</small> : null}
  </div>;
}
