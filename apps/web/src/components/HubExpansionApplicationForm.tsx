"use client";

import { useState, type FormEvent } from "react";
import type { ExpansionHub } from "../lib/expansion-hubs";
import type { HubExpansionPlanCode } from "../lib/hub-expansion-plans";
import styles from "./HubExpansionApplicationForm.module.css";

type HubOption = Pick<ExpansionHub, "id" | "slug" | "nameEl" | "regionEl">;

type Props = Readonly<{
  hubs: readonly HubOption[];
  initialHubSlug?: string;
  planCode: HubExpansionPlanCode;
}>;

type Receipt = Readonly<{
  reference: string;
  status: "pending";
  hubName: string;
  planCode: HubExpansionPlanCode;
  paymentRequired: false;
  message: string;
}>;

const categories = [
  "Εργαλεία & οικοδομικά",
  "Σπίτι & διακόσμηση",
  "Ηλεκτρικά & τεχνολογία",
  "Μόδα & υπόδηση",
  "Ομορφιά & προσωπική φροντίδα",
  "Παιδί & παιχνίδι",
  "Βιβλία & χαρτικά",
  "Δώρα & ειδικά είδη",
  "Αθλητικά & outdoor",
  "Αυτοκίνητο & μοτοσυκλέτα",
  "Άλλη μη διατροφική λιανική"
] as const;

export function HubExpansionApplicationForm({ hubs, initialHubSlug, planCode }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload: Record<string, unknown> = Object.fromEntries(data.entries());
    payload.acceptedAccuracy = data.get("acceptedAccuracy") === "on";
    payload.acceptedPrivacy = data.get("acceptedPrivacy") === "on";
    payload.acceptedProspectStatus = data.get("acceptedProspectStatus") === "on";

    try {
      const response = await fetch("/api/hub-prospect-application", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json() as Partial<Receipt> & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Η αίτηση δεν καταχωρίστηκε.");
      if (!result.reference || result.status !== "pending" || !result.hubName || !result.planCode) {
        throw new Error("Η αίτηση καταχωρίστηκε αλλά δεν επιστράφηκε έγκυρη απόδειξη.");
      }
      setReceipt({
        reference: result.reference,
        status: "pending",
        hubName: result.hubName,
        planCode: result.planCode,
        paymentRequired: false,
        message: result.message ?? "Η αίτηση καταχωρίστηκε."
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η αίτηση δεν καταχωρίστηκε.");
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return <div className={styles.receipt} role="status">
      <span className={styles.receiptMark}>✓</span>
      <div>
        <div className={styles.receiptEyebrow}>Η αίτηση καταχωρίστηκε</div>
        <h2>{receipt.hubName} · {receipt.planCode.toUpperCase()}</h2>
        <p>{receipt.message}</p>
        <div className={styles.reference}>Αριθμός αναφοράς <strong>{receipt.reference}</strong></div>
        <p className={styles.receiptNote}>Δεν έγινε χρέωση και δεν δημιουργήθηκε ενεργός vendor λογαριασμός. Θα επικοινωνήσουμε για verification και τα επόμενα βήματα του HUB.</p>
        <a className="button button-secondary" href="/hubs/join">Επιστροφή στα HUB</a>
      </div>
    </div>;
  }

  return <form className={styles.form} onSubmit={submit}>
    <input type="hidden" name="planCode" value={planCode} />
    <div className={styles.honeypot} aria-hidden="true"><label>Website<input name="companyWebsiteCheck" tabIndex={-1} autoComplete="off" /></label></div>

    <fieldset>
      <legend>1. HUB και επιχείρηση</legend>
      <div className={styles.grid}>
        <label className={styles.full}>HUB / πόλη <span>*</span>
          <select name="hubSlug" required defaultValue={initialHubSlug ?? ""}>
            <option value="" disabled>Επίλεξε το HUB της επιχείρησης…</option>
            {hubs.map((hub) => <option value={hub.slug} key={hub.id}>{hub.nameEl} · {hub.regionEl}</option>)}
          </select>
        </label>
        <label>Εμπορική ονομασία <span>*</span><input name="businessName" required maxLength={120} autoComplete="organization" /></label>
        <label>Νομική επωνυμία<input name="legalName" maxLength={160} /></label>
        <label>Ονοματεπώνυμο υπευθύνου <span>*</span><input name="contactName" required maxLength={120} autoComplete="name" /></label>
        <label>Κύρια κατηγορία <span>*</span><select name="primaryCategory" required defaultValue=""><option value="" disabled>Επίλεξε κατηγορία…</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
      </div>
    </fieldset>

    <fieldset>
      <legend>2. Επικοινωνία και τοποθεσία</legend>
      <div className={styles.grid}>
        <label>Email <span>*</span><input name="email" type="email" required maxLength={160} autoComplete="email" /></label>
        <label>Τηλέφωνο <span>*</span><input name="phone" type="tel" required maxLength={32} autoComplete="tel" /></label>
        <label className={styles.full}>Διεύθυνση καταστήματος <span>*</span><input name="addressLine" required maxLength={180} autoComplete="street-address" /></label>
        <label>Ταχυδρομικός κώδικας <span>*</span><input name="postalCode" required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} autoComplete="postal-code" /></label>
        <label>Υφιστάμενο website / e-shop<input name="websiteUrl" type="url" maxLength={240} placeholder="https://…" /></label>
      </div>
    </fieldset>

    <fieldset>
      <legend>3. Σημερινή εμπορική παρουσία</legend>
      <div className={styles.grid}>
        <label className={styles.full}>Πού πουλάς σήμερα;<textarea name="currentSalesChannels" maxLength={600} rows={3} placeholder="π.χ. φυσικό κατάστημα, δικό μας e-shop, Skroutz, social media…" /></label>
        <label className={styles.full}>Σημειώσεις / τι θα ήθελες από το ΚΟΝΤΑ ΜΟΥ;<textarea name="notes" maxLength={1500} rows={4} /></label>
      </div>
    </fieldset>

    <div className={styles.consentBox}>
      <label><input type="checkbox" name="acceptedAccuracy" required /> <span>Επιβεβαιώνω ότι τα στοιχεία της επιχείρησης είναι ακριβή και μπορώ να εκπροσωπώ ή να υποβάλω ενδιαφέρον για αυτήν.</span></label>
      <label><input type="checkbox" name="acceptedProspectStatus" required /> <span>Κατανοώ ότι αυτή είναι αίτηση prospect για HUB επέκτασης και δεν ενεργοποιεί αυτόματα vendor account, πωλήσεις, συνδρομή ή χρέωση.</span></label>
      <label><input type="checkbox" name="acceptedPrivacy" required /> <span>Συμφωνώ με την επεξεργασία των στοιχείων για έλεγχο, επικοινωνία και προετοιμασία της συνεργασίας σύμφωνα με την πολιτική απορρήτου.</span></label>
    </div>

    {error && <div className={styles.error} role="alert">{error}</div>}
    <button className={`button ${styles.submit}`} type="submit" disabled={busy}>{busy ? "Καταχώριση…" : planCode === "claim" ? "Υποβολή δωρεάν CLAIM" : `Υποβολή ενδιαφέροντος · ${planCode.toUpperCase()}`}</button>
    <p className={styles.noPayment}>Δεν ζητούνται στοιχεία κάρτας. Για εμπορικό πλάνο, οποιαδήποτε χρέωση συζητείται μόνο μετά το verification και πριν από την ενεργοποίηση.</p>
  </form>;
}
