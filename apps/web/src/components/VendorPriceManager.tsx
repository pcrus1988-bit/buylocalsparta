"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PricingMode = "manual" | "calculated";
type AdjustmentType = "percent" | "fixed" | "";

type PriceProduct = Readonly<{
  offerId: string;
  canonicalVariantId: string;
  title: string;
  vendorSku?: string;
  gtin?: string;
  brand?: string;
  retailPrice: string;
  retailPriceMinor: number;
  buyingPriceMinor?: number;
  pricingMode: PricingMode;
  markupType?: "percent" | "fixed";
  markupValue?: number;
  discountType?: "percent" | "fixed";
  discountValue?: number;
  msrpMinor?: number;
  showMsrp: boolean;
  updatedAt: number;
}>;

type Draft = {
  pricingMode: PricingMode;
  buyingPrice: string;
  retailPrice: string;
  markupType: AdjustmentType;
  markupValue: string;
  discountType: AdjustmentType;
  discountValue: string;
  msrp: string;
  showMsrp: boolean;
};

type Props = Readonly<{
  csrfToken: string;
  products: ReadonlyArray<PriceProduct>;
}>;

const toDraft = (minor: number) => (minor / 100).toFixed(2);
const toOptionalDraft = (minor?: number) => minor === undefined ? "" : toDraft(minor);
const when = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));
const euro = (minor: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);

function initialDraft(item: PriceProduct): Draft {
  return {
    pricingMode: item.pricingMode,
    buyingPrice: toOptionalDraft(item.buyingPriceMinor),
    retailPrice: toDraft(item.retailPriceMinor),
    markupType: item.markupType ?? "",
    markupValue: item.markupValue === undefined ? "" : String(item.markupValue),
    discountType: item.discountType ?? "",
    discountValue: item.discountValue === undefined ? "" : String(item.discountValue),
    msrp: toOptionalDraft(item.msrpMinor),
    showMsrp: item.showMsrp
  };
}

function decimal(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function minor(value: string): number | undefined {
  const parsed = decimal(value);
  if (parsed === undefined) return undefined;
  return Math.round(parsed * 100);
}

function calculatedRetailMinor(draft: Draft): number | undefined {
  const buying = minor(draft.buyingPrice);
  if (buying === undefined || !Number.isSafeInteger(buying) || buying < 0) return undefined;
  const markupValue = decimal(draft.markupValue) ?? 0;
  const discountValue = decimal(draft.discountValue) ?? 0;
  if (!Number.isFinite(markupValue) || !Number.isFinite(discountValue) || markupValue < 0 || discountValue < 0) return undefined;
  if (draft.discountType === "percent" && discountValue > 100) return undefined;
  const markupMinor = draft.markupType === "percent" ? Math.round(buying * markupValue / 100) : draft.markupType === "fixed" ? Math.round(markupValue * 100) : 0;
  const afterMarkup = buying + markupMinor;
  const discountMinor = draft.discountType === "percent" ? Math.round(afterMarkup * discountValue / 100) : draft.discountType === "fixed" ? Math.round(discountValue * 100) : 0;
  const result = Math.max(0, afterMarkup - discountMinor);
  return Number.isSafeInteger(result) ? result : undefined;
}

export function VendorPriceManager({ csrfToken, products }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(products.map((item) => [item.offerId, initialDraft(item)])));

  useEffect(() => {
    setDrafts(Object.fromEntries(products.map((item) => [item.offerId, initialDraft(item)])));
  }, [products]);

  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("el");
    return products.filter((item) => {
      if (!needle) return true;
      return [item.title, item.vendorSku, item.gtin, item.brand, item.canonicalVariantId]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("el")
        .includes(needle);
    }).slice(0, 40);
  }, [products, query]);

  function updateDraft(offerId: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [offerId]: { ...(current[offerId] ?? initialDraft(products.find((item) => item.offerId === offerId)!)), ...patch } }));
  }

  async function save(item: PriceProduct) {
    const draft = drafts[item.offerId] ?? initialDraft(item);
    const buyingPriceMinor = minor(draft.buyingPrice);
    const manualPriceMinor = minor(draft.retailPrice);
    const previewPriceMinor = draft.pricingMode === "calculated" ? calculatedRetailMinor(draft) : manualPriceMinor;
    const msrpMinor = minor(draft.msrp);
    const markupValue = decimal(draft.markupValue);
    const discountValue = decimal(draft.discountValue);

    if (draft.pricingMode === "manual" && (manualPriceMinor === undefined || manualPriceMinor < 0)) {
      setError("Η τελική τιμή λιανικής πρέπει να είναι έγκυρο μη αρνητικό ποσό.");
      return;
    }
    if (draft.pricingMode === "calculated" && (buyingPriceMinor === undefined || previewPriceMinor === undefined)) {
      setError("Για υπολογιζόμενη τιμή χρειάζεται έγκυρη τιμή αγοράς και έγκυροι κανόνες προσαύξησης/έκπτωσης.");
      return;
    }
    if (msrpMinor !== undefined && msrpMinor < 0) {
      setError("Η MSRP πρέπει να είναι έγκυρο μη αρνητικό ποσό.");
      return;
    }

    setBusy(item.offerId);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/vendor/catalog/price", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          offerId: item.offerId,
          pricingMode: draft.pricingMode,
          priceMinor: manualPriceMinor,
          buyingPriceMinor: buyingPriceMinor ?? null,
          markupType: draft.markupType || null,
          markupValue,
          discountType: draft.discountType || null,
          discountValue,
          msrpMinor: msrpMinor ?? null,
          showMsrp: draft.showMsrp
        })
      });
      const payload = await response.json() as { error?: string; changed?: boolean; priceMinor?: number };
      if (!response.ok) throw new Error(payload.error ?? "Η τιμολόγηση δεν αποθηκεύτηκε.");
      if (Number.isSafeInteger(payload.priceMinor)) updateDraft(item.offerId, { retailPrice: toDraft(payload.priceMinor!) });
      setSuccess(payload.changed === false ? `Η τιμολόγηση του «${item.title}» ήταν ήδη ίδια.` : `Η τιμολόγηση του «${item.title}» αποθηκεύτηκε.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η τιμολόγηση δεν αποθηκεύτηκε.");
    } finally {
      setBusy("");
    }
  }

  return <details className="workspace-tool-panel">
    <summary>
      <span>
        <strong>Τιμολόγηση προϊόντων</strong>
        <small>Τιμή αγοράς ιδιωτικά, χειροκίνητη ή υπολογιζόμενη λιανική, markup, έκπτωση και προαιρετική δημόσια MSRP.</small>
      </span>
    </summary>
    <div className="workspace-tool-body">
      <div className="workspace-inline-note"><strong>Απόρρητο:</strong> η τιμή αγοράς και οι κανόνες markup/έκπτωσης είναι ορατοί μόνο στο δικό σου backoffice. Ο πελάτης λαμβάνει μόνο την τελική λιανική και, αν το επιλέξεις, την MSRP.</div>
      <div className="workspace-form-field">
        <label htmlFor="vendor-price-search">Αναζήτηση προϊόντος</label>
        <input id="vendor-price-search" type="search" placeholder="Όνομα, SKU, GTIN, μάρκα ή product reference…" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {success && <div className="workspace-empty-state" role="status"><strong>{success}</strong></div>}
      {matches.length === 0 ? <div className="workspace-empty-state"><strong>Δεν βρέθηκαν προϊόντα.</strong><span>Δοκίμασε διαφορετικό τίτλο, SKU ή GTIN.</span></div> : <div className="workspace-queue-list">
        {matches.map((item) => {
          const draft = drafts[item.offerId] ?? initialDraft(item);
          const finalMinor = draft.pricingMode === "calculated" ? calculatedRetailMinor(draft) : minor(draft.retailPrice);
          const buyingMinor = minor(draft.buyingPrice);
          const msrpMinor = minor(draft.msrp);
          const differenceMinor = finalMinor !== undefined && buyingMinor !== undefined ? finalMinor - buyingMinor : undefined;
          return <article className="workspace-queue-card" key={item.offerId}>
            <div className="workspace-queue-head">
              <div><strong>{item.title}</strong><small>{[item.brand, item.vendorSku ? `SKU ${item.vendorSku}` : "", item.gtin ? `GTIN ${item.gtin}` : ""].filter(Boolean).join(" · ") || item.canonicalVariantId}</small></div>
              <span className="status-pill">Τώρα {item.retailPrice}</span>
            </div>

            <div className="workspace-form-field">
              <label htmlFor={`pricing-mode-${item.offerId}`}>Τρόπος τιμολόγησης</label>
              <select id={`pricing-mode-${item.offerId}`} value={draft.pricingMode} onChange={(event) => updateDraft(item.offerId, { pricingMode: event.target.value as PricingMode })}>
                <option value="manual">Χειροκίνητα</option>
                <option value="calculated">Υπολογισμός: αγορά → markup → έκπτωση</option>
              </select>
            </div>

            <div className="workspace-form-actions" style={{ alignItems: "end", flexWrap: "wrap" }}>
              <div className="workspace-form-field" style={{ minWidth: 170, margin: 0 }}>
                <label htmlFor={`buying-${item.offerId}`}>Τιμή αγοράς (€)</label>
                <input id={`buying-${item.offerId}`} type="number" min="0" max="1000000" step="0.01" inputMode="decimal" value={draft.buyingPrice} onChange={(event) => updateDraft(item.offerId, { buyingPrice: event.target.value })} />
                <small>🔒 Μόνο για εσάς — δεν εμφανίζεται στους πελάτες.</small>
              </div>

              <div className="workspace-form-field" style={{ minWidth: 150, margin: 0 }}>
                <label htmlFor={`markup-type-${item.offerId}`}>Markup</label>
                <select id={`markup-type-${item.offerId}`} value={draft.markupType} onChange={(event) => updateDraft(item.offerId, { markupType: event.target.value as AdjustmentType })}>
                  <option value="">Χωρίς</option><option value="percent">Ποσοστό %</option><option value="fixed">Ποσό €</option>
                </select>
                <input aria-label="Τιμή markup" type="number" min="0" step="0.01" inputMode="decimal" disabled={!draft.markupType} value={draft.markupValue} onChange={(event) => updateDraft(item.offerId, { markupValue: event.target.value })} />
              </div>

              <div className="workspace-form-field" style={{ minWidth: 150, margin: 0 }}>
                <label htmlFor={`discount-type-${item.offerId}`}>Έκπτωση</label>
                <select id={`discount-type-${item.offerId}`} value={draft.discountType} onChange={(event) => updateDraft(item.offerId, { discountType: event.target.value as AdjustmentType })}>
                  <option value="">Χωρίς</option><option value="percent">Ποσοστό %</option><option value="fixed">Ποσό €</option>
                </select>
                <input aria-label="Τιμή έκπτωσης" type="number" min="0" max={draft.discountType === "percent" ? "100" : undefined} step="0.01" inputMode="decimal" disabled={!draft.discountType} value={draft.discountValue} onChange={(event) => updateDraft(item.offerId, { discountValue: event.target.value })} />
              </div>

              <div className="workspace-form-field" style={{ minWidth: 180, margin: 0 }}>
                <label htmlFor={`retail-${item.offerId}`}>Τελική τιμή λιανικής (€)</label>
                <input id={`retail-${item.offerId}`} type="number" min="0" max="1000000" step="0.01" inputMode="decimal" readOnly={draft.pricingMode === "calculated"} value={draft.pricingMode === "calculated" ? (finalMinor === undefined ? "" : toDraft(finalMinor)) : draft.retailPrice} onChange={(event) => updateDraft(item.offerId, { retailPrice: event.target.value })} />
                <small>{draft.pricingMode === "calculated" ? "Υπολογίζεται και επαληθεύεται ξανά στον server." : "Η δημόσια τιμή που χρησιμοποιεί και το checkout."}</small>
              </div>
            </div>

            <div className="workspace-form-actions" style={{ alignItems: "end", flexWrap: "wrap" }}>
              <div className="workspace-form-field" style={{ minWidth: 180, margin: 0 }}>
                <label htmlFor={`msrp-${item.offerId}`}>Προτεινόμενη λιανική MSRP (€)</label>
                <input id={`msrp-${item.offerId}`} type="number" min="0" max="1000000" step="0.01" inputMode="decimal" value={draft.msrp} onChange={(event) => updateDraft(item.offerId, { msrp: event.target.value })} />
              </div>
              <label className="workspace-inline-form" style={{ alignItems: "center" }}>
                <input type="checkbox" checked={draft.showMsrp} onChange={(event) => updateDraft(item.offerId, { showMsrp: event.target.checked })} />
                <span>Εμφάνιση MSRP στο κατάστημα</span>
              </label>
              <button type="button" className="button" disabled={busy === item.offerId} onClick={() => void save(item)}>{busy === item.offerId ? "Αποθήκευση…" : "Αποθήκευση τιμολόγησης"}</button>
            </div>

            <div className="workspace-inline-note">
              <strong>Προεπισκόπηση πελάτη:</strong> {draft.showMsrp && msrpMinor !== undefined && finalMinor !== undefined && msrpMinor > finalMinor ? <><s>{euro(msrpMinor)}</s> · </> : null}{finalMinor === undefined ? "—" : euro(finalMinor)}
              {differenceMinor !== undefined ? <span> · Ιδιωτική διαφορά λιανικής − αγοράς: {euro(differenceMinor)}</span> : null}
            </div>
            <small>Τελευταία ενημέρωση {when(item.updatedAt)} · Η πραγματική αλλαγή της τελικής λιανικής συνεχίζει να καταγράφεται στο ιστορικό τιμών.</small>
          </article>;
        })}
      </div>}
      {products.length > matches.length && <p className="workspace-queue-summary">Εμφανίζονται έως 40 αποτελέσματα. Χρησιμοποίησε την αναζήτηση για να βρεις οποιοδήποτε άλλο προϊόν.</p>}
    </div>
  </details>;
}
