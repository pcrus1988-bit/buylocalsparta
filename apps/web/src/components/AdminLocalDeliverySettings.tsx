"use client";

import { useState, type FormEvent } from "react";
import type { AdminLocalDeliverySettings as Settings } from "../lib/admin-local-delivery-service";
import styles from "./DeliveryOperations.module.css";

function euros(minor?: number): string {
  return minor == null ? "" : (minor / 100).toFixed(2);
}

function minor(value: string, label: string, optional = false): number | undefined {
  const trimmed = value.trim().replace(",", ".");
  if (optional && !trimmed) return undefined;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${label}: βάλε έγκυρο ποσό.`);
  return Math.round(amount * 100);
}

export function AdminLocalDeliverySettings({ initial, csrfToken }: { initial: Settings; csrfToken: string }) {
  const [data, setData] = useState(initial);
  const [active, setActive] = useState(initial.active);
  const [postcodes, setPostcodes] = useState(initial.postcodePrefixes.join(", "));
  const [charge, setCharge] = useState(euros(initial.baseChargeMinor));
  const [freeAbove, setFreeAbove] = useState(euros(initial.freeAboveSubtotalMinor));
  const [minimum, setMinimum] = useState(euros(initial.minimumSubtotalMinor));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setNotice("");
    try {
      const postcodePrefixes = [...new Set(postcodes.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean))];
      if (active && postcodePrefixes.length === 0) throw new Error("Χρειάζεται τουλάχιστον ένας ΤΚ ή prefix όταν η τοπική παράδοση είναι ενεργή.");
      const response = await fetch("/api/admin/delivery/local-settings", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          active,
          postcodePrefixes,
          baseChargeMinor: minor(charge, "Χρέωση παράδοσης"),
          freeAboveSubtotalMinor: minor(freeAbove, "Δωρεάν πάνω από", true),
          minimumSubtotalMinor: minor(minimum, "Ελάχιστη αξία", true),
        }),
      });
      const body = await response.json() as Settings & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Η ρύθμιση παράδοσης δεν αποθηκεύτηκε.");
      setData(body);
      setActive(body.active);
      setPostcodes(body.postcodePrefixes.join(", "));
      setCharge(euros(body.baseChargeMinor));
      setFreeAbove(euros(body.freeAboveSubtotalMinor));
      setMinimum(euros(body.minimumSubtotalMinor));
      setNotice("Οι ρυθμίσεις τοπικής παράδοσης αποθηκεύτηκαν και εφαρμόστηκαν στα ενεργά σημεία πώλησης.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Η ρύθμιση παράδοσης δεν αποθηκεύτηκε.");
    } finally {
      setBusy(false);
    }
  }

  return <section className={styles.card}>
    <div className={styles.sectionTitle}>
      <div><div className={styles.eyebrow}>Local delivery · Market default</div><h2>Κάλυψη & βασική χρέωση</h2></div>
      <span className={styles.status}>{data.active ? "ACTIVE" : "PAUSED"}</span>
    </div>
    <p className={styles.muted}>Αυτό είναι το operational fallback της ΚΟΝΤΑ ΜΟΥ. Όλα τα προϊόντα είναι επιλέξιμα για τοπική παράδοση από προεπιλογή, αλλά ο vendor μπορεί ανά προϊόν να ορίσει «μόνο παραλαβή». Η κάλυψη ΤΚ και η βασική χρέωση παραμένουν υπό Admin control.</p>
    <div className={styles.toolbar}>
      <span className={styles.badge}>Covered {data.coveredVendorLocations}/{data.activeVendorLocations} active locations</span>
      <span className={styles.badge}>ΤΚ: {data.postcodePrefixes.join(", ") || "—"}</span>
      <span className={styles.badge}>Base: {(data.baseChargeMinor / 100).toFixed(2)} €</span>
    </div>
    <form className={styles.form} onSubmit={(event) => void save(event)}>
      <label className={styles.field}><span>Τοπική παράδοση</span><select value={active ? "active" : "paused"} onChange={(event) => setActive(event.target.value === "active")}><option value="active">Ενεργή</option><option value="paused">Παύση</option></select></label>
      <div className={styles.formGrid}>
        <label className={styles.field}><span>ΤΚ / prefixes</span><input value={postcodes} onChange={(event) => setPostcodes(event.target.value)} placeholder="23100 ή 231, 230" /><small className={styles.muted}>Χώρισε με κόμμα. Prefix 231 καλύπτει κάθε ΤΚ που αρχίζει από 231.</small></label>
        <label className={styles.field}><span>Βασική χρέωση (€)</span><input inputMode="decimal" value={charge} onChange={(event) => setCharge(event.target.value)} /></label>
        <label className={styles.field}><span>Δωρεάν παράδοση πάνω από (€)</span><input inputMode="decimal" value={freeAbove} onChange={(event) => setFreeAbove(event.target.value)} placeholder="προαιρετικό" /></label>
        <label className={styles.field}><span>Ελάχιστη αξία για παράδοση (€)</span><input inputMode="decimal" value={minimum} onChange={(event) => setMinimum(event.target.value)} placeholder="προαιρετικό" /></label>
      </div>
      <div className={styles.actions}><button className={styles.button} type="submit" disabled={busy}>{busy ? "Αποθήκευση…" : "Αποθήκευση & εφαρμογή"}</button></div>
    </form>
    {notice && <div className={styles.notice}>{notice}</div>}
  </section>;
}
