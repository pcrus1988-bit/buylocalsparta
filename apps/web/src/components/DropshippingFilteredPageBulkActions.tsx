"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = Readonly<{
  offerIds: readonly string[];
  resultCount: number;
  page: number;
  activeFilterCount: number;
}>;

type BulkAction = "publish" | "hide" | "reset";

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

    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className="button" type="button" disabled={busy || !offerIds.length} onClick={() => execute("publish")}>Publish current page</button>
      <button className="button button-secondary" type="button" disabled={busy || !offerIds.length} onClick={() => execute("hide")}>Hide current page</button>
      <button className="button button-secondary" type="button" disabled={busy || !offerIds.length} onClick={() => execute("reset")}>Reset current page</button>
    </div>
    {message ? <small role="status" style={{ display: "block", marginTop: 8 }}>{message}</small> : null}
  </div>;
}
