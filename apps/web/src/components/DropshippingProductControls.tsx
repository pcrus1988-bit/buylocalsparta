"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Props = Readonly<{
  offerId: string;
  supplierCostMinor: number | null;
  visible: boolean;
  markupValue: number | null;
  discountValue: number | null;
  msrpMinor: number | null;
  showMsrp: boolean;
}>;

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
    const withMarkup = props.supplierCostMinor * (1 + Math.max(0, markup) / 100);
    return Math.max(0, Math.round(withMarkup * (1 - Math.min(100, Math.max(0, discount)) / 100)));
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
          msrpMinor: props.msrpMinor,
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

  return <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(110px,1fr))", gap: 8 }}>
      <label><small>Markup %</small><input type="number" min="0" max="1000" step="0.1" value={markup} onChange={(event) => setMarkup(Number(event.target.value))} style={{ width: "100%" }} /></label>
      <label><small>Έκπτωση %</small><input type="number" min="0" max="100" step="0.1" value={discount} onChange={(event) => setDiscount(Number(event.target.value))} style={{ width: "100%" }} /></label>
    </div>
    {previewMinor != null ? <small>Προεπισκόπηση τελικής τιμής: <strong>{new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(previewMinor / 100)}</strong></small> : null}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className="button button-secondary" type="button" onClick={savePricing} disabled={busy || props.supplierCostMinor == null}>Αποθήκευση τιμής</button>
      <button className="button button-secondary" type="button" onClick={toggleVisibility} disabled={busy}>{visible ? "Απόκρυψη" : "Δημοσίευση"}</button>
    </div>
    {message ? <small role="status">{message}</small> : null}
  </div>;
}
