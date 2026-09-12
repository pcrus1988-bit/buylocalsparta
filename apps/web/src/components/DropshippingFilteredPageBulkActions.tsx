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
        await worker(items[index]);
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
              body: JSON.stringify({ scope: "product", offerId, visible: action === "publish" })
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

  return <div className="workspace-queue-card" style={{ marginBottom: 14 }}>
    <div className="workspace-queue-head">
      <div>
        <strong>Bulk actions · τρέχουσα σελίδα</strong>
        <small>{offerIds.length} προϊόντα στη σελίδα {page} · {resultCount} συνολικά αποτελέσματα{activeFilterCount ? ` · ${activeFilterCount} ενεργά φίλτρα` : ""}</small>
      </div>
      <span className="vendor-merchant-status">έως 50 / σελίδα</span>
    </div>
    <p style={{ marginTop: 10 }}>Χρησιμοποίησε πρώτα αναζήτηση/φίλτρα και μετά εφάρμοσε την ενέργεια μόνο στα προϊόντα που βλέπεις τώρα. Δεν αλλάζει ολόκληρο τον supplier κατά λάθος και δεν παρακάμπτει eligibility, moderation, recall/suppression ή supplier checks.</p>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className="button" type="button" disabled={busy || !offerIds.length} onClick={() => execute("publish")}>Publish current page</button>
      <button className="button button-secondary" type="button" disabled={busy || !offerIds.length} onClick={() => execute("hide")}>Hide current page</button>
      <button className="button button-secondary" type="button" disabled={busy || !offerIds.length} onClick={() => execute("reset")}>Reset current page</button>
    </div>
    {message ? <small role="status" style={{ display: "block", marginTop: 8 }}>{message}</small> : null}
  </div>;
}
