"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PriceProduct = Readonly<{
  offerId: string;
  canonicalVariantId: string;
  title: string;
  vendorSku?: string;
  gtin?: string;
  brand?: string;
  retailPrice: string;
  retailPriceMinor: number;
  updatedAt: number;
}>;

type Props = Readonly<{
  csrfToken: string;
  products: ReadonlyArray<PriceProduct>;
}>;

const toDraft = (minor: number) => (minor / 100).toFixed(2);
const when = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));

export function VendorPriceManager({ csrfToken, products }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(products.map((item) => [item.offerId, toDraft(item.retailPriceMinor)])));

  useEffect(() => {
    setDrafts(Object.fromEntries(products.map((item) => [item.offerId, toDraft(item.retailPriceMinor)])));
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

  async function save(item: PriceProduct) {
    const draft = drafts[item.offerId] ?? toDraft(item.retailPriceMinor);
    const euros = Number(draft.replace(",", "."));
    const priceMinor = Math.round(euros * 100);
    if (!Number.isFinite(euros) || euros < 0 || !Number.isSafeInteger(priceMinor)) {
      setError("Η τιμή πρέπει να είναι έγκυρο μη αρνητικό ποσό.");
      return;
    }

    setBusy(item.offerId);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/vendor/catalog/price", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ offerId: item.offerId, priceMinor })
      });
      const payload = await response.json() as { error?: string; changed?: boolean };
      if (!response.ok) throw new Error(payload.error ?? "Η αλλαγή τιμής δεν αποθηκεύτηκε.");
      setSuccess(payload.changed === false ? `Η τιμή του «${item.title}» ήταν ήδη ίδια.` : `Η νέα τιμή του «${item.title}» αποθηκεύτηκε.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η αλλαγή τιμής δεν αποθηκεύτηκε.");
    } finally {
      setBusy("");
    }
  }

  return <details className="workspace-tool-panel">
    <summary>
      <span>
        <strong>Επεξεργασία τιμών προϊόντων</strong>
        <small>Άλλαξε την τελική τιμή πώλησης ανά προϊόν. Η αλλαγή αποθηκεύεται με ιστορικό και ενημερώνει το ΚΟΝΤΑ ΜΟΥ.</small>
      </span>
    </summary>
    <div className="workspace-tool-body">
      <div className="workspace-form-field">
        <label htmlFor="vendor-price-search">Αναζήτηση προϊόντος</label>
        <input id="vendor-price-search" type="search" placeholder="Όνομα, SKU, GTIN, μάρκα ή product reference…" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {success && <div className="workspace-empty-state" role="status"><strong>{success}</strong></div>}
      {matches.length === 0 ? <div className="workspace-empty-state"><strong>Δεν βρέθηκαν προϊόντα.</strong><span>Δοκίμασε διαφορετικό τίτλο, SKU ή GTIN.</span></div> : <div className="workspace-queue-list">
        {matches.map((item) => {
          const draft = drafts[item.offerId] ?? toDraft(item.retailPriceMinor);
          const parsed = Number(draft.replace(",", "."));
          const changed = Number.isFinite(parsed) && Math.round(parsed * 100) !== item.retailPriceMinor;
          return <article className="workspace-queue-card" key={item.offerId}>
            <div className="workspace-queue-head">
              <div><strong>{item.title}</strong><small>{[item.brand, item.vendorSku ? `SKU ${item.vendorSku}` : "", item.gtin ? `GTIN ${item.gtin}` : ""].filter(Boolean).join(" · ") || item.canonicalVariantId}</small></div>
              <span className="status-pill">Τώρα {item.retailPrice}</span>
            </div>
            <div className="workspace-form-actions" style={{ alignItems: "end" }}>
              <div className="workspace-form-field" style={{ minWidth: 180, margin: 0 }}>
                <label htmlFor={`vendor-price-${item.offerId}`}>Νέα τιμή πώλησης (€)</label>
                <input id={`vendor-price-${item.offerId}`} type="number" min="0" max="1000000" step="0.01" inputMode="decimal" value={draft} onChange={(event) => setDrafts((current) => ({ ...current, [item.offerId]: event.target.value }))} />
              </div>
              <button type="button" className="button" disabled={busy === item.offerId || !changed} onClick={() => void save(item)}>{busy === item.offerId ? "Αποθήκευση…" : "Αποθήκευση τιμής"}</button>
            </div>
            <small>Τελευταία ενημέρωση {when(item.updatedAt)} · Κάθε πραγματική αλλαγή δημιουργεί νέο ιστορικό τιμής.</small>
          </article>;
        })}
      </div>}
      {products.length > matches.length && <p className="workspace-queue-summary">Εμφανίζονται έως 40 αποτελέσματα. Χρησιμοποίησε την αναζήτηση για να βρεις οποιοδήποτε άλλο προϊόν.</p>}
    </div>
  </details>;
}
