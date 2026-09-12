"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  calculateNovaBrandsGatewayProfit,
  type NovaBrandsGatewayPricingRecommendation
} from "../lib/nova-brandsgateway-pricing";
import { DropshippingProductFieldControls } from "./DropshippingProductFieldControls";

type Props = Readonly<{
  offerId: string;
  supplierCostMinor: number | null;
  visible: boolean;
  markupValue: number | null;
  discountValue: number | null;
  msrpMinor: number | null;
  showMsrp: boolean;
  recommendation?: NovaBrandsGatewayPricingRecommendation | null;
  useRecommendedPricingDefault?: boolean;
}>;

const euro = (minor: number | null) => minor == null
  ? "—"
  : new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);

const percent = (value: number | null) => value == null
  ? "—"
  : `${new Intl.NumberFormat("el-GR", { maximumFractionDigits: 2 }).format(value)}%`;

const shippingStatusLabel = (status: NovaBrandsGatewayPricingRecommendation["shippingStatus"]) => ({
  standalone_safe: "Καλύπτει αυτόνομα μεταφορικά",
  basket_safe: "Καλύπτει το μερίδιο καλαθιού",
  basket_dependent: "Χρειάζεται υποστήριξη καλαθιού",
  unviable: "Μη ασφαλές στο επιθυμητό περιθώριο"
}[status]);

function previewPriceMinor(costMinor: number | null, markup: number, discount: number): number | null {
  if (costMinor == null) return null;
  const safeMarkup = Math.max(0, markup);
  const safeDiscount = Math.min(100, Math.max(0, discount));
  const afterMarkupMinor = costMinor + Math.round(costMinor * safeMarkup / 100);
  return Math.max(costMinor, afterMarkupMinor - Math.round(afterMarkupMinor * safeDiscount / 100));
}

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/vendor/auth-context", { cache: "no-store" });
  if (!response.ok) throw new Error("Η συνεδρία συνεργάτη έληξε.");
  const payload = await response.json() as { csrfToken?: string };
  if (!payload.csrfToken) throw new Error("Δεν βρέθηκε ασφαλές token συνεδρίας.");
  return payload.csrfToken;
}

export function DropshippingProductControls(props: Props) {
  const router = useRouter();
  const recommendedDefault = Boolean(
    props.useRecommendedPricingDefault
    && props.recommendation?.recommendedMarkupPercent != null
    && props.recommendation.recommendedSellingPriceMinor != null
  );
  const initialMarkup = recommendedDefault ? props.recommendation?.recommendedMarkupPercent ?? 0 : props.markupValue ?? 0;
  const initialDiscount = recommendedDefault ? 0 : props.discountValue ?? 0;
  const initialPreviewMinor = previewPriceMinor(props.supplierCostMinor, initialMarkup, initialDiscount);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [markup, setMarkup] = useState(initialMarkup);
  const [discount, setDiscount] = useState(initialDiscount);
  const [visible, setVisible] = useState(props.visible);
  const [sellingPriceDraft, setSellingPriceDraft] = useState(initialPreviewMinor == null ? "" : (initialPreviewMinor / 100).toFixed(2));
  const [editingSellingPrice, setEditingSellingPrice] = useState(false);

  useEffect(() => {
    if (busy || editingSellingPrice) return;
    setMarkup(initialMarkup);
    setDiscount(initialDiscount);
    setVisible(props.visible);
  }, [busy, editingSellingPrice, initialDiscount, initialMarkup, props.visible]);

  const previewMinor = useMemo(
    () => previewPriceMinor(props.supplierCostMinor, markup, discount),
    [props.supplierCostMinor, markup, discount]
  );

  useEffect(() => {
    if (!editingSellingPrice) {
      setSellingPriceDraft(previewMinor == null ? "" : (previewMinor / 100).toFixed(2));
    }
  }, [previewMinor, editingSellingPrice]);

  const liveProfit = useMemo(() => {
    if (!props.recommendation || props.recommendation.landedCostMinor == null) {
      return { profitMinor: null, profitPercent: null };
    }
    return calculateNovaBrandsGatewayProfit({
      sellingPriceMinor: previewMinor,
      landedCostMinor: props.recommendation.landedCostMinor,
      vatRate: props.recommendation.vatRate,
      transactionRate: props.recommendation.transactionRate
    });
  }, [previewMinor, props.recommendation]);

  function commitSellingPrice() {
    setEditingSellingPrice(false);
    if (props.supplierCostMinor == null || props.supplierCostMinor <= 0) return;
    const parsed = Number(sellingPriceDraft.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setSellingPriceDraft(previewMinor == null ? "" : (previewMinor / 100).toFixed(2));
      return;
    }
    const targetMinor = Math.max(props.supplierCostMinor, Math.round(parsed * 100));
    const safeDiscount = Math.min(100, Math.max(0, discount));
    const effectiveDiscount = safeDiscount >= 100 ? 0 : safeDiscount;
    if (safeDiscount >= 100) setDiscount(0);
    const priceBeforeDiscountMinor = targetMinor / (1 - effectiveDiscount / 100);
    const nextMarkup = Math.max(0, ((priceBeforeDiscountMinor / props.supplierCostMinor) - 1) * 100);
    setMarkup(Math.round((nextMarkup + Number.EPSILON) * 100) / 100);
  }

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
      setMessage("Αποθηκεύτηκε ως manual override");
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
      const payload = await response.json() as { error?: string; markupPercent?: number; discountPercent?: number; visible?: boolean };
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
      <div className="workspace-compact-row"><strong>MSRP / Προτεινόμενη λιανική</strong><span>{euro(props.msrpMinor)}</span><small>Supplier τιμή αναφοράς · δεν περιορίζει το auto price</small></div>
      {props.recommendation ? <>
        <div className="workspace-compact-row"><strong>Προτεινόμενη τιμή πώλησης</strong><span>{euro(props.recommendation.recommendedSellingPriceMinor)}</span><small>Shipping-aware · Greece Economy · κατάληξη 4,90 / 9,90</small></div>
        {props.recommendation.overpriced ? <div className="workspace-compact-row"><strong>Internal flag</strong><span>OVERPRICED</span><small>{euro(props.recommendation.overpricedByMinor)} πάνω από MSRP · {percent(props.recommendation.overpricedByPercent)}</small></div> : null}
        <div className="workspace-compact-row"><strong>Κέρδος €</strong><span>{euro(liveProfit.profitMinor)}</span><small>Στην τρέχουσα τιμή πώλησης</small></div>
        <div className="workspace-compact-row"><strong>Κέρδος %</strong><span>{percent(liveProfit.profitPercent)}</span><small>Μετά VAT, transaction cost και ενσωματωμένο shipping reserve</small></div>
        <div className="workspace-compact-row"><strong>Shipping reserve</strong><span>{euro(props.recommendation.embeddedShippingMinor)}</span><small>{shippingStatusLabel(props.recommendation.shippingStatus)} · absorption {percent(props.recommendation.shippingAbsorptionScore == null ? null : props.recommendation.shippingAbsorptionScore * 100)}</small></div>
      </> : null}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(90px,1fr))", gap: 8 }}>
      <label><small>Τιμή πώλησης €</small><input type="text" inputMode="decimal" value={sellingPriceDraft} onFocus={() => setEditingSellingPrice(true)} onChange={(event) => setSellingPriceDraft(event.target.value)} onBlur={commitSellingPrice} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} style={{ width: "100%" }} /></label>
      <label><small>Markup %</small><input type="number" min="0" max="1000" step="0.01" value={markup} onChange={(event) => setMarkup(Number(event.target.value))} style={{ width: "100%" }} /></label>
      <label><small>Έκπτωση %</small><input type="number" min="0" max="100" step="0.1" value={discount} onChange={(event) => setDiscount(Number(event.target.value))} style={{ width: "100%" }} /></label>
    </div>
    {previewMinor != null ? <small>Υπολογισμένη τελική τιμή: <strong>{euro(previewMinor)}</strong>{recommendedDefault ? " · προ-συμπληρωμένη από το pricing engine" : ""}</small> : null}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className="button button-secondary" type="button" onClick={savePricing} disabled={busy || props.supplierCostMinor == null}>Αποθήκευση manual override</button>
      <button className="button button-secondary" type="button" onClick={toggleVisibility} disabled={busy}>{visible ? "Απόκρυψη" : "Δημοσίευση"}</button>
      <button className="button button-secondary" type="button" onClick={resetToSupplierDefaults} disabled={busy || props.supplierCostMinor == null}>Reset στα supplier defaults</button>
    </div>
    <DropshippingProductFieldControls offerId={props.offerId} />
    {message ? <small role="status">{message}</small> : null}
  </div>;
}
