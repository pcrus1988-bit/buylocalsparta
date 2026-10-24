"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import styles from "./ResearchRawDataRequest.module.css";

const ENDPOINT = "/api/research/greek-retail-2026/raw-data-request";

export function ResearchRawDataRequest() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [acceptProcessing, setAcceptProcessing] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    const website = new FormData(event.currentTarget).get("website");
    setStatus("sending");
    setError("");
    try {
      const result = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ email, message, acceptProcessing, website: typeof website === "string" ? website : "" })
      });
      if (!result.ok) {
        const payload = await result.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "Δεν ήταν δυνατή η αποστολή. Δοκιμάστε ξανά.");
      }
      setStatus("sent");
      setEmail("");
      setMessage("");
      setAcceptProcessing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η αποστολή.");
      setStatus("error");
    }
  }

  return <section className={styles.section} id="request-anonymized-data" aria-labelledby="raw-data-title">
    <div className={styles.intro}>
      <span className={styles.eyebrow}>KONTA MOY RESEARCH · ΑΝΟΙΧΤΗ ΕΠΙΣΤΗΜΗ</span>
      <h2 id="raw-data-title">Ζητήστε πρόσβαση στα ανωνυμοποιημένα δεδομένα.</h2>
      <p>Θέλουμε τα ευρήματα του «Ελληνικό Λιανεμπόριο 2026» να μπορούν να αξιοποιηθούν από ερευνητές, δημοσιογράφους, φορείς και κάθε ενδιαφερόμενο.</p>
      <p>Η πρόσβαση σε κατάλληλα ανωνυμοποιημένα πρωτογενή δεδομένα εξετάζεται <strong>κατόπιν αιτήματος και χειροκίνητης αξιολόγησης</strong>. Δεν υπάρχει αυτόματη λήψη. Θα ελέγξουμε αν το αιτούμενο σύνολο μπορεί να διατεθεί με ασφάλεια, καθώς και τους όρους χρήσης και αναφοράς της πηγής.</p>
      <div className={styles.process}><span>01 · Αίτημα</span><span>02 · Έλεγχος προστασίας δεδομένων</span><span>03 · Προσωπική απάντηση</span></div>
      <p className={styles.small}>Η υποβολή δεν εγγυάται πρόσβαση. Ελεύθερο κείμενο, ακριβείς ταχυδρομικοί κώδικες και αναγνωριστικά δεν θα διατίθενται χωρίς τον απαιτούμενο έλεγχο κινδύνου επαναταυτοποίησης.</p>
    </div>
    <div className={styles.formCard}>
      <h3>Αίτημα διάθεσης δεδομένων</h3>
      <p>Περιγράψτε τι χρειάζεστε και για ποιον σκοπό. Το αίτημα αποστέλλεται στην ομάδα της έρευνας.</p>
      {status === "sent" ? <div className={styles.success} role="status">
        <strong>Το αίτημά σας στάλθηκε.</strong>
        <span>Θα εξεταστεί χειροκίνητα. Η ομάδα KONTA MOY μπορεί να επικοινωνήσει μαζί σας στο email που δηλώσατε.</span>
        <button type="button" onClick={() => setStatus("idle")}>Νέο αίτημα</button>
      </div> : <form onSubmit={onSubmit} className={styles.form}>
        <label htmlFor="research-data-request-email">Email επικοινωνίας <span aria-hidden="true">*</span></label>
        <input id="research-data-request-email" type="email" inputMode="email" autoComplete="email"
          required maxLength={254} value={email} onChange={e => setEmail(e.target.value)}
          placeholder="name@example.com" disabled={status === "sending"} />
        <label htmlFor="research-data-request-message">Μήνυμα και σκοπός χρήσης <span aria-hidden="true">*</span></label>
        <textarea id="research-data-request-message" required minLength={20} maxLength={2500} rows={5}
          value={message} onChange={e => setMessage(e.target.value)} disabled={status === "sending"}
          placeholder="Πείτε μας ποια δεδομένα σας ενδιαφέρουν και πώς σκοπεύετε να τα χρησιμοποιήσετε…" />
        <div className={styles.honeypot} aria-hidden="true">
          <label htmlFor="research-data-request-website">Website</label>
          <input name="website" id="research-data-request-website" type="text" tabIndex={-1} autoComplete="off" />
        </div>
        <label className={styles.agreement}>
          <input type="checkbox" checked={acceptProcessing} onChange={e => setAcceptProcessing(e.target.checked)}
            required disabled={status === "sending"} />
          <span>Κατανοώ ότι τα στοιχεία επικοινωνίας και το μήνυμά μου θα χρησιμοποιηθούν μόνο για τη διαχείριση αυτού του αιτήματος, σύμφωνα με την <Link href="/research/privacy">ενημέρωση προστασίας δεδομένων</Link>.</span>
        </label>
        {status === "error" && <p className={styles.error} role="alert">{error}</p>}
        <button type="submit" className={styles.submit} disabled={status === "sending"}>
          {status === "sending" ? "Αποστολή…" : "Αποστολή αιτήματος →"}
        </button>
        <small>Η αποστολή δεν παρέχει πρόσβαση σε δεδομένα και δεν σας εγγράφει σε ενημερωτική λίστα.</small>
      </form>}
    </div>
  </section>;
}
