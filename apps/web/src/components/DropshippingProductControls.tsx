"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DropshippingProductFieldControls } from "./DropshippingProductFieldControls";

type Props = Readonly<{
  offerId: string;
  supplierCostMinor: number | null;
  visible: boolean;
  markupValue: number | null;
  discountValue: number | null;
  msrpMinor: number | null;
  showMsrp: boolean;
}>;

const euro = (minor: number | null) => minor == null
  ? "—"
  : new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/vendor/auth-context", { cache: "no-store" });
  if (!response.ok) throw new Error("Η συνεδρία συνεργάτη έληξε.");
  const payload = await response.json() as { csrfToken?: string };
  if (!payload.csrfToken) throw new Error("Δεν βρέθηκε ασφαλές token συνεδρίας.");
  return payload.csrfToken;
}

export function DropshippingProductControls(props: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [markup, setMarkup] = useState(props.markupValue ?? 0);
  const [discount, setDiscount] = useState(props.discountValue ?? 0);
  const [visible, setVisible] = useState(props.visible);

  const previewMinor = useMemo(() => {
    if (props.supplierCostMinor == null) return null;
    const safeMarkup = Math.max(0, markup);
    const safeDiscount = Math.min(100, Math.max(0, discount));
    const afterMarkupMinor = props.supplierCostMinor
      + Math.round(props.supplierCostMinor * safeMarkup / 100);
    return Math.max(
      props.supplierCostMinor,
      afterMarkupMinor - Math.round(afterMarkupMinor * safeDiscount / 100)
    );
  }, [props.supplierCostMinor, markup, discount]);

  async function savePricing() {
    if (props.supplierCostMinor == null) {
      setMessage("Δεν υπάρχει ακόμη τιμή αγοράς από τον προμηθευτή.");
      return;
    }
    setBusy(true); setMessage("");
    try {
      const token = await csrfToken();
      const response = await fetch("/api/vendor/catalog/price", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-csrf-token": token },
        body: JSON.stringify({
          offerId: props.offerId,
          pricingMode: "calculated",
          buyingPriceMinor: props.supplierCostMinor,
          markupType: "percent",
          markupValue: Math.max(0, markup),
          discountType: discount > 0 ? "percent" : null,
          discountValue: discount > 0 ? Math.min(100, Math.max(0, discount)) : null,
          showMsrp: props.showMsrp
        })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η αποθήκευση τιμής απέτυχε.");
      setMessage("Αποθηκεύτηκε");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Η αποθήκευση απέτυχε."); }
    finally { setBusy(false); }
  }

  async function toggleVisibility() {
    setBusy(true); setMessage("");
    try {
      const token = await csrfToken();
      const next = !visible;
      const response = await fetch("/api/vendor/catalog/visibility", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-csrf-token": token },
        body: JSON.stringify({ scope: "product", offerId: props.offerId, visible: next })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η αλλαγή ορατότητας απέτυχε.");
      setVisible(next);
      setMessage(next ? "Δημοσιεύτηκε" : "Κρύφτηκε");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Η αλλαγή απέτυχε."); }
    finally { setBusy(false); }
  }

  async function resetToSupplierDefaults() {
    const confirmed = window.confirm("Επαναφορά αυτού του προϊόντος στα αποθηκευμένα supplier defaults; Το per-product markup, discount και visibility override θα αντικατασταθούν.");
    if (!confirmed) return;
    setBusy(true); setMessage("");
    try {
      const token = await csrfToken();
      const response = await fetch("/api/vendor/dropshipping/actions", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": token },
        body: JSON.stringify({ action: "reset-product", offerId: props.offerId })
      });
      const payload = await response.json() as {
        error?: string;
        markupPercent?: number;
        discountPercent?: number;
        visible?: boolean;
      };
      if (!response.ok) throw new Error(payload.error ?? "Η επαναφορά στα supplier defaults απέτυχε.");
      if (typeof payload.markupPercent === "number") setMarkup(payload.markupPercent);
      if (typeof payload.discountPercent === "number") setDiscount(payload.discountPercent);
      if (typeof payload.visible === "boolean") setVisible(payload.visible);
      setMessage("Επαναφέρθηκε στα supplier defaults");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Η επαναφορά απέτυχε."); }
    finally { setBusy(false); }
  }

  return <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
    <div className="workspace-compact-list">
      <div className="workspace-compact-row">
        <strong>MSRP / Προτεινόμενη λιανική</strong>
        <span>{euro(props.msrpMinor)}</span>
        <small>Supplier τιμή αναφοράς · διατηρείται ανεξάρτητα από markup και έκπτωση</small>
      </div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(110px,1fr))", gap: 8 }}>
      <label><small>Markup %</small><input type="number" min="0" max="1000" step="0.1" value={markup} onChange={(event) => setMarkup(Number(event.target.value))} style={{ width: "100%" }} /></label>
      <label><small>Έκπτωση %</small><input type="number" min="0" max="100" step="0.1" value={discount} onChange={(event) => setDiscount(Number(event.target.value))} style={{ width: "100%" }} /></label>
    </div>
    {previewMinor != null ? <small>Προεπισκόπηση τελικής τιμής: <strong>{new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(previewMinor / 100)}</strong></small> : null}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className="button button-secondary" type="button" onClick={savePricing} disabled={busy || props.supplierCostMinor == null}>Αποθήκευση τιμής</button>
      <button className="button button-secondary" type="button" onClick={toggleVisibility} disabled={busy}>{visible ? "Απόκρυψη" : "Δημοσίευση"}</button>
      <button className="button button-secondary" type="button" onClick={resetToSupplierDefaults} disabled={busy || props.supplierCostMinor == null}>Reset στα supplier defaults</button>
    </div>
    <DropshippingProductFieldControls offerId={props.offerId} />
    {message ? <small role="status">{message}</small> : null}
  </div>;
}
