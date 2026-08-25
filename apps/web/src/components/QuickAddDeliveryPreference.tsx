"use client";

import { useEffect, useState } from "react";
import styles from "./QuickAddDeliveryPreference.module.css";

type Choice = "auto" | "delivery" | "pickup";
const COOKIE = "bls_quickadd_delivery";

function readChoice(): Choice {
  if (typeof document === "undefined") return "auto";
  const value = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.split("=")[1];
  return value === "delivery" || value === "pickup" ? value : "auto";
}

function writeChoice(choice: Choice) {
  if (choice === "auto") {
    document.cookie = `${COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }
  document.cookie = `${COOKIE}=${choice}; Path=/; Max-Age=2592000; SameSite=Lax`;
}

export function QuickAddDeliveryPreference() {
  const [choice, setChoice] = useState<Choice>("auto");
  useEffect(() => setChoice(readChoice()), []);

  return <section className={styles.card} aria-label="Ρύθμιση τοπικής παράδοσης Quick Add">
    <div className={styles.copy}>
      <strong>Διάθεση προϊόντος</strong>
      <span>Νέα προϊόντα είναι από προεπιλογή διαθέσιμα για παραλαβή και τοπική παράδοση. Σε υπάρχον προϊόν, «Χωρίς αλλαγή» διατηρεί την τρέχουσα ρύθμιση.</span>
    </div>
    <select className={styles.select} value={choice} onChange={(event) => { const next = event.target.value as Choice; setChoice(next); writeChoice(next); }}>
      <option value="auto">Χωρίς αλλαγή / default</option>
      <option value="delivery">Παραλαβή + τοπική παράδοση</option>
      <option value="pickup">Μόνο παραλαβή</option>
    </select>
  </section>;
}
