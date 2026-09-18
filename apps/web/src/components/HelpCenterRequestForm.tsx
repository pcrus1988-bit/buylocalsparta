"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import styles from "../app/help/page.module.css";

type SupportCategory = "account" | "order" | "payment" | "return" | "delivery" | "privacy" | "technical" | "other";

const TOPICS: ReadonlyArray<readonly [SupportCategory, string]> = [
  ["order", "Παραγγελία"],
  ["delivery", "Παράδοση / παραλαβή"],
  ["payment", "Πληρωμή"],
  ["return", "Επιστροφή / εγγύηση"],
  ["account", "Λογαριασμός"],
  ["privacy", "Ιδιωτικότητα"],
  ["technical", "Τεχνικό πρόβλημα"],
  ["other", "Κάτι άλλο"]
];

function contextFor(category: SupportCategory, orderReference: string) {
  if (orderReference.trim()) return { contextType: "order", contextId: orderReference.trim(), contextLabel: "Παραγγελία" };
  if (category === "return") return { contextType: "return", contextLabel: "Επιστροφή" };
  if (category === "privacy") return { contextType: "privacy", contextLabel: "Ιδιωτικότητα" };
  if (category === "account") return { contextType: "account", contextLabel: "Λογαριασμός" };
  return { contextType: "other", contextLabel: "Υποστήριξη" };
}

export function HelpCenterRequestForm() {
  const router = useRouter();
  const [category, setCategory] = useState<SupportCategory>("order");
  const [orderReference, setOrderReference] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (subject.trim().length < 3 || message.trim().length < 10) {
      setError("Γράψε ένα σύντομο θέμα και λίγες λεπτομέρειες για να μπορέσουμε να σε βοηθήσουμε.");
      return;
    }

    setBusy(true);
    try {
      const context = contextFor(category, orderReference);
      sessionStorage.setItem("kontamou:help-support-draft", JSON.stringify({
        category,
        subject: subject.trim(),
        message: message.trim(),
        ...context
      }));

      const target = "/account/support?from=help";
      const response = await fetch("/api/account/session", { cache: "no-store" });
      if (response.ok) {
        router.push(target);
      } else {
        router.push(`/login?next=${encodeURIComponent(target)}`);
      }
    } catch {
      setError("Δεν μπορέσαμε να ανοίξουμε την υποστήριξη. Δοκίμασε ξανά.");
      setBusy(false);
    }
  }

  return <form className={styles.supportForm} onSubmit={submit}>
    <div className={styles.formGrid}>
      <label>
        <span>Με τι χρειάζεσαι βοήθεια;</span>
        <select value={category} onChange={(event) => setCategory(event.target.value as SupportCategory)}>
          {TOPICS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </label>
      <label>
        <span>Αριθμός παραγγελίας <small>αν υπάρχει</small></span>
        <input value={orderReference} onChange={(event) => setOrderReference(event.target.value)} maxLength={80} placeholder="π.χ. αριθμός παραγγελίας" />
      </label>
    </div>
    <label>
      <span>Θέμα</span>
      <input value={subject} onChange={(event) => setSubject(event.target.value)} minLength={3} maxLength={240} required placeholder="π.χ. Το tracking δεν έχει ενημερωθεί" />
    </label>
    <label>
      <span>Τι συνέβη;</span>
      <textarea value={message} onChange={(event) => setMessage(event.target.value)} minLength={10} maxLength={4000} required rows={6} placeholder="Πες μας τι έχει συμβεί, τι περίμενες να γίνει και τι χρειάζεσαι από εμάς." />
    </label>
    <div className={styles.formFooter}>
      <p>Αν δεν είσαι συνδεδεμένος, θα σου ζητηθεί πρώτα να συνδεθείς. Το κείμενο που έγραψες θα παραμείνει διαθέσιμο σε αυτή τη συσκευή.</p>
      <button className="button" type="submit" disabled={busy}>{busy ? "Άνοιγμα υποστήριξης…" : "Συνέχεια στην υποστήριξη"}</button>
    </div>
    {error && <p className={styles.formError} role="alert">{error}</p>}
  </form>;
}
