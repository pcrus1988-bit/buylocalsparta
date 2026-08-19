"use client";

import { useState } from "react";
import styles from "./VendorStorefront.module.css";

type AskLocalResponse = Readonly<{
  request?: Readonly<{ id: string }>;
  error?: string;
}>;

export function VendorAskLocalPanel({ vendorId, vendorName, csrfToken }: {
  vendorId: string;
  vendorName: string;
  csrfToken?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!csrfToken) {
    const next = `/ask-local?vendor=${encodeURIComponent(vendorId)}`;
    return (
      <div className={styles.askLoginCard}>
        <h3>Συνδέσου για να ρωτήσεις το {vendorName}</h3>
        <p>Το Ask Local είναι ιδιωτικό. Μετά τη σύνδεση, το αίτημα θα παραμείνει δεμένο με το συγκεκριμένο κατάστημα και θα μπορείς να παρακολουθείς την απάντησή του από τον λογαριασμό σου.</p>
        <div className={styles.askLoginActions}>
          <a className="button" href={`/login?next=${encodeURIComponent(next)}`}>Σύνδεση & ερώτηση</a>
          <a className="button button-secondary" href={next}>Άνοιξε το Ask Local</a>
        </div>
      </div>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/account/ask-local", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken
        },
        body: JSON.stringify({
          need: form.get("need"),
          postcode: form.get("postcode"),
          quantity: Number(form.get("quantity")),
          preferredVendorId: vendorId,
          sourceUrl: window.location.href
        })
      });
      const payload = await response.json() as AskLocalResponse;
      if (!response.ok || !payload.request) throw new Error(payload.error ?? "Το αίτημα δεν ολοκληρώθηκε");
      setSuccess(`Το αίτημα ${payload.request.id} στάλθηκε ιδιωτικά στο ${vendorName}.`);
      formElement.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Το αίτημα δεν ολοκληρώθηκε");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.askForm} onSubmit={submit}>
      <label className={styles.askFull}>
        Τι χρειάζεσαι;
        <textarea
          name="need"
          minLength={10}
          maxLength={2000}
          required
          placeholder={`π.χ. Ψάχνω κάτι συγκεκριμένο από το ${vendorName}, μπορείτε να με βοηθήσετε;`}
        />
      </label>
      <label>
        Ταχυδρομικός κώδικας
        <input name="postcode" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} defaultValue="23100" required />
      </label>
      <label>
        Ποσότητα
        <input name="quantity" type="number" min={1} max={99} defaultValue={1} required />
      </label>
      {error && <p className={`${styles.askStatus} ${styles.askError}`} role="alert">{error}</p>}
      {success && <p className={styles.askStatus} role="status">{success}</p>}
      <button className={`button ${styles.askFull}`} type="submit" disabled={busy}>
        {busy ? "Αποστολή…" : `Στείλε ιδιωτικά στο ${vendorName}`}
      </button>
    </form>
  );
}