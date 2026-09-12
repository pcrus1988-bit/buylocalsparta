"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DropshipPublicFields } from "../lib/dropship-presentation-policy";

type Props = Readonly<{
  offerIds: readonly string[];
  resultCount: number;
  page: number;
  activeFilterCount: number;
}>;

type BulkAction = "publish" | "hide" | "reset";

const defaultPublicFields: DropshipPublicFields = {
  model: true,
  mpn: true,
  gtin: true,
  technicalAttributes: true,
  supplierSku: false
};

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/vendor/auth-context", { cache: "no-store" });
  if (!response.ok) throw new Error("Η συνεδρία συνεργάτη έληξε.");
  const payload = await response.json() as { csrfToken?: string };
  if (!payload.csrfToken) throw new Error("Δεν βρέθηκε ασφαλές token συνεδρίας.");
  return payload.csrfToken;
}

async function runBounded<T>(items: readonly T[], worker: (item: T) => Promise<void>, concurrency = 4): Promise<readonly unknown[]> {
  const errors: unknown[] = [];
  let cursor = 0;
  async function lane() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        await worker(items[index]!);
      } catch (error) {
        errors.push(error);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => lane()));
  return errors;
}

export function DropshippingFilteredPageBulkActions({ offerIds, resultCount, page, activeFilterCount }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [markupPercent, setMarkupPercent] = useState(0);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [publicFields, setPublicFields] = useState<DropshipPublicFields>(defaultPublicFields);

  function setPublicField(key: keyof DropshipPublicFields, checked: boolean) {
    setPublicFields((current) => ({ ...current, [key]: checked }));
  }

  async function execute(action: BulkAction) {
    if (!offerIds.length) return;
    const verb = action === "publish" ? "δημοσίευση" : action === "hide" ? "απόκρυψη" : "reset στα supplier defaults";
    const confirmed = window.confirm(
      `Μαζική ${verb} για τα ${offerIds.length} προϊόντα που εμφανίζονται στην τρέχουσα σελίδα αποτελεσμάτων; `
      + "Η ενέργεια εφαρμόζεται μόνο σε αυτά τα προϊόντα και περνά από τους ίδιους supplier/moderation/safety ελέγχους με τη μεμονωμένη αλλαγή."
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage("");
    try {
      const token = await csrfToken();
      const errors = await runBounded(offerIds, async (offerId) => {
        const response = action === "reset"
          ? await fetch("/api/vendor/dropshipping/actions", {
              method: "POST",
              headers: { "content-type": "application/json", "x-csrf-token": token },
              body: JSON.stringify({ action: "reset-product", offerId })
            })
          : await fetch("/api/vendor/catalog/visibility", {
              method: "PUT",
              headers: { "content-type": "application/json", "x-csrf-token": token },
              body: JSON.stringify({ scope: "product", offerId, visible: action === "publish", minimalResponse: true })
            });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(payload.error ?? `Η ενέργεια απέτυχε για ${offerId}.`);
        }
      });

      const succeeded = offerIds.length - errors.length;
      setMessage(errors.length
        ? `Ολοκληρώθηκαν ${succeeded}/${offerIds.length}. ${errors.length} προϊόντα παρέμειναν αμετάβλητα επειδή απέτυχαν οι υπάρχοντες safety/moderation έλεγχοι.`
        : `Ολοκληρώθηκαν ${succeeded}/${offerIds.length} προϊόντα.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η μαζική ενέργεια απέτυχε.");
    } finally {
      setBusy(false);
    }
  }

  async function applyPricing() {
    if (!offerIds.length) return;
    const markup = Number(markupPercent);
    const discount = Number(discountPercent);
    if (!Number.isFinite(markup) || markup < 0 || markup > 1000) {
      setMessage("Το markup πρέπει να είναι από 0% έως 1000%.");
      return;
    }
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      setMessage("Η έκπτωση πρέπει να είναι από 0% έως 100%.");
      return;
    }

    const confirmed = window.confirm(
      `Εφαρμογή markup ${markup}%${discount > 0 ? ` και έκπτωσης ${discount}%` : " χωρίς έκπτωση"} στα ${offerIds.length} προϊόντα της τρέχουσας σελίδας; `
      + "Κάθε προϊόν θα αποθηκευτεί ως manual pricing override με την authoritative supplier buying price. Προϊόντα χωρίς έγκυρη buying price θα παραμείνουν αμετάβλητα."
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage("");
    try {
      const token = await csrfToken();
      const errors = await runBounded(offerIds, async (offerId) => {
        const response = await fetch("/api/vendor/catalog/price", {
          method: "PUT",
          headers: { "content-type": "application/json", "x-csrf-token": token },
          body: JSON.stringify({
            offerId,
            pricingMode: "calculated",
            markupType: "percent",
            markupValue: markup,
            discountType: discount > 0 ? "percent" : null,
            discountValue: discount > 0 ? discount : null
          })
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(payload.error ?? `Η τιμολόγηση απέτυχε για ${offerId}.`);
        }
      });

      const succeeded = offerIds.length - errors.length;
      setMessage(errors.length
        ? `Pricing overrides αποθηκεύτηκαν σε ${succeeded}/${offerIds.length}. ${errors.length} προϊόντα παρέμειναν αμετάβλητα (π.χ. χωρίς έγκυρη supplier buying price ή λόγω υπάρχοντος pricing safety gate).`
        : `Pricing overrides αποθηκεύτηκαν σε ${succeeded}/${offerIds.length} προϊόντα.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η μαζική τιμολόγηση απέτυχε.");
    } finally {
      setBusy(false);
    }
  }

  async function applyPublicFields(resetToSupplierDefaults = false) {
    if (!offerIds.length) return;
    const confirmed = window.confirm(resetToSupplierDefaults
      ? `Επαναφορά των public-field overrides για τα ${offerIds.length} προϊόντα της τρέχουσας σελίδας; Κάθε προϊόν θα χρησιμοποιεί ξανά τα supplier public-field defaults.`
      : `Εφαρμογή των επιλεγμένων public fields στα ${offerIds.length} προϊόντα της τρέχουσας σελίδας; Θα δημιουργηθεί per-product field override μόνο για αυτά τα προϊόντα.`);
    if (!confirmed) return;

    setBusy(true);
    setMessage("");
    try {
      const token = await csrfToken();
      const errors = await runBounded(offerIds, async (offerId) => {
        const response = await fetch("/api/vendor/dropshipping/presentation", {
          method: "PUT",
          headers: { "content-type": "application/json", "x-csrf-token": token },
          body: JSON.stringify(resetToSupplierDefaults
            ? { action: "reset-product", offerId }
            : { action: "save-product", offerId, fields: publicFields })
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(payload.error ?? `Η αλλαγή public fields απέτυχε για ${offerId}.`);
        }
      });

      const succeeded = offerIds.length - errors.length;
      setMessage(errors.length
        ? `${resetToSupplierDefaults ? "Public-field defaults επανήλθαν" : "Public-field overrides αποθηκεύτηκαν"} σε ${succeeded}/${offerIds.length}. ${errors.length} προϊόντα παρέμειναν αμετάβλητα λόγω των υπαρχόντων ownership/presentation ελέγχων.`
        : `${resetToSupplierDefaults ? "Public-field defaults επανήλθαν" : "Public-field overrides αποθηκεύτηκαν"} σε ${succeeded}/${offerIds.length} προϊόντα.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η μαζική αλλαγή public fields απέτυχε.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="workspace-queue-card" style={{ marginBottom: 14 }}>
    <div className="workspace-queue-head">
      <div>
        <strong>Bulk actions · τρέχουσα σελίδα</strong>
        <small>{offerIds.length} προϊόντα στη σελίδα {page} · {resultCount} συνολικά αποτελέσματα{activeFilterCount ? ` · ${activeFilterCount} ενεργά φίλτρα` : ""}</small>
      </div>
      <span className="vendor-merchant-status">έως 50 / σελίδα</span>
    </div>
    <p style={{ marginTop: 10 }}>Χρησιμοποίησε πρώτα αναζήτηση/φίλτρα και μετά εφάρμοσε την ενέργεια μόνο στα προϊόντα που βλέπεις τώρα. Δεν αλλάζει ολόκληρο τον supplier κατά λάθος και δεν παρακάμπτει eligibility, moderation, recall/suppression, supplier ή pricing checks.</p>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginBottom: 10 }}>
      <label><small>Bulk markup %</small><input type="number" min="0" max="1000" step="0.1" value={markupPercent} disabled={busy} onChange={(event) => setMarkupPercent(Number(event.target.value))} style={{ width: "100%" }} /></label>
      <label><small>Bulk discount %</small><input type="number" min="0" max="100" step="0.1" value={discountPercent} disabled={busy} onChange={(event) => setDiscountPercent(Number(event.target.value))} style={{ width: "100%" }} /></label>
      <div style={{ display: "flex", alignItems: "end" }}><button className="button button-secondary" type="button" disabled={busy || !offerIds.length} onClick={applyPricing}>Apply pricing to current page</button></div>
    </div>
    <small style={{ display: "block", marginBottom: 10 }}>Η buying price δεν αποστέλλεται από τον browser: το υπάρχον pricing API την ξαναδιαβάζει από το owned supplier offer πριν υπολογίσει την τελική τιμή. Η ενέργεια δημιουργεί manual pricing override ανά προϊόν.</small>

    <details style={{ marginBottom: 12 }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>Bulk public fields · current page</summary>
      <p style={{ marginTop: 8 }}>Ορίζει ποια supplier/product identifiers και τεχνικά πεδία επιτρέπεται να εμφανίζονται δημόσια για τα προϊόντα της τρέχουσας filtered σελίδας. Τα buying-price και λοιπά ιδιωτικά supplier δεδομένα δεν επηρεάζονται.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginTop: 10 }}>
        <label><input type="checkbox" checked={publicFields.model} disabled={busy} onChange={(event) => setPublicField("model", event.target.checked)} /> Model</label>
        <label><input type="checkbox" checked={publicFields.mpn} disabled={busy} onChange={(event) => setPublicField("mpn", event.target.checked)} /> MPN</label>
        <label><input type="checkbox" checked={publicFields.gtin} disabled={busy} onChange={(event) => setPublicField("gtin", event.target.checked)} /> GTIN/EAN</label>
        <label><input type="checkbox" checked={publicFields.technicalAttributes} disabled={busy} onChange={(event) => setPublicField("technicalAttributes", event.target.checked)} /> Technical</label>
        <label><input type="checkbox" checked={publicFields.supplierSku} disabled={busy} onChange={(event) => setPublicField("supplierSku", event.target.checked)} /> Supplier SKU</label>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button className="button button-secondary" type="button" disabled={busy || !offerIds.length} onClick={() => applyPublicFields(false)}>Apply fields to current page</button>
        <button className="button button-secondary" type="button" disabled={busy || !offerIds.length} onClick={() => applyPublicFields(true)}>Use supplier field defaults</button>
      </div>
      <small style={{ display: "block", marginTop: 8 }}>Η εφαρμογή δημιουργεί per-product presentation overrides μέσω του υπάρχοντος Dropshipping presentation API. Το reset αφαιρεί μόνο αυτά τα field overrides και επαναφέρει τα supplier defaults.</small>
    </details>

    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className="button" type="button" disabled={busy || !offerIds.length} onClick={() => execute("publish")}>Publish current page</button>
      <button className="button button-secondary" type="button" disabled={busy || !offerIds.length} onClick={() => execute("hide")}>Hide current page</button>
      <button className="button button-secondary" type="button" disabled={busy || !offerIds.length} onClick={() => execute("reset")}>Reset current page</button>
    </div>
    {message ? <small role="status" style={{ display: "block", marginTop: 8 }}>{message}</small> : null}
  </div>;
}